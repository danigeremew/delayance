//! Optional host-owned chrome and sidebar reservations. Standalone layout is unchanged.
use crate::{WordApp, theme::Tokens};
use egui::{Color32, Rect, Ui};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HostTheme {
    background: String,
    panel: String,
    text: String,
    muted: String,
    border: String,
    accent: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HostLayout {
    pub left: f32,
    pub right: f32,
    pub theme: HostTheme,
}

impl HostLayout {
    pub fn parse(value: Value) -> Result<Self, String> {
        let layout: Self = serde_json::from_value(value).map_err(|_| "Invalid host layout")?;
        if ![layout.left, layout.right].iter().all(|n| n.is_finite() && (0.0..=100_000.0).contains(n)) || layout.theme.colors().is_none() {
            return Err("Invalid host layout".into());
        }
        Ok(layout)
    }
}

fn color(value: &str) -> Option<Color32> {
    let hex = value.strip_prefix('#')?;
    if hex.len() != 6 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let n = u32::from_str_radix(hex, 16).ok()?;
    Some(Color32::from_rgb((n >> 16) as u8, (n >> 8) as u8, n as u8))
}

impl HostTheme {
    fn colors(&self) -> Option<[Color32; 6]> {
        Some([color(&self.background)?, color(&self.panel)?, color(&self.text)?, color(&self.muted)?, color(&self.border)?, color(&self.accent)?])
    }
    pub fn install(&self, ctx: &egui::Context) {
        let Some([background, panel, text, muted, border, accent]) = self.colors() else { return };
        let mut tokens = Tokens::light();
        tokens.title_bar = background;
        tokens.ribbon = panel;
        tokens.tab_strip = background;
        tokens.status_bar = background;
        tokens.panel = panel;
        tokens.menu = panel;
        tokens.text = text;
        tokens.icon = muted;
        tokens.text_dim = muted;
        tokens.group_label = muted;
        tokens.border = border;
        tokens.accent = accent;
        tokens.accent_text = accent;
        tokens.checked = accent.gamma_multiply(0.15);
        ctx.data_mut(|data| data.insert_temp(egui::Id::new("host_theme"), tokens));
        ctx.global_style_mut(|style| {
            style.visuals = crate::theme::visuals(&tokens);
            style.visuals.override_text_color = Some(text);
            style.visuals.panel_fill = panel;
            style.visuals.window_fill = panel;
            style.visuals.selection.bg_fill = accent;
            style.visuals.window_stroke.color = border;
        });
    }
}

/// Embedded navigation uses the host's lighter text hierarchy.
pub fn tab_font(active: bool, size: f32) -> egui::FontId {
    if active { crate::theme::medium(size) } else { crate::theme::regular(size) }
}

pub struct Preview {
    pub id: String,
    pub text: String,
    pub original: wordcraft_engine::Session,
    pub start: wordcraft_doc::Pos,
    pub end: wordcraft_doc::Pos,
    pub decision: Option<bool>,
}

pub struct Embedded {
    pub preview: Option<Preview>,
    preview_controls: Option<(Rect, Rect)>,
    pub host: Option<HostLayout>,
    pub snapshot: Value,
    center: Rect,
    top: f32,
    bottom: f32,
}

impl Default for Embedded {
    fn default() -> Self {
        Self { preview_controls: None, preview: None, host: None, snapshot: Value::Null, center: Rect::ZERO, top: 0.0, bottom: 0.0 }
    }
}

/// Convert actual native geometry to CSS pixels (independent of device pixel ratio).
fn css_rect(rect: Rect, screen: Rect, scale: f32) -> Value {
    let rect = rect.intersect(screen);
    json!({"x": ((rect.min.x - screen.min.x) * scale).max(0.0), "y": ((rect.min.y - screen.min.y) * scale).max(0.0), "width": (rect.width() * scale).max(0.0), "height": (rect.height() * scale).max(0.0)})
}

fn reservation(width: f32, scale: f32, available: f32) -> f32 {
    if !width.is_finite() || !scale.is_finite() || scale <= 0.0 {
        return 0.0;
    }
    (width / scale).clamp(0.0, available.max(0.0))
}

/// Called after the full-width ribbon/status bar, before native document panes.
pub fn reserve(app: &mut WordApp, ui: &mut Ui) {
    let Some(embedded) = &mut app.embedded else { return };
    let screen = ui.ctx().content_rect();
    let scale = ui.ctx().zoom_factor();
    let body = ui.available_rect_before_wrap();
    embedded.top = (body.min.y - screen.min.y).max(0.0) * scale;
    embedded.bottom = (screen.max.y - body.max.y).max(0.0) * scale;
    if let Some(host) = &embedded.host {
        for (id, width, left) in [("host_left", host.left, true), ("host_right", host.right, false)] {
            let width = reservation(width, scale, ui.available_width());
            if width > 0.0 {
                let panel = if left { egui::Panel::left(id) } else { egui::Panel::right(id) };
                // Match host panel backgrounds beneath native menu shadows.
                panel.exact_size(width).resizable(false).frame(egui::Frame::NONE.fill(Tokens::get(ui.ctx()).panel)).show(ui, |_| {});
            }
        }
    }
    embedded.center = ui.available_rect_before_wrap();
}

/// Apply one text revision as one undoable native operation, independent of typing preferences.
pub fn apply_text(session: &mut wordcraft_engine::Session, text: &str) -> Result<Value, String> {
    session.close_typing();
    let overtype = session.prefs.overtype;
    let replaces = session.prefs.typing_replaces_selection;
    session.prefs.overtype = false;
    session.prefs.typing_replaces_selection = true;
    let result = session.run("text.insert", &json!({"text": text, "raw": true})).map_err(|e| e.to_string());
    session.close_typing();
    session.prefs.overtype = overtype;
    session.prefs.typing_replaces_selection = replaces;
    result
}

pub fn stage_preview(app: &mut WordApp, id: String, text: String) -> Result<(), String> {
    if app.embedded.as_ref().is_none_or(|e| e.preview.is_some()) {
        return Err("Resolve the current preview first".into());
    }
    let mut provisional = wordcraft_engine::Session::new(app.session.doc.clone());
    provisional.sel = app.session.sel.clone();
    provisional.view = app.session.view.clone();
    provisional.prefs = app.session.prefs.clone();
    provisional.pending = app.session.pending.clone();
    provisional.author = app.session.author.clone();
    let start = provisional.sel.ordered().0;
    apply_text(&mut provisional, &text)?;
    let end = provisional.sel.focus.clone();
    provisional.run("review.restrict", &json!({"mode": "readOnly"})).map_err(|e| e.to_string())?;
    provisional.dirty = false;
    let original = std::mem::replace(&mut app.session, provisional);
    let embedded = app.embedded.as_mut().ok_or("Embedded editor required")?;
    embedded.preview = Some(Preview { id, text, original, start, end, decision: None });
    Ok(())
}

pub fn resolve_preview(app: &mut WordApp, id: &str, accept: bool) -> Result<Value, String> {
    let embedded = app.embedded.as_mut().ok_or("Embedded editor required")?;
    let pending = embedded.preview.as_mut().ok_or("No AI preview is open")?;
    if pending.id != id {
        return Err("AI preview changed".into());
    }
    // Keep the provisional view available if the native operation is refused.
    let result = if accept { apply_text(&mut pending.original, &pending.text)? } else { json!({}) };
    let pending = embedded.preview.take().ok_or("No AI preview is open")?;
    app.session = pending.original;
    app.canvas.want_focus = true;
    app.canvas.scroll_to_caret = true;
    Ok(result)
}

/// Paint the provisional range in the native document's own geometry.
pub fn preview(app: &mut WordApp, ui: &Ui) {
    if let Some(embedded) = &mut app.embedded {
        embedded.preview_controls = None;
    }
    let Some(pending) = app.embedded.as_ref().and_then(|e| e.preview.as_ref()) else { return };
    let start = pending.start.clone();
    let end = pending.end.clone();
    let layout = app.session.layout();
    let Some(clip) = app.canvas.canvas_rect else { return };
    let painter = ui.ctx().layer_painter(egui::LayerId::new(egui::Order::Foreground, egui::Id::new("ai_preview_highlight"))).with_clip_rect(clip);
    let mut anchor = None;
    for (pi, r) in layout.selection_rects(&app.session.doc, &start, &end, app.session.page_hint) {
        if let (Some(pr), Some(page)) = (app.canvas.page_rects.get(pi), layout.pages.get(pi)) {
            let scale = crate::canvas::page_screen_scale(*pr, page, app.canvas.scale);
            let rect = Rect::from_min_size(egui::pos2(pr.min.x + r.x * scale, pr.min.y + r.y * scale), egui::vec2(r.w * scale, r.h * scale));
            painter.rect_filled(rect, 2.0, Color32::from_rgba_unmultiplied(68, 160, 112, 55));
            if anchor.is_none() && rect.intersects(clip) {
                anchor = Some(rect);
            }
        }
    }
    // Keep the decision controls reachable even when the range starts above the viewport.
    let rect = anchor.unwrap_or(clip);
    let at = egui::pos2((rect.right() - 88.0).clamp(clip.left(), (clip.right() - 100.0).max(clip.left())), (rect.top() - 34.0).max(clip.top() + 4.0));
    let mut decision = None;
    let mut controls = None;
    egui::Area::new(egui::Id::new("ai_preview_actions")).order(egui::Order::Foreground).fixed_pos(at).show(ui.ctx(), |ui| {
        egui::Frame::popup(ui.style()).show(ui, |ui| {
            ui.horizontal(|ui| {
                let accept = ui.button("✓").on_hover_text("Accept AI text");
                let discard = ui.button("×").on_hover_text("Discard AI text");
                accept.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, "Accept AI text"));
                discard.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, "Discard AI text"));
                controls = Some((accept.rect, discard.rect));
                if accept.clicked() {
                    decision = Some(true);
                }
                if discard.clicked() {
                    decision = Some(false);
                }
            });
        });
    });
    if let Some(embedded) = &mut app.embedded {
        embedded.preview_controls = controls;
        if let Some(pending) = &mut embedded.preview {
            pending.decision = decision;
        }
    }
}

