'use client';

import { useCallback, useState } from 'react';
import type { EditorAdapter } from '@/editor/adapter';

interface LayoutPanelProps {
  editor: EditorAdapter | null;
}

const STYLES = [
  { label: 'Default Paragraph Style', value: 'Default Paragraph Style' },
  { label: 'Heading 1', value: 'Heading 1' },
  { label: 'Heading 2', value: 'Heading 2' },
  { label: 'Heading 3', value: 'Heading 3' },
  { label: 'Title', value: 'Title' },
  { label: 'Subtitle', value: 'Subtitle' },
  { label: 'Text body', value: 'Text body' },
  { label: 'Quotations', value: 'Quotations' },
  { label: 'Header', value: 'Header' },
  { label: 'Footer', value: 'Footer' },
];

const FONTS = [
  { label: 'Calibri', value: 'Calibri' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Courier New', value: 'Courier New' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS' },
  { label: 'Verdana', value: 'Verdana' },
];

const FONT_SIZES = [
  { label: '8 pt', value: '8' },
  { label: '9 pt', value: '9' },
  { label: '10 pt', value: '10' },
  { label: '11 pt', value: '11' },
  { label: '12 pt', value: '12' },
  { label: '14 pt', value: '14' },
  { label: '16 pt', value: '16' },
  { label: '18 pt', value: '18' },
  { label: '20 pt', value: '20' },
  { label: '24 pt', value: '24' },
  { label: '28 pt', value: '28' },
  { label: '32 pt', value: '32' },
  { label: '36 pt', value: '36' },
  { label: '48 pt', value: '48' },
  { label: '72 pt', value: '72' },
];

const TEXT_COLORS = [
  { label: 'Automatic / Black', value: 0x000000, hex: '#000000' },
  { label: 'Dark Gray', value: 0x444444, hex: '#444444' },
  { label: 'Gray', value: 0x888888, hex: '#888888' },
  { label: 'White', value: 0xffffff, hex: '#ffffff' },
  { label: 'Red', value: 0xd32f2f, hex: '#d32f2f' },
  { label: 'Orange', value: 0xf57c00, hex: '#f57c00' },
  { label: 'Yellow / Gold', value: 0xfbc02d, hex: '#fbc02d' },
  { label: 'Green', value: 0x388e3c, hex: '#388e3c' },
  { label: 'Cyan / Teal', value: 0x0097a7, hex: '#0097a7' },
  { label: 'Blue', value: 0x1976d2, hex: '#1976d2' },
  { label: 'Indigo', value: 0x303f9f, hex: '#303f9f' },
  { label: 'Purple', value: 0x7b1fa2, hex: '#7b1fa2' },
];

const HIGHLIGHT_COLORS = [
  { label: 'No Fill', value: -1, hex: 'transparent' },
  { label: 'Yellow', value: 0xfff59d, hex: '#fff59d' },
  { label: 'Light Green', value: 0xc8e6c9, hex: '#c8e6c9' },
  { label: 'Cyan', value: 0xb2ebf2, hex: '#b2ebf2' },
  { label: 'Light Blue', value: 0xbbdefb, hex: '#bbdefb' },
  { label: 'Pink', value: 0xf8bbd0, hex: '#f8bbd0' },
  { label: 'Orange', value: 0xffe0b2, hex: '#ffe0b2' },
  { label: 'Light Red', value: 0xffcdd2, hex: '#ffcdd2' },
];

