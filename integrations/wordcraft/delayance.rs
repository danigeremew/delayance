//! Delayance's narrowly scoped, origin-checked host bridge. No AI runs in this module.
use serde_json::{Value, json};
use std::{cell::RefCell, rc::Rc, time::Duration};
use wasm_bindgen::{JsCast as _, JsValue, closure::Closure};
use wordcraft_engine::Selection;
use wordcraft_ui_egui::WordApp;

pub type Downloads = Rc<RefCell<Vec<(String, Vec<u8>)>>>;
struct Message {
    id: String,
    values: Value,
    bytes: Option<Vec<u8>>,
}
struct Captured {
    handle: String,
    revision: u64,
    document_id: u64,
    selection: Selection,
}
pub struct Bridge {
    origin: String,
    queue: Rc<RefCell<Vec<Message>>>,
    pub downloads: Downloads,
    loaded: bool,
    writable: bool,
    sequence: u32,
    selection: Option<Captured>,
    saving: Option<(u32, u64, u64)>,
    dirty: bool,
    last_layout: Value,
}

impl Bridge {
    pub fn install(ctx: egui::Context) -> Result<Self, String> {
        let window = web_sys::window().ok_or("Browser window unavailable")?;
        let referrer = window.document().ok_or("Browser document unavailable")?.referrer();
        let origin = web_sys::Url::new(&referrer).map_err(|_| "Missing embedding origin")?.origin();
        if origin == "null" {
            return Err("Invalid embedding origin".into());
        }
        let parent = window.parent().map_err(|_| "Parent window unavailable")?.ok_or("Parent window unavailable")?;
        let queue: Rc<RefCell<Vec<Message>>> = Rc::default();
        let inbox = queue.clone();
        let expected_origin = origin.clone();
        let listener = Closure::<dyn FnMut(web_sys::MessageEvent)>::new(move |event: web_sys::MessageEvent| {
            if event.origin() != expected_origin {
                return;
            }
            let Some(source) = event.source() else { return };
            let source_value: &JsValue = source.as_ref();
            let parent_value: &JsValue = parent.as_ref();
            if source_value != parent_value {
                return;
            }
            let data = event.data();
            let raw = if let Some(text) = data.as_string() {
                if text.len() > 1_000_000 {
                    return;
                }
                text
            } else {
                let Ok(id) = js_sys::Reflect::get(&data, &JsValue::from_str("MessageId")) else { return };
                if id.as_string().as_deref() != Some("Delayance_LoadDocument") {
                    return;
                }
                let Ok(bytes) = js_sys::Reflect::get(&data, &JsValue::from_str("bytes")) else { return };
                if !bytes.is_instance_of::<js_sys::Uint8Array>() {
                    return;
                }
                let bytes = js_sys::Uint8Array::new(&bytes);
                if bytes.length() == 0 || bytes.length() > 100 * 1024 * 1024 {
                    return;
                }
                let writable = js_sys::Reflect::get(&data, &JsValue::from_str("writable")).ok().and_then(|v| v.as_bool()).unwrap_or(false);
                if inbox.borrow().len() < 32 {
                    inbox.borrow_mut().push(Message {
                        id: "Delayance_LoadDocument".into(),
                        values: json!({"writable": writable}),
                        bytes: Some(bytes.to_vec()),
                    });
                    ctx.request_repaint();
                }
                return;
            };
            let Ok(data) = serde_json::from_str::<Value>(&raw) else { return };
            let Some(id) = data.get("MessageId").and_then(Value::as_str) else { return };
            if inbox.borrow().len() < 32 {
                inbox.borrow_mut().push(Message { id: id.into(), values: data.get("Values").cloned().unwrap_or(json!({})), bytes: None });
                ctx.request_repaint();
            }
        });
        window.add_event_listener_with_callback("message", listener.as_ref().unchecked_ref()).map_err(|_| "Cannot install host bridge")?;
        listener.forget();
        let bridge = Self {
            origin,
            queue,
            downloads: Rc::default(),
            loaded: false,
            writable: false,
            sequence: 0,
            selection: None,
            saving: None,
            dirty: false,
            last_layout: Value::Null,
        };
        bridge.send("App_LoadingStatus", json!({"Status": "Frame_Ready", "embeddedLayout": 1}));
        Ok(bridge)
    }