/// Publish native overlay areas so host panels cannot cover menus or dialogs.
pub fn finish(app: &mut WordApp, ui: &Ui) {
    let blocking = app.ui.backstage || app.dialog.is_some() || app.colors.is_some();
    let Some(embedded) = &mut app.embedded else { return };
    let ctx = ui.ctx();
    let screen = ctx.content_rect();
    let scale = ctx.zoom_factor();
    let mut layers =
        ctx.memory(|m| m.areas().visible_layer_ids().into_iter().filter(|layer| layer.order != egui::Order::Background).collect::<Vec<_>>());
    layers.sort_by_key(|layer| format!("{layer:?}"));
    let overlays = layers
        .into_iter()
        .take(128)
        .filter_map(|layer| {
            let rect = ctx.memory(|m| m.area_rect(layer.id))?;
            let rect = ctx.layer_transform_to_global(layer).map_or(rect, |transform| transform * rect);
            Some(css_rect(rect.expand(12.0), screen, scale))
        })
        .collect::<Vec<_>>();
    embedded.snapshot = json!({
        "embeddedLayout": 1,
        "width": screen.width() * scale,
        "height": screen.height() * scale,
        "top": embedded.top,
        "bottom": embedded.bottom,
        "center": css_rect(embedded.center, screen, scale),
        "overlays": overlays,
        "blocking": blocking,
        "preview": embedded.preview.as_ref().zip(embedded.preview_controls).map(|(p,(accept,discard))| json!({"id":p.id,"accept":css_rect(accept, screen, scale),"discard":css_rect(discard, screen, scale)})),
        "canUndo": app.session.can_undo(),
        "canRedo": app.session.can_redo(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn embedded_appearance_stays_light_when_system_or_preferences_are_dark() {
        for preference in [crate::theme::Appearance::System, crate::theme::Appearance::Dark] {
            let mut app = WordApp::new(wordcraft_engine::Session::new(wordcraft_doc::Document::from_text("Theme fixture")), Default::default());
            app.ui.theme = preference;
            let layout = HostLayout::parse(json!({"left":0,"right":0,"theme":{"background":"#f7f7f5","panel":"#ffffff","text":"#1a1a1a","muted":"#6b6b6b","border":"#e2e2de","accent":"#2c5f4a"}})).unwrap();
            app.embedded = Some(Embedded { host: Some(layout), ..Default::default() });
            let ctx = egui::Context::default();
            for system_theme in [egui::Theme::Dark, egui::Theme::Light, egui::Theme::Dark] {
                let input = egui::RawInput { system_theme: Some(system_theme), ..Default::default() };
                let output = ctx.run_ui(input, |ui| {
                    app.logic(ui.ctx());
                    app.embedded.as_ref().unwrap().host.as_ref().unwrap().theme.install(ui.ctx());
                    let style = ui.ctx().global_style();
                    assert!(!style.visuals.dark_mode);
                    assert_eq!(style.visuals.widgets.inactive.bg_fill, Color32::WHITE);
                    assert_eq!(style.visuals.extreme_bg_color, Color32::WHITE);
                });
                output.drop_without_applying_deltas();
                assert_eq!(app.ui.theme, crate::theme::Appearance::Light);
            }
        }
        assert_eq!(tab_font(false, 12.5), crate::theme::regular(12.5));
    }

    #[test]
    fn coordinates_account_for_interface_scale_and_screen_origin() {
        let screen = Rect::from_min_size(egui::pos2(10.0, 20.0), egui::vec2(500.0, 400.0));
        assert_eq!(
            css_rect(Rect::from_min_size(egui::pos2(30.0, 50.0), egui::vec2(100.0, 80.0)), screen, 2.0),
            json!({"x": 40.0, "y": 60.0, "width": 200.0, "height": 160.0})
        );
        assert_eq!(reservation(400.0, 2.0, 300.0), 200.0);
        assert_eq!(reservation(f32::INFINITY, 1.0, 300.0), 0.0);
    }
    #[test]
    fn validates_host_dimensions_and_colors_without_slicing_unicode() {
        let theme =
            json!({"background": "#f7f7f5", "panel": "#ffffff", "text": "#1a1a1a", "muted": "#6b6b6b", "border": "#e2e2de", "accent": "#2c5f4a"});
        assert!(HostLayout::parse(json!({"left": 380, "right": 400, "theme": theme})).is_ok());
        assert!(HostLayout::parse(json!({"left": -1, "right": 400, "theme": theme})).is_err());
        assert_eq!(color("#ééé"), None);
    }
    #[test]
    fn native_chrome_reserves_panels_collapses_and_blocks_for_dialogs() {
        let mut app = WordApp::new(
            wordcraft_engine::Session::new(wordcraft_engine::blank_document(&wordcraft_geom::Region::default())),
            crate::Services::default(),
        );
        let theme =
            json!({"background": "#f7f7f5", "panel": "#ffffff", "text": "#1a1a1a", "muted": "#6b6b6b", "border": "#e2e2de", "accent": "#2c5f4a"});
        app.embedded = Some(Embedded { host: Some(HostLayout::parse(json!({"left":380,"right":400,"theme":theme})).unwrap()), ..Default::default() });
        let mut h = egui_kittest::Harness::builder().with_size(egui::vec2(1440.0, 900.0)).build_ui_state(
            |ui, app: &mut WordApp| {
                let ctx = ui.ctx().clone();
                app.logic(&ctx);
                app.ui(ui);
            },
            app,
        );
        for _ in 0..6 {
            h.step();
        }
        let snapshot = h.state().embedded.as_ref().unwrap().snapshot.clone();
        assert_eq!(snapshot["width"], 1440.0);
        // The test harness wraps its UI in an eight-point frame on each side.
        assert_eq!(snapshot["center"]["x"], 388.0);
        assert_eq!(snapshot["center"]["width"], 644.0);
        let top = snapshot["top"].as_f64().unwrap();
        assert!(top > 30.0);
        h.state_mut().run("ui.collapseRibbon", json!({})).unwrap();
        h.step();
        let collapsed = &h.state().embedded.as_ref().unwrap().snapshot;
        assert!(collapsed["top"].as_f64().unwrap() < top);
        assert_eq!(collapsed["center"]["width"], 644.0);
        h.state_mut().run("tools.search", json!({})).unwrap();
        h.step();
        assert_eq!(h.state().embedded.as_ref().unwrap().snapshot["blocking"], true);
        h.state_mut().run("ui.closeDialog", json!({})).unwrap();
        h.state_mut().ui.backstage = true;
        h.step();
        assert_eq!(h.state().embedded.as_ref().unwrap().snapshot["blocking"], true);
    }
    fn preview_app() -> WordApp {
        let mut app = WordApp::new(
            wordcraft_engine::Session::new(wordcraft_engine::blank_document(&wordcraft_geom::Region::default())),
            crate::Services::default(),
        );
        app.embedded = Some(Embedded::default());
        apply_text(&mut app.session, "Original").unwrap();
        app.session.dirty = false;
        app
    }
    #[test]
    fn discard_restores_original_revision_selection_and_undo_history() {
        let mut app = preview_app();
        let rev = app.session.rev();
        let id = app.session.document_id();
        let sel = app.session.sel.clone();
        stage_preview(&mut app, "p".into(), " new paragraph\nSecond line".into()).unwrap();
        assert!(app.run("file.new", json!({})).is_err());
        assert!(app.execute("text.insert", json!({"text":"unexpected"})).is_err());
        assert!(!app.session.dirty);
        assert!(resolve_preview(&mut app, "different", false).is_err());
        resolve_preview(&mut app, "p", false).unwrap();
        assert_eq!(app.session.rev(), rev);
        assert_eq!(app.session.document_id(), id);
        assert_eq!(app.session.sel, sel);
        assert!(!app.session.dirty);
        app.run("edit.undo", json!({})).unwrap();
        app.run("select.all", json!({})).unwrap();
        assert_eq!(app.session.selected_text(), "");
    }
    #[test]
    fn accepted_insertion_has_its_own_undo_step() {
        let mut app = preview_app();
        // Leave an ordinary typing group open before requesting AI.
        app.session.run("text.insert", &json!({"text":" typed"})).unwrap();
        stage_preview(&mut app, "p".into(), " generated".into()).unwrap();
        resolve_preview(&mut app, "p", true).unwrap();
        app.run("edit.undo", json!({})).unwrap();
        app.run("select.all", json!({})).unwrap();
        assert_eq!(app.session.selected_text(), "Original typed");
    }
    #[test]
    fn accept_replaces_exact_range_once_and_undo_restores_it() {
        let mut app = preview_app();
        app.run("select.all", json!({})).unwrap();
        app.session.prefs.typing_replaces_selection = false;
        stage_preview(&mut app, "p".into(), "Revised\nSecond paragraph".into()).unwrap();
        resolve_preview(&mut app, "p", true).unwrap();
        assert!(app.session.dirty);
        assert!(resolve_preview(&mut app, "p", true).is_err());
        app.run("select.all", json!({})).unwrap();
        assert_eq!(app.session.selected_text(), "Revised\nSecond paragraph");
        app.run("edit.undo", json!({})).unwrap();
        app.run("select.all", json!({})).unwrap();
        assert_eq!(app.session.selected_text(), "Original");
        assert!(!app.session.prefs.typing_replaces_selection);
    }
    #[test]
    fn standalone_has_no_host_reservations_or_theme() {
        let app = WordApp::new(
            wordcraft_engine::Session::new(wordcraft_engine::blank_document(&wordcraft_geom::Region::default())),
            crate::Services::default(),
        );
        assert!(app.embedded.is_none());
    }
}
