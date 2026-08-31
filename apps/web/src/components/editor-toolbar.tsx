'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/lib/workspace-store';
import type { EditorAdapter } from '@/editor/adapter';

interface EditorToolbarProps {
  editor: EditorAdapter | null;
}

const STYLES = [
  { label: 'Normal Text', value: 'Default Paragraph Style' },
  { label: 'Heading 1', value: 'Heading 1' },
  { label: 'Heading 2', value: 'Heading 2' },
  { label: 'Heading 3', value: 'Heading 3' },
  { label: 'Title', value: 'Title' },
  { label: 'Subtitle', value: 'Subtitle' },
  { label: 'Text Body', value: 'Text body' },
  { label: 'Quotations', value: 'Quotations' },
];

const FONTS = [
  { label: 'Inter', value: 'Inter' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Calibri', value: 'Calibri' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Courier New', value: 'Courier New' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS' },
  { label: 'Verdana', value: 'Verdana' },
];

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'];

const TEXT_COLORS = [
  { label: 'Default / Black', value: 0x000000, hex: '#000000' },
  { label: 'Dark Gray', value: 0x555555, hex: '#555555' },
  { label: 'Light Gray', value: 0xaaaaaa, hex: '#aaaaaa' },
  { label: 'White', value: 0xffffff, hex: '#ffffff' },
  { label: 'Red', value: 0xd32f2f, hex: '#d32f2f' },
  { label: 'Orange', value: 0xf57c00, hex: '#f57c00' },
  { label: 'Amber', value: 0xffb300, hex: '#ffb300' },
  { label: 'Green', value: 0x388e3c, hex: '#388e3c' },
  { label: 'Teal', value: 0x00897b, hex: '#00897b' },
  { label: 'Blue', value: 0x1976d2, hex: '#1976d2' },
  { label: 'Indigo', value: 0x3f51b5, hex: '#3f51b5' },
  { label: 'Purple', value: 0x7b1fa2, hex: '#7b1fa2' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None', value: -1, hex: 'transparent' },
  { label: 'Yellow', value: 0xfff59d, hex: '#fff59d' },
  { label: 'Light Green', value: 0xc8e6c9, hex: '#c8e6c9' },
  { label: 'Cyan', value: 0xb2ebf2, hex: '#b2ebf2' },
  { label: 'Light Blue', value: 0xbbdefb, hex: '#bbdefb' },
  { label: 'Pink', value: 0xf8bbd0, hex: '#f8bbd0' },
  { label: 'Orange', value: 0xffe0b2, hex: '#ffe0b2' },
  { label: 'Light Red', value: 0xffcdd2, hex: '#ffcdd2' },
];

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [selectedStyle, setSelectedStyle] = useState('Default Paragraph Style');
  const [selectedFont, setSelectedFont] = useState('Inter');
  const [selectedSize, setSelectedSize] = useState('11');
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [highlightPickerOpen, setHighlightPickerOpen] = useState(false);
  const [lineSpacingOpen, setLineSpacingOpen] = useState(false);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const leftOpen = useWorkspaceStore((state) => state.leftOpen);
  const leftTab = useWorkspaceStore((state) => state.leftTab);
  const setLeftOpen = useWorkspaceStore((state) => state.setLeftOpen);
  const setLeftTab = useWorkspaceStore((state) => state.setLeftTab);

  const togglePropertiesPanel = useCallback(() => {
    if (leftOpen && leftTab === 'layout') {
      setLeftOpen(false);
    } else {
      setLeftTab('layout');
      setLeftOpen(true);
    }
  }, [leftOpen, leftTab, setLeftOpen, setLeftTab]);

  const exec = useCallback(
    (command: string, args?: Record<string, unknown>) => {
      setColorPickerOpen(false);
      setHighlightPickerOpen(false);
      setLineSpacingOpen(false);
      if (!editor) return;
      void editor.executeCommand({ type: 'uno', command, args });
    },
    [editor],
  );

  // Close dropdown pickers on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setColorPickerOpen(false);
        setHighlightPickerOpen(false);
        setLineSpacingOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleTextColor = useCallback(
    (colorVal: number) => {
      exec('.uno:Color', { Color: colorVal });
    },
    [exec],
  );

  const handleHighlightColor = useCallback(
    (colorVal: number) => {
      if (colorVal === -1) {
        exec('.uno:CharBackground', { CharBackground: 0xffffff });
      } else {
        exec('.uno:CharBackground', { CharBackground: colorVal });
        exec('.uno:CharBackColor', { CharBackColor: colorVal });
      }
    },
    [exec],
  );

  const disabled = !editor;

  return (
    <div
      ref={toolbarRef}
      className="dl-toolbar flex-wrap border-b border-[var(--dl-border)] bg-[var(--dl-panel)] px-2 py-1 gap-1 select-none"
      role="toolbar"
      aria-label="Document formatting"
    >
      {/* History & Clipboard */}
      <div className="dl-toolbar-group flex items-center gap-0.5">
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          disabled={disabled}
          onClick={() => void editor?.executeCommand({ type: 'undo' })}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          disabled={disabled}
          onClick={() => void editor?.executeCommand({ type: 'redo' })}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Format Painter (Clone Formatting)"
          aria-label="Format Painter"
          disabled={disabled}
          onClick={() => exec('.uno:FormatPaintbrush')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
            <path d="m5 2 5 5" />
            <path d="M2 13h15" />
            <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Clear Direct Formatting (Ctrl+M)"
          aria-label="Clear Direct Formatting"
          disabled={disabled}
          onClick={() => exec('.uno:ResetAttributes')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 21 10-18" />
            <path d="M19 16v5" />
            <path d="M16 19h6" />
            <path d="M4 7h10" />
            <path d="M9 7v13" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Print Document (Ctrl+P)"
          aria-label="Print Document"
          disabled={disabled}
          onClick={() => exec('.uno:Print')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
        </button>
      </div>

      <div className="dl-toolbar-divider" />

      {/* Paragraph Style Dropdown */}
      <div className="dl-toolbar-group dl-toolbar-select">
        <select
          value={selectedStyle}
          onChange={(e) => handleStyleChange(e.target.value)}
          disabled={disabled}
          aria-label="Paragraph style"
          className="min-w-[8rem]"
        >
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="dl-toolbar-divider" />

      {/* Font Family & Size */}
      <div className="dl-toolbar-group dl-toolbar-select dl-toolbar-font">
        <select
          value={selectedFont}
          onChange={(e) => handleFontChange(e.target.value)}
          disabled={disabled}
          aria-label="Font family"
        >
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="dl-toolbar-group dl-toolbar-select dl-toolbar-fontsize">
        <select
          value={selectedSize}
          onChange={(e) => handleSizeChange(e.target.value)}
          disabled={disabled}
          aria-label="Font size"
        >
          {FONT_SIZES.map((sz) => (
            <option key={sz} value={sz}>
              {sz}
            </option>
          ))}
        </select>
      </div>

      <div className="dl-toolbar-divider" />

      {/* Inline Styles & Sub/Super */}
      <div className="dl-toolbar-group flex items-center gap-0.5">
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Bold (Ctrl+B)"
          aria-label="Bold"
          disabled={disabled}
          onClick={() => exec('.uno:Bold')}
        >
          <span className="dl-tool-letter font-bold">B</span>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Italic (Ctrl+I)"
          aria-label="Italic"
          disabled={disabled}
          onClick={() => exec('.uno:Italic')}
        >
          <span className="dl-tool-letter italic font-serif">I</span>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Underline (Ctrl+U)"
          aria-label="Underline"
          disabled={disabled}
          onClick={() => exec('.uno:Underline')}
        >
          <span className="dl-tool-letter underline">U</span>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Strikethrough"
          aria-label="Strikethrough"
          disabled={disabled}
          onClick={() => exec('.uno:Strikeout')}
        >
          <span className="dl-tool-letter strike">S</span>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Superscript (Ctrl+Shift+P)"
          aria-label="Superscript"
          disabled={disabled}
          onClick={() => exec('.uno:SuperScript')}
        >
          <span className="text-[11px] font-semibold">X²</span>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Subscript (Ctrl+Shift+B)"
          aria-label="Subscript"
          disabled={disabled}
          onClick={() => exec('.uno:Subscript')}
        >
          <span className="text-[11px] font-semibold">X₂</span>
        </button>
      </div>

      <div className="dl-toolbar-divider" />

      {/* Text Color & Highlight Color */}
      <div className="dl-toolbar-group relative flex items-center gap-0.5">
        {/* Text Color */}
        <div className="relative">
          <button
            type="button"
            className="dl-toolbar-icon flex flex-col items-center justify-center"
            title="Text Color"
            aria-label="Text Color"
            disabled={disabled}
            onClick={() => {
              setColorPickerOpen(!colorPickerOpen);
              setHighlightPickerOpen(false);
            }}
          >
            <span className="text-xs font-bold leading-none">A</span>
            <span className="mt-0.5 h-1 w-3.5 rounded-sm bg-red-500" />
          </button>
          {colorPickerOpen ? (
            <div className="absolute left-0 top-full mt-1 grid grid-cols-4 gap-1 rounded-md border border-[var(--dl-border)] bg-[var(--dl-panel)] p-2 shadow-2xl z-50">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  className="h-5 w-5 rounded border border-black/20 transition-transform hover:scale-110"
                  style={{ backgroundColor: c.hex }}
                  onClick={() => handleTextColor(c.value)}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* Highlight Color */}
        <div className="relative">
          <button
            type="button"
            className="dl-toolbar-icon flex flex-col items-center justify-center"
            title="Highlight Color"
            aria-label="Highlight Color"
            disabled={disabled}
            onClick={() => {
              setHighlightPickerOpen(!highlightPickerOpen);
              setColorPickerOpen(false);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 11-6 6v3h3l6-6" />
              <path d="m22 7-3-3-9.5 9.5 3 3L22 7Z" />
            </svg>
            <span className="mt-0.5 h-1 w-3.5 rounded-sm bg-yellow-400" />
          </button>
          {highlightPickerOpen ? (
            <div className="absolute left-0 top-full mt-1 grid grid-cols-4 gap-1 rounded-md border border-[var(--dl-border)] bg-[var(--dl-panel)] p-2 shadow-2xl z-50">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  className="h-5 w-5 rounded border border-black/20 transition-transform hover:scale-110 flex items-center justify-center text-[10px]"
                  style={{ backgroundColor: c.hex }}
                  onClick={() => handleHighlightColor(c.value)}
                >
                  {c.value === -1 ? '✕' : ''}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="dl-toolbar-divider" />

      {/* Alignment & Line Spacing */}
      <div className="dl-toolbar-group flex items-center gap-0.5">
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Align Left"
          aria-label="Align Left"
          disabled={disabled}
          onClick={() => exec('.uno:LeftPara')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="17" y1="10" x2="3" y2="10" />
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="14" x2="3" y2="14" />
            <line x1="17" y1="18" x2="3" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Align Center"
          aria-label="Align Center"
          disabled={disabled}
          onClick={() => exec('.uno:CenterPara')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="10" x2="6" y2="10" />
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="14" x2="3" y2="14" />
            <line x1="18" y1="18" x2="6" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Align Right"
          aria-label="Align Right"
          disabled={disabled}
          onClick={() => exec('.uno:RightPara')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" y1="10" x2="7" y2="10" />
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="14" x2="3" y2="14" />
            <line x1="21" y1="18" x2="7" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Justify"
          aria-label="Justify"
          disabled={disabled}
          onClick={() => exec('.uno:JustifyPara')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="12" x2="3" y2="12" />
            <line x1="21" y1="18" x2="3" y2="18" />
          </svg>
        </button>

        {/* Line Spacing Dropdown */}
        <div className="relative">
          <button
            type="button"
            className="dl-toolbar-icon"
            title="Line Spacing"
            aria-label="Line Spacing"
            disabled={disabled}
            onClick={() => setLineSpacingOpen(!lineSpacingOpen)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
              <polyline points="7 15 5 18 3 15" />
              <polyline points="7 9 5 6 3 9" />
            </svg>
          </button>
          {lineSpacingOpen ? (
            <div className="absolute left-0 top-full mt-1 min-w-[7rem] rounded-md border border-[var(--dl-border)] bg-[var(--dl-panel)] py-1 shadow-2xl z-50">
              <button
                type="button"
                className="w-full px-3 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                onClick={() => exec('.uno:SpacePara1')}
              >
                1.0 Single
              </button>
              <button
                type="button"
                className="w-full px-3 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                onClick={() => exec('.uno:SpacePara115')}
              >
                1.15
              </button>
              <button
                type="button"
                className="w-full px-3 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                onClick={() => exec('.uno:SpacePara15')}
              >
                1.5
              </button>
              <button
                type="button"
                className="w-full px-3 py-1 text-left text-xs hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)]"
                onClick={() => exec('.uno:SpacePara2')}
              >
                2.0 Double
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="dl-toolbar-divider" />

      {/* Lists & Indent */}
      <div className="dl-toolbar-group flex items-center gap-0.5">
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Bullet List"
          aria-label="Bullet List"
          disabled={disabled}
          onClick={() => exec('.uno:DefaultBullet')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="4" cy="6" r="1.5" fill="currentColor" />
            <circle cx="4" cy="12" r="1.5" fill="currentColor" />
            <circle cx="4" cy="18" r="1.5" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Numbered List"
          aria-label="Numbered List"
          disabled={disabled}
          onClick={() => exec('.uno:DefaultNumbering')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="10" y1="6" x2="21" y2="6" />
            <line x1="10" y1="12" x2="21" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
            <path d="M4 6h1v4" />
            <path d="M4 10h2" />
            <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Decrease Indent"
          aria-label="Decrease Indent"
          disabled={disabled}
          onClick={() => exec('.uno:DecrementIndent')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 8 3 12 7 16" />
            <line x1="21" y1="12" x2="11" y2="12" />
            <line x1="21" y1="6" x2="11" y2="6" />
            <line x1="21" y1="18" x2="11" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Increase Indent"
          aria-label="Increase Indent"
          disabled={disabled}
          onClick={() => exec('.uno:IncrementIndent')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 8 11 12 7 16" />
            <line x1="3" y1="12" x2="7" y2="12" />
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="18" x2="3" y2="18" />
            <line x1="21" y1="12" x2="15" y2="12" />
          </svg>
        </button>
      </div>

      <div className="dl-toolbar-divider" />

      {/* Insertables */}
      <div className="dl-toolbar-group flex items-center gap-0.5">
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Insert Table"
          aria-label="Insert Table"
          disabled={disabled}
          onClick={() => exec('.uno:InsertTable')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Insert Link (Ctrl+K)"
          aria-label="Insert Link"
          disabled={disabled}
          onClick={() => exec('.uno:HyperlinkDialog')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Insert Comment (Ctrl+Alt+C)"
          aria-label="Insert Comment"
          disabled={disabled}
          onClick={() => exec('.uno:InsertAnnotation')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Insert Special Characters"
          aria-label="Special Characters"
          disabled={disabled}
          onClick={() => exec('.uno:InsertSymbol')}
        >
          <span className="text-xs font-serif font-bold">Ω</span>
        </button>
      </div>

      <div className="dl-toolbar-divider" />

      {/* Utilities & Document Properties Sidebar Toggle */}
      <div className="dl-toolbar-group flex items-center gap-0.5">
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Toggle Ruler"
          aria-label="Toggle Ruler"
          disabled={disabled}
          onClick={() => exec('.uno:Ruler')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z" />
            <path d="m14.5 3.5 2 2" />
            <path d="m11.5 6.5 2 2" />
            <path d="m8.5 9.5 2 2" />
            <path d="m5.5 12.5 2 2" />
          </svg>
        </button>
        <button
          type="button"
          className={`dl-toolbar-icon ${leftOpen && leftTab === 'layout' ? 'is-active' : ''}`}
          title="LibreOffice Properties & Layout (Sidebar)"
          aria-label="Document Properties and Layout Sidebar"
          onClick={togglePropertiesPanel}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
        <button
          type="button"
          className="dl-toolbar-icon"
          title="Find & Replace (Ctrl+H)"
          aria-label="Find and Replace"
          disabled={disabled}
          onClick={() => void editor?.executeCommand({ type: 'find' })}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>
    </div>
  );
}