    fn send(&self, id: &str, values: Value) {
        let Some(window) = web_sys::window() else { return };
        let Ok(Some(parent)) = window.parent() else { return };
        let _ = parent.post_message(&JsValue::from_str(&json!({"MessageId": id, "Values": values}).to_string()), &self.origin);
    }

    pub fn before(&mut self, app: &mut WordApp, ctx: &egui::Context) {
        let messages = std::mem::take(&mut *self.queue.borrow_mut());
        for message in messages {
            match message.id.as_str() {
                "Host_PostmessageReady" => self
                    .send("App_LoadingStatus", json!({"Status": if self.loaded { "Document_Loaded" } else { "Frame_Ready" }, "embeddedLayout": 1})),
                "Delayance_LoadDocument" if !self.loaded => {
                    let result =
                        message.bytes.as_deref().ok_or("Missing DOCX").and_then(|bytes| {
                            wordcraft_engine::io::open_bytes("document.docx", bytes).map_err(|_| "Wordcraft could not open this DOCX")
                        });
                    match result {
                        Ok(doc) => {
                            app.session.set_document(doc);
                            self.writable = message.values.get("writable").and_then(Value::as_bool).unwrap_or(false);
                            if !self.writable {
                                let _ = app.session.run("review.restrict", &json!({"mode": "readOnly"}));
                            }
                            app.session.dirty = false;
                            let prefs = app.prefs();
                            app.apply_prefs(prefs);
                            self.loaded = true;
                            self.send("App_LoadingStatus", json!({"Status": "Document_Loaded"}));
                        }
                        Err(error) => self.send("Delayance_Error", json!({"error": error})),
                    }
                }
                "Action_Save" if self.loaded => {
                    if app.embedded.as_ref().is_some_and(|e| e.preview.is_some()) {
                        self.send("Action_Save_Resp", json!({"success": false, "error": "Accept or discard the AI preview first"}));
                        continue;
                    }
                    let result = wordcraft_engine::io::save_bytes("document.docx", &app.session.doc);
                    match result {
                        Ok(bytes) => {
                            if let Err(error) = self.save(app, &bytes) {
                                self.send("Action_Save_Resp", json!({"success": false, "error": error}));
                            }
                        }
                        Err(_) => self.send("Action_Save_Resp", json!({"success": false, "error": "Wordcraft could not export the DOCX"})),
                    }
                }
                "Delayance_SaveResult" => {
                    let id = message.values.get("id").and_then(Value::as_u64);
                    if let Some((pending, revision, document_id)) = self.saving
                        && id == Some(u64::from(pending))
                    {
                        let success = message.values.get("success").and_then(Value::as_bool) == Some(true);
                        let unchanged = app.session.rev() == revision && app.session.document_id() == document_id;
                        app.session.dirty = !success || !unchanged;
                        self.saving = None;
                        self.send("Action_Save_Resp", json!({"success": success && unchanged}));
                        if app.session.dirty {
                            self.send("Doc_ModifiedStatus", json!({"Modified": true}));
                        }
                    }
                }
                "Delayance_Request" if self.loaded => {
                    let request_id = message.values.get("requestId").and_then(Value::as_str).unwrap_or("");
                    if request_id.len() > 100 {
                        continue;
                    }
                    let method = message.values.get("method").and_then(Value::as_str).unwrap_or("");
                    let params = message.values.get("params").cloned().unwrap_or(json!({}));
                    let result = self.request(app, method, &params);
                    let reply = match result {
                        Ok(result) => json!({"requestId": request_id, "ok": true, "result": result}),
                        Err(error) => json!({"requestId": request_id, "ok": false, "error": error}),
                    };
                    if method == "command" {
                        let message = json!({"MessageId": "Delayance_Reply", "Values": reply}).to_string();
                        if let Err(error) = focus_canvas(Some((self.origin.clone(), message))) {
                            self.send("Delayance_Reply", json!({"requestId": request_id, "ok": false, "error": error}));
                        }
                    } else {
                        self.send("Delayance_Reply", reply);
                    }
                }
                "Delayance_HostLayout" => {
                    if let Ok(layout) = wordcraft_ui_egui::embedded::HostLayout::parse(message.values)
                        && let Some(embedded) = &mut app.embedded
                    {
                        embedded.host = Some(layout);
                        ctx.request_repaint();
                    }
                }
                "Delayance_DismissPopups" => egui::Popup::close_all(ctx),
                "Action_Focus" => {
                    let _ = focus_canvas(None);
                    app.canvas.focused = true;
                    app.canvas.want_focus = true;
                }
                _ => {}
            }
        }
    }