export function LayoutPanel({ editor }: LayoutPanelProps) {
  const [styleOpen, setStyleOpen] = useState(true);
  const [charOpen, setCharOpen] = useState(true);
  const [paraOpen, setParaOpen] = useState(true);

  const [selectedStyle, setSelectedStyle] = useState('Default Paragraph Style');
  const [selectedFont, setSelectedFont] = useState('Calibri');
  const [selectedSize, setSelectedSize] = useState('11');

  // Interactive drop-downs
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [highlightColorOpen, setHighlightColorOpen] = useState(false);
  const [charSpacingOpen, setCharSpacingOpen] = useState(false);
  const [lineSpacingOpen, setLineSpacingOpen] = useState(false);
  const [paraBgOpen, setParaBgOpen] = useState(false);

  // Stepper values (in inches)
  const [spaceAbove, setSpaceAbove] = useState(0);
  const [spaceBelow, setSpaceBelow] = useState(0);
  const [indentBefore, setIndentBefore] = useState(0);
  const [indentAfter, setIndentAfter] = useState(0);
  const [indentFirst, setIndentFirst] = useState(0);

  const exec = useCallback(
    (command: string, args?: Record<string, unknown>) => {
      setTextColorOpen(false);
      setHighlightColorOpen(false);
      setCharSpacingOpen(false);
      setLineSpacingOpen(false);
      setParaBgOpen(false);
      if (!editor) return;
      void editor.executeCommand({ type: 'uno', command, args });
    },
    [editor],
  );

  const handleStyleChange = useCallback(
    (style: string) => {
      setSelectedStyle(style);
      exec('.uno:StyleApply', { Template: style });
    },
    [exec],
  );

  const handleFontChange = useCallback(
    (font: string) => {
      setSelectedFont(font);
      exec('.uno:CharFontName', { CharFontName: font });
      exec('.uno:FontName', { FontName: font });
    },
    [exec],
  );

  const handleSizeChange = useCallback(
    (size: string) => {
      setSelectedSize(size);
      exec('.uno:FontHeight', { FontHeight: parseFloat(size) });
    },
    [exec],
  );

  const adjustSpacingAbove = useCallback(
    (delta: number) => {
      setSpaceAbove((prev) => {
        const next = Math.max(0, parseFloat((prev + delta).toFixed(2)));
        if (delta > 0) exec('.uno:ParaspaceIncrease');
        else exec('.uno:ParaspaceDecrease');
        return next;
      });
    },
    [exec],
  );

  const adjustSpacingBelow = useCallback(
    (delta: number) => {
      setSpaceBelow((prev) => {
        const next = Math.max(0, parseFloat((prev + delta).toFixed(2)));
        if (delta > 0) exec('.uno:ParaspaceIncrease');
        else exec('.uno:ParaspaceDecrease');
        return next;
      });
    },
    [exec],
  );

  const adjustIndentBefore = useCallback(
    (delta: number) => {
      setIndentBefore((prev) => {
        const next = Math.max(0, parseFloat((prev + delta).toFixed(2)));
        if (delta > 0) exec('.uno:IncrementIndent');
        else exec('.uno:DecrementIndent');
        return next;
      });
    },
    [exec],
  );

  const adjustIndentAfter = useCallback((delta: number) => {
    setIndentAfter((prev) => Math.max(0, parseFloat((prev + delta).toFixed(2))));
  }, []);

  const adjustIndentFirst = useCallback((delta: number) => {
    setIndentFirst((prev) => Math.max(0, parseFloat((prev + delta).toFixed(2))));
  }, []);

  const disabled = !editor;

  return (
    <div className="flex flex-col bg-[color-mix(in_srgb,var(--dl-panel)_94%,black)] text-[var(--dl-fg)] text-xs select-none h-full overflow-y-auto font-sans">
      {/* ──────────────────────────────────────────────────────────── */}
      {/* 1. STYLE ACCORDION */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-[var(--dl-border)]">
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[color-mix(in_srgb,var(--dl-fg)_4%,transparent)]"
          onClick={() => setStyleOpen(!styleOpen)}
        >
          <div className="flex items-center gap-1.5 font-medium text-[13px] text-[var(--dl-fg)]">
            <span className="text-[10px] text-[var(--dl-muted)]">{styleOpen ? '⌄' : '›'}</span>
            <span>Style</span>
          </div>
          <button
            type="button"
            className="text-[var(--dl-muted)] hover:text-[var(--dl-fg)] p-0.5"
            title="Style Options"
            onClick={(e) => {
              e.stopPropagation();
              exec('.uno:DesignerDialog');
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>

        {styleOpen ? (
          <div className="px-3 pb-3 pt-1 flex items-center gap-2">
            {/* Style Selector */}
            <div className="relative flex-1">
              <select
                value={selectedStyle}
                onChange={(e) => handleStyleChange(e.target.value)}
                disabled={disabled}
                className="w-full appearance-none rounded border border-[color-mix(in_srgb,var(--dl-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--dl-bg)_70%,black)] px-2.5 py-1.5 pr-7 text-xs text-[var(--dl-fg)] focus:outline-none"
              >
                {STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--dl-muted)]">
                ▾
              </span>
            </div>

            {/* 3 Style Action Buttons */}
            <div className="flex items-center gap-1">
              {/* Fill Format / Paintbrush */}
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                title="Fill Format / Paintbrush"
                disabled={disabled}
                onClick={() => exec('.uno:FormatPaintbrush')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
                  <path d="m5 2 5 5" />
                  <path d="M2 13h15" />
                  <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
                </svg>
              </button>
              {/* Update Style */}
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                title="Update Style to Match Selection"
                disabled={disabled}
                onClick={() => exec('.uno:StyleUpdateByExample')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#29b6f6" strokeWidth="2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.67-1.19" />
                </svg>
              </button>
              {/* New Style */}
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                title="New Style from Selection"
                disabled={disabled}
                onClick={() => exec('.uno:StyleNewByExample')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffb74d" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. CHARACTER ACCORDION */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-[var(--dl-border)]">
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[color-mix(in_srgb,var(--dl-fg)_4%,transparent)]"
          onClick={() => setCharOpen(!charOpen)}
        >
          <div className="flex items-center gap-1.5 font-medium text-[13px] text-[var(--dl-fg)]">
            <span className="text-[10px] text-[var(--dl-muted)]">{charOpen ? '⌄' : '›'}</span>
            <span>Character</span>
          </div>
          <button
            type="button"
            className="text-[var(--dl-muted)] hover:text-[var(--dl-fg)] p-0.5"
            title="Character Dialog"
            onClick={(e) => {
              e.stopPropagation();
              exec('.uno:FontDialog');
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>

        {charOpen ? (
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5">
            {/* Row 1: Font Family & Size */}
            <div className="flex gap-2">
              {/* Font Family Dropdown */}
              <div className="relative flex-1">
                <select
                  value={selectedFont}
                  onChange={(e) => handleFontChange(e.target.value)}
                  disabled={disabled}
                  className="w-full appearance-none rounded border border-[color-mix(in_srgb,var(--dl-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--dl-bg)_70%,black)] px-2.5 py-1.5 pr-7 text-xs text-[var(--dl-fg)] focus:outline-none"
                >
                  {FONTS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--dl-muted)]">
                  ▾
                </span>
              </div>

              {/* Font Size Dropdown */}
              <div className="relative w-24">
                <select
                  value={selectedSize}
                  onChange={(e) => handleSizeChange(e.target.value)}
                  disabled={disabled}
                  className="w-full appearance-none rounded border border-[color-mix(in_srgb,var(--dl-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--dl-bg)_70%,black)] px-2 py-1.5 pr-6 text-xs text-[var(--dl-fg)] focus:outline-none"
                >
                  {FONT_SIZES.map((sz) => (
                    <option key={sz.value} value={sz.value}>
                      {sz.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--dl-muted)]">
                  ▾
                </span>
              </div>
            </div>

            {/* Row 2: B, I, U▾, S, S (shadow/overline), Clear Format, Grow, Shrink */}
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] text-xs font-bold hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                title="Bold (Ctrl+B)"
                disabled={disabled}
                onClick={() => exec('.uno:Bold')}
              >
                B
              </button>
              <button
                type="button"
                className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] text-xs italic font-serif hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                title="Italic (Ctrl+I)"
                disabled={disabled}
                onClick={() => exec('.uno:Italic')}
              >
                I
              </button>
              <button
                type="button"
                className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] text-xs underline hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                title="Underline (Ctrl+U)"
                disabled={disabled}
                onClick={() => exec('.uno:Underline')}
              >
                U
              </button>
              <button
                type="button"
                className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] text-xs line-through hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                title="Strikethrough"
                disabled={disabled}
                onClick={() => exec('.uno:Strikeout')}
              >
                S
              </button>
              <button
                type="button"
                className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] text-xs hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                title="Overline / Shadow"
                disabled={disabled}
                onClick={() => exec('.uno:Overline')}
              >
                <span className="overline">S</span>
              </button>
              <button
                type="button"
                className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] text-xs hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                title="Clear Direct Formatting (Ctrl+M)"
                disabled={disabled}
                onClick={() => exec('.uno:ResetAttributes')}
              >
                <span className="relative font-bold text-xs">
                  A<span className="absolute -bottom-1 -right-1 text-[9px] text-red-500">🧽</span>
                </span>
              </button>
              <button
                type="button"
                className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] text-xs hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                title="Increase Font Size"
                disabled={disabled}
                onClick={() => exec('.uno:Grow')}
              >
                A<span className="text-[10px]">↑</span>
              </button>
              <button
                type="button"
                className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] text-xs hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                title="Decrease Font Size"
                disabled={disabled}
                onClick={() => exec('.uno:Shrink')}
              >
                A<span className="text-[10px]">↓</span>
              </button>
            </div>

            {/* Row 3: A▾ (Color), ab▾ (Highlight), ↔AV▾ (Spacing), X², X₂ */}
            <div className="flex items-center justify-between gap-1">
              {/* Font Color */}
              <div className="relative">
                <button
                  type="button"
                  className="flex h-7 px-2 items-center justify-center gap-1 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                  title="Font Color"
                  disabled={disabled}
                  onClick={() => {
                    setTextColorOpen(!textColorOpen);
                    setHighlightColorOpen(false);
                    setCharSpacingOpen(false);
                  }}
                >
                  <div className="flex flex-col items-center">
                    <span className="font-bold text-xs leading-none">A</span>
                    <span className="mt-0.5 h-0.5 w-3 rounded bg-red-500" />
                  </div>
                  <span className="text-[9px] text-[var(--dl-muted)]">▾</span>
                </button>
                {textColorOpen ? (
                  <div className="absolute left-0 top-full mt-1 grid grid-cols-4 gap-1 rounded-md border border-[var(--dl-border)] bg-[var(--dl-panel)] p-2 shadow-2xl z-50">
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        title={c.label}
                        className="h-5 w-5 rounded border border-black/20 hover:scale-110"
                        style={{ backgroundColor: c.hex }}
                        onClick={() => exec('.uno:Color', { Color: c.value })}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Highlight Color */}
              <div className="relative">
                <button
                  type="button"
                  className="flex h-7 px-2 items-center justify-center gap-1 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                  title="Highlighting"
                  disabled={disabled}
                  onClick={() => {
                    setHighlightColorOpen(!highlightColorOpen);
                    setTextColorOpen(false);
                    setCharSpacingOpen(false);
                  }}
                >
                  <div className="flex flex-col items-center">
                    <span className="font-bold text-[11px] leading-none text-yellow-400">ab</span>
                    <span className="mt-0.5 h-0.5 w-3 rounded bg-yellow-400" />
                  </div>
                  <span className="text-[9px] text-[var(--dl-muted)]">▾</span>
                </button>
                {highlightColorOpen ? (
                  <div className="absolute left-0 top-full mt-1 grid grid-cols-4 gap-1 rounded-md border border-[var(--dl-border)] bg-[var(--dl-panel)] p-2 shadow-2xl z-50">
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        title={c.label}
                        className="h-5 w-5 rounded border border-black/20 hover:scale-110 flex items-center justify-center text-[10px]"
                        style={{ backgroundColor: c.hex }}
                        onClick={() =>
                          exec('.uno:CharBackground', {
                            CharBackground: c.value === -1 ? 0xffffff : c.value,
                          })
                        }
                      >
                        {c.value === -1 ? '✕' : ''}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Character Spacing */}
              <div className="relative">
                <button
                  type="button"
                  className="flex h-7 px-2 items-center justify-center gap-1 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                  title="Character Spacing"
                  disabled={disabled}
                  onClick={() => {
                    setCharSpacingOpen(!charSpacingOpen);
                    setTextColorOpen(false);
                    setHighlightColorOpen(false);
                  }}
                >
                  <span className="text-[10px] font-mono">↔AV</span>
                  <span className="text-[9px] text-[var(--dl-muted)]">▾</span>
                </button>
                {charSpacingOpen ? (
                  <div className="absolute left-0 top-full mt-1 min-w-[7.5rem] rounded-md border border-[var(--dl-border)] bg-[var(--dl-panel)] py-1 shadow-2xl z-50">
                    <button
                      type="button"
                      className="w-full px-2.5 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                      onClick={() => exec('.uno:FontSpacing', { FontSpacing: -30 })}
                    >
                      Very Tight (-1.5pt)
                    </button>
                    <button
                      type="button"
                      className="w-full px-2.5 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                      onClick={() => exec('.uno:FontSpacing', { FontSpacing: -15 })}
                    >
                      Tight (-0.75pt)
                    </button>
                    <button
                      type="button"
                      className="w-full px-2.5 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                      onClick={() => exec('.uno:FontSpacing', { FontSpacing: 0 })}
                    >
                      Normal (0pt)
                    </button>
                    <button
                      type="button"
                      className="w-full px-2.5 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                      onClick={() => exec('.uno:FontSpacing', { FontSpacing: 30 })}
                    >
                      Expanded (+1.5pt)
                    </button>
                    <button
                      type="button"
                      className="w-full px-2.5 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                      onClick={() => exec('.uno:FontSpacing', { FontSpacing: 60 })}
                    >
                      Very Expanded (+3pt)
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Superscript & Subscript */}
              <button
                type="button"
                className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] text-xs font-semibold hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                title="Superscript (Ctrl+Shift+P)"
                disabled={disabled}
                onClick={() => exec('.uno:SuperScript')}
              >
                X²
              </button>
              <button
                type="button"
                className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] text-xs font-semibold hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                title="Subscript (Ctrl+Shift+B)"
                disabled={disabled}
                onClick={() => exec('.uno:Subscript')}
              >
                X₂
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 3. PARAGRAPH ACCORDION */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-[var(--dl-border)]">
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[color-mix(in_srgb,var(--dl-fg)_4%,transparent)]"
          onClick={() => setParaOpen(!paraOpen)}
        >
          <div className="flex items-center gap-1.5 font-medium text-[13px] text-[var(--dl-fg)]">
            <span className="text-[10px] text-[var(--dl-muted)]">{paraOpen ? '⌄' : '›'}</span>
            <span>Paragraph</span>
          </div>
          <button
            type="button"
            className="text-[var(--dl-muted)] hover:text-[var(--dl-fg)] p-0.5"
            title="Paragraph Dialog"
            onClick={(e) => {
              e.stopPropagation();
              exec('.uno:ParagraphDialog');
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>

        {paraOpen ? (
          <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
            {/* Row 1: Alignments & Text Direction */}
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                  title="Align Left (Ctrl+L)"
                  disabled={disabled}
                  onClick={() => exec('.uno:LeftPara')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="17" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="17" y1="18" x2="3" y2="18" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                  title="Align Center (Ctrl+E)"
                  disabled={disabled}
                  onClick={() => exec('.uno:CenterPara')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="10" x2="6" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="18" y1="18" x2="6" y2="18" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[color-mix(in_srgb,var(--dl-fg)_16%,black)] flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--dl-fg)_20%,black)]"
                  title="Align Right (Ctrl+R)"
                  disabled={disabled}
                  onClick={() => exec('.uno:RightPara')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                  title="Justified (Ctrl+J)"
                  disabled={disabled}
                  onClick={() => exec('.uno:JustifyPara')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="12" x2="3" y2="12" /><line x1="21" y1="18" x2="3" y2="18" />
                  </svg>
                </button>
              </div>

              {/* LTR & RTL */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[color-mix(in_srgb,var(--dl-fg)_16%,black)] flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--dl-fg)_20%,black)] text-[#64b5f6]"
                  title="Left-To-Right"
                  disabled={disabled}
                  onClick={() => exec('.uno:ParaLeftToRight')}
                >
                  <span className="font-serif text-[11px] font-bold">¶<span className="text-[9px]">→</span></span>
                </button>
                <button
                  type="button"
                  className="h-7 w-7 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] flex items-center justify-center hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                  title="Right-To-Left"
                  disabled={disabled}
                  onClick={() => exec('.uno:ParaRightToLeft')}
                >
                  <span className="font-serif text-[11px] font-bold">¶<span className="text-[9px]">←</span></span>
                </button>
              </div>
            </div>

            {/* Row 2: Lists & Paragraph Background Color */}
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5">
                {/* Bullets */}
                <button
                  type="button"
                  className="flex h-7 items-center gap-1 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] px-1.5 hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                  title="Toggle Bulleted List (Shift+F12)"
                  disabled={disabled}
                  onClick={() => exec('.uno:DefaultBullet')}
                >
                  <span className="text-xs font-bold leading-none">•≡</span>
                  <span className="text-[9px] text-[var(--dl-muted)]">▾</span>
                </button>
                {/* Numbering */}
                <button
                  type="button"
                  className="flex h-7 items-center gap-1 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] px-1.5 hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                  title="Toggle Numbered List (F12)"
                  disabled={disabled}
                  onClick={() => exec('.uno:DefaultNumbering')}
                >
                  <span className="text-[10px] font-mono leading-none">123≡</span>
                  <span className="text-[9px] text-[var(--dl-muted)]">▾</span>
                </button>
                {/* Outline */}
                <button
                  type="button"
                  className="flex h-7 items-center gap-1 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] px-1.5 hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                  title="Multilevel List"
                  disabled={disabled}
                  onClick={() => exec('.uno:OutlineBullet')}
                >
                  <span className="text-[10px] font-mono leading-none">1.1≡</span>
                  <span className="text-[9px] text-[var(--dl-muted)]">▾</span>
                </button>
              </div>

              {/* Paragraph Background */}
              <div className="relative">
                <button
                  type="button"
                  className="flex h-7 items-center gap-1 rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] px-1.5 hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)]"
                  title="Paragraph Background Color"
                  disabled={disabled}
                  onClick={() => {
                    setParaBgOpen(!paraBgOpen);
                    setTextColorOpen(false);
                    setHighlightColorOpen(false);
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
                    <path d="m5 2 5 5" />
                    <path d="M2 13h15" />
                  </svg>
                  <span className="text-[9px] text-[var(--dl-muted)]">▾</span>
                </button>
                {paraBgOpen ? (
                  <div className="absolute right-0 top-full mt-1 grid grid-cols-4 gap-1 rounded-md border border-[var(--dl-border)] bg-[var(--dl-panel)] p-2 shadow-2xl z-50">
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        title={c.label}
                        className="h-5 w-5 rounded border border-black/20 hover:scale-110 flex items-center justify-center text-[10px]"
                        style={{ backgroundColor: c.hex }}
                        onClick={() =>
                          exec('.uno:BackgroundColor', {
                            BackgroundColor: c.value === -1 ? 0xffffff : c.value,
                          })
                        }
                      >
                        {c.value === -1 ? '✕' : ''}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Row 3 & 4: Spacing & Indent Controls with Steppers */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Left Column: Spacing */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium text-[var(--dl-muted)]">Spacing:</span>

                {/* Spacing Icons */}
                <div className="flex items-center gap-2 text-[#64b5f6] text-[11px]">
                  <span title="Above / Below Spacing">=↑ =↓</span>
                  <span title="Line Spacing">≡↑ ≡↓</span>
                </div>

                {/* Above Paragraph Input */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-[#64b5f6] font-mono">I</span>
                  <div className="flex flex-1 items-center justify-between rounded border border-[color-mix(in_srgb,var(--dl-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--dl-bg)_70%,black)] px-2 py-0.5">
                    <span className="text-xs">{spaceAbove} &quot;</span>
                    <div className="flex flex-col text-[8px] leading-none text-[var(--dl-muted)]">
                      <button type="button" className="hover:text-[var(--dl-fg)]" onClick={() => adjustSpacingAbove(0.05)}>▲</button>
                      <button type="button" className="hover:text-[var(--dl-fg)]" onClick={() => adjustSpacingAbove(-0.05)}>▼</button>
                    </div>
                  </div>
                </div>

                {/* Below Paragraph Input */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-[#64b5f6] font-mono">I</span>
                  <div className="flex flex-1 items-center justify-between rounded border border-[color-mix(in_srgb,var(--dl-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--dl-bg)_70%,black)] px-2 py-0.5">
                    <span className="text-xs">{spaceBelow} &quot;</span>
                    <div className="flex flex-col text-[8px] leading-none text-[var(--dl-muted)]">
                      <button type="button" className="hover:text-[var(--dl-fg)]" onClick={() => adjustSpacingBelow(0.05)}>▲</button>
                      <button type="button" className="hover:text-[var(--dl-fg)]" onClick={() => adjustSpacingBelow(-0.05)}>▼</button>
                    </div>
                  </div>
                </div>

                {/* Line Spacing dropdown button */}
                <div className="relative mt-1">
                  <button
                    type="button"
                    className="flex h-7 w-full items-center justify-between rounded border border-[var(--dl-border)] bg-[var(--dl-panel)] px-2 hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] text-[#64b5f6]"
                    disabled={disabled}
                    onClick={() => setLineSpacingOpen(!lineSpacingOpen)}
                  >
                    <span className="text-[11px] font-mono">↕ ≡ Line Spacing</span>
                    <span className="text-[9px] text-[var(--dl-muted)]">▾</span>
                  </button>
                  {lineSpacingOpen ? (
                    <div className="absolute left-0 top-full mt-1 w-full rounded-md border border-[var(--dl-border)] bg-[var(--dl-panel)] py-1 shadow-2xl z-50">
                      <button
                        type="button"
                        className="w-full px-2.5 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                        onClick={() => exec('.uno:SpacePara1')}
                      >
                        Single (1.0)
                      </button>
                      <button
                        type="button"
                        className="w-full px-2.5 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                        onClick={() => exec('.uno:SpacePara115')}
                      >
                        1.15 Lines
                      </button>
                      <button
                        type="button"
                        className="w-full px-2.5 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                        onClick={() => exec('.uno:SpacePara15')}
                      >
                        1.5 Lines
                      </button>
                      <button
                        type="button"
                        className="w-full px-2.5 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                        onClick={() => exec('.uno:SpacePara2')}
                      >
                        Double (2.0)
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Right Column: Indent */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium text-[var(--dl-muted)]">Indent:</span>

                {/* Indent Icons */}
                <div className="flex items-center gap-2 text-[#64b5f6] text-[11px]">
                  <span title="Before Text">→≡</span>
                  <span title="After Text">←≡</span>
                  <span title="First Line">→≡</span>
                </div>

                {/* Before Text Input */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#64b5f6] font-mono">⊢⊣</span>
                  <div className="flex flex-1 items-center justify-between rounded border border-[color-mix(in_srgb,var(--dl-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--dl-bg)_70%,black)] px-2 py-0.5">
                    <span className="text-xs">{indentBefore} &quot;</span>
                    <div className="flex flex-col text-[8px] leading-none text-[var(--dl-muted)]">
                      <button type="button" className="hover:text-[var(--dl-fg)]" onClick={() => adjustIndentBefore(0.1)}>▲</button>
                      <button type="button" className="hover:text-[var(--dl-fg)]" onClick={() => adjustIndentBefore(-0.1)}>▼</button>
                    </div>
                  </div>
                </div>

                {/* After Text Input */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#64b5f6] font-mono">⊢⊣</span>
                  <div className="flex flex-1 items-center justify-between rounded border border-[color-mix(in_srgb,var(--dl-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--dl-bg)_70%,black)] px-2 py-0.5">
                    <span className="text-xs">{indentAfter} &quot;</span>
                    <div className="flex flex-col text-[8px] leading-none text-[var(--dl-muted)]">
                      <button type="button" className="hover:text-[var(--dl-fg)]" onClick={() => adjustIndentAfter(0.1)}>▲</button>
                      <button type="button" className="hover:text-[var(--dl-fg)]" onClick={() => adjustIndentAfter(-0.1)}>▼</button>
                    </div>
                  </div>
                </div>

                {/* First Line Input */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#64b5f6] font-mono">⊢⊣</span>
                  <div className="flex flex-1 items-center justify-between rounded border border-[color-mix(in_srgb,var(--dl-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--dl-bg)_70%,black)] px-2 py-0.5">
                    <span className="text-xs">{indentFirst} &quot;</span>
                    <div className="flex flex-col text-[8px] leading-none text-[var(--dl-muted)]">
                      <button type="button" className="hover:text-[var(--dl-fg)]" onClick={() => adjustIndentFirst(0.1)}>▲</button>
                      <button type="button" className="hover:text-[var(--dl-fg)]" onClick={() => adjustIndentFirst(-0.1)}>▼</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