    fn request(&mut self, app: &mut WordApp, method: &str, params: &Value) -> Result<Value, String> {
        match method {
            "preview-discard" | "preview-commit" => {
                let id = params.get("id").and_then(Value::as_str).ok_or("Missing proposal ID")?;
                if method == "preview-commit" && (!self.writable || self.saving.is_some()) {
                    return Err("The editor is read-only or saving".into());
                }
                wordcraft_ui_egui::embedded::resolve_preview(app, id, method == "preview-commit")
            }
            "preview" => {
                if !self.writable || self.saving.is_some() || app.embedded.as_ref().is_none_or(|e| e.preview.is_some()) {
                    return Err("Resolve the current preview before requesting another".into());
                }
                let id =
                    params.get("id").and_then(Value::as_str).filter(|id| !id.is_empty() && id.len() <= 100).ok_or("Invalid proposal ID")?.to_string();
                let captured = self.selection.as_ref().ok_or("Capture the cursor before generating")?;
                if params.get("handle").and_then(Value::as_str) != Some(captured.handle.as_str())
                    || app.session.rev() != captured.revision
                    || app.session.document_id() != captured.document_id
                    || app.session.sel != captured.selection
                {
                    return Err("The cursor or document changed while AI was writing. Generate a new proposal at the intended position".into());
                }
                let action = params.get("action").and_then(Value::as_str).ok_or("Missing action")?;
                if !matches!(action, "insert" | "replace") || (action == "insert" && !captured.selection.is_collapsed()) {
                    return Err("Place the cursor without selecting text for Write, or use Edit".into());
                }
                let text = params
                    .get("text")
                    .and_then(Value::as_str)
                    .filter(|s| !s.trim().is_empty() && s.encode_utf16().count() <= 100_000)
                    .ok_or("Invalid proposed text")?
                    .to_string();
                wordcraft_ui_egui::embedded::stage_preview(app, id, text)?;
                self.selection = None;
                Ok(json!({}))
            }
            "selection" => {
                let text = app.session.selected_text();
                if text.encode_utf16().count() > 50_000 {
                    return Err("Select less text before requesting an AI edit".into());
                }
                self.sequence = self.sequence.checked_add(1).unwrap_or(1);
                let handle = self.sequence.to_string();
                self.selection = Some(Captured {
                    handle: handle.clone(),
                    revision: app.session.rev(),
                    document_id: app.session.document_id(),
                    selection: app.session.sel.clone(),
                });
                Ok(json!({"text": text, "isCollapsed": app.session.sel.is_collapsed(), "handle": handle}))
            }
            "replace" | "insert" => {
                if !self.writable || self.saving.is_some() {
                    return Err("The editor is read-only or saving".into());
                }
                let captured = self.selection.as_ref().ok_or("Capture the selection before applying")?;
                if params.get("handle").and_then(Value::as_str) != Some(captured.handle.as_str())
                    || app.session.rev() != captured.revision
                    || app.session.document_id() != captured.document_id
                    || app.session.sel != captured.selection
                {
                    return Err("The selection or document changed. Select the original text again".into());
                }
                if method == "insert" && !captured.selection.is_collapsed() {
                    return Err("Place the cursor without selecting text before inserting".into());
                }
                let text = params.get("text").and_then(Value::as_str).ok_or("Missing proposed text")?;
                if text.trim().is_empty() || text.encode_utf16().count() > 100_000 {
                    return Err("Invalid proposed text".into());
                }
                self.selection = None;
                app.execute("text.insert", json!({"text": text}))
            }
            "command" => {
                let command = params.get("command").and_then(Value::as_str).ok_or("Missing command")?;
                if !matches!(
                    command,
                    "edit.undo"
                        | "edit.redo"
                        | "edit.find"
                        | "tools.search"
                        | "review.newComment"
                        | "format.bold"
                        | "format.italic"
                        | "format.underline"
                        | "select.all"
                        | "select.text"
                        | "view.zoom100"
                ) {
                    return Err("Use Wordcraft's ribbon for this command".into());
                }
                if !self.writable && !matches!(command, "edit.find" | "tools.search" | "select.all" | "select.text" | "view.zoom100") {
                    return Err("Read-only editor".into());
                }
                if command != "tools.search" {
                    app.canvas.want_focus = true;
                }
                app.run(command, params.get("args").cloned().unwrap_or(json!({})))
            }
            _ => Err("Unsupported editor request".into()),
        }
    }

    fn save(&mut self, app: &WordApp, bytes: &[u8]) -> Result<(), String> {
        if !self.writable {
            return Err("Read-only editor".into());
        }
        if self.saving.is_some() {
            return Err("A save is already in progress".into());
        }
        if bytes.is_empty() || bytes.len() > 100 * 1024 * 1024 {
            return Err("Invalid DOCX size".into());
        }
        self.sequence = self.sequence.checked_add(1).unwrap_or(1);
        let id = self.sequence;
        let values = js_sys::Object::new();
        let message = js_sys::Object::new();
        js_sys::Reflect::set(&values, &JsValue::from_str("id"), &JsValue::from_f64(f64::from(id))).map_err(|_| "Cannot serialize save")?;
        js_sys::Reflect::set(&values, &JsValue::from_str("bytes"), &js_sys::Uint8Array::from(bytes)).map_err(|_| "Cannot serialize DOCX")?;
        js_sys::Reflect::set(&message, &JsValue::from_str("MessageId"), &JsValue::from_str("Delayance_Docx")).map_err(|_| "Cannot serialize save")?;
        js_sys::Reflect::set(&message, &JsValue::from_str("Values"), &values).map_err(|_| "Cannot serialize save")?;
        web_sys::window()
            .ok_or("Browser window unavailable")?
            .parent()
            .map_err(|_| "Parent window unavailable")?
            .ok_or("Parent window unavailable")?
            .post_message(&message, &self.origin)
            .map_err(|_| "Cannot send DOCX to host")?;
        self.saving = Some((id, app.session.rev(), app.session.document_id()));
        Ok(())
    }

    pub fn after(&mut self, app: &mut WordApp, ctx: &egui::Context) {
        if let Some(embedded) = &app.embedded {
            let mut layout = embedded.snapshot.clone();
            if let Some(values) = layout.as_object_mut() {
                values.insert("writable".into(), json!(self.loaded && self.writable && embedded.preview.is_none()));
                if !self.writable || embedded.preview.is_some() {
                    values.insert("canUndo".into(), json!(false));
                    values.insert("canRedo".into(), json!(false));
                }
                if layout != self.last_layout {
                    self.send("Delayance_Layout", layout.clone());
                    self.last_layout = layout;
                }
            }
        }
        if let Some(preview) = app.embedded.as_mut().and_then(|e| e.preview.as_mut()) {
            if let Some(accept) = preview.decision.take() {
                let id = preview.id.clone();
                self.send("Delayance_PreviewDecision", json!({"id": id, "decision": if accept { "accept" } else { "reject" }}));
            }
            self.downloads.borrow_mut().clear();
            app.session.dirty = false;
            return;
        }
        let downloads = std::mem::take(&mut *self.downloads.borrow_mut());
        for (_, bytes) in downloads {
            app.session.dirty = true;
            if let Err(error) = self.save(app, &bytes) {
                app.status(error);
            }
        }
        if self.saving.is_some() {
            app.session.dirty = true;
            ctx.request_repaint_after(Duration::from_millis(100));
        }
        if self.dirty != app.session.dirty {
            self.dirty = app.session.dirty;
            self.send("Doc_ModifiedStatus", json!({"Modified": self.dirty}));
        }
    }
}

/// Defer DOM focus until the web runner releases its borrow. Synchronous focus during
/// an egui frame drops browser focus events. Acknowledge commands after that handoff.
fn focus_canvas(reply: Option<(String, String)>) -> Result<(), String> {
    let window = web_sys::window().ok_or("Browser window unavailable")?;
    let callback = Closure::once(move || {
        if let Some(window) = web_sys::window() {
            let _ = window.focus();
            if let Some(document) = window.document()
                && let Some(canvas) = document.get_element_by_id(super::CANVAS_ID)
                && let Ok(canvas) = canvas.dyn_into::<web_sys::HtmlElement>()
            {
                let _ = canvas.focus();
            }
            if let Some((origin, message)) = reply
                && let Ok(Some(parent)) = window.parent()
            {
                let _ = parent.post_message(&JsValue::from_str(&message), &origin);
            }
        }
    });
    window.set_timeout_with_callback_and_timeout_and_arguments_0(callback.as_ref().unchecked_ref(), 0).map_err(|_| "Cannot focus editor")?;
    callback.forget();
    Ok(())
}
