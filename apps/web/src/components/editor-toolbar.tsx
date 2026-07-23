'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { generateNodeId } from '@delayance/document-model';
import { apiFetch } from '@/lib/api';

interface EditorToolbarProps {
  editor: Editor | null;
  projectId: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onCiteError?: (message: string) => void;
  onToggleComments?: () => void;
}

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Garamond', value: 'Garamond, serif' },
] as const;

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'] as const;

export function EditorToolbar({
  editor,
  projectId,
  zoom,
  onZoomChange,
  onCiteError,
  onToggleComments,
}: EditorToolbarProps) {
  const [, setTick] = useState(0);
  const [styleOpen, setStyleOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((t) => t + 1);
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
    };
  }, [editor]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setStyleOpen(false);
        setAlignOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const insertCite = () => {
    void (async () => {
      try {
        const list = await apiFetch<{ id: string; title: string; aiMayUse: boolean }[]>(
          `/projects/${projectId}/sources`,
        );
        const usable = list.filter((s) => s.aiMayUse);
        if (!usable.length) {
          onCiteError?.('Add an AI-enabled source first');
          return;
        }
        const source = usable[0]!;
        editor
          ?.chain()
          .focus()
          .insertContent({
            type: 'citation',
            attrs: {
              id: generateNodeId(),
              sourceId: source.id,
              label: source.title,
            },
          })
          .run();
      } catch (err) {
        onCiteError?.(err instanceof Error ? err.message : 'Failed to insert citation');
      }
    })();
  };

  const styleLabel = (() => {
    if (!editor) return 'Normal text';
    if (editor.isActive('heading', { level: 1 })) return 'Heading 1';
    if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
    if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
    return 'Normal text';
  })();

  const alignLabel = (() => {
    if (!editor) return 'left';
    if (editor.isActive({ textAlign: 'center' })) return 'center';
    if (editor.isActive({ textAlign: 'right' })) return 'right';
    if (editor.isActive({ textAlign: 'justify' })) return 'justify';
    return 'left';
  })();

  const currentFontFamily = (() => {
    const value = (editor?.getAttributes('textStyle').fontFamily as string | undefined) ?? '';
    const match = FONT_FAMILIES.find((f) => f.value === value);
    return match?.value ?? value;
  })();

  const currentFontSize = (() => {
    const raw = (editor?.getAttributes('textStyle').fontSize as string | undefined) ?? '';
    const n = raw.replace(/pt$/i, '').trim();
    return FONT_SIZES.includes(n as (typeof FONT_SIZES)[number]) ? n : n || '11';
  })();

  return (
    <div className="dl-editor-chrome" ref={rootRef}>
      <div className="dl-toolbar" role="toolbar" aria-label="Formatting">
        <div className="dl-toolbar-group">
          <ToolIcon
            title="Undo"
            disabled={!editor?.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <IconUndo />
          </ToolIcon>
          <ToolIcon
            title="Redo"
            disabled={!editor?.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <IconRedo />
          </ToolIcon>
          <ToolIcon title="Print" onClick={() => window.print()}>
            <IconPrint />
          </ToolIcon>
        </div>

        <ToolbarDivider />

        <div className="dl-toolbar-group">
          <label className="dl-toolbar-select" title="Zoom">
            <select
              value={zoom}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              aria-label="Zoom"
            >
              {[50, 75, 90, 100, 125, 150, 200].map((z) => (
                <option key={z} value={z}>
                  {z}%
                </option>
              ))}
            </select>
          </label>
        </div>

        <ToolbarDivider />

        <div className="dl-toolbar-group dl-toolbar-dropdown-wrap">
          <button
            type="button"
            className={`dl-toolbar-dropdown ${styleOpen ? 'is-open' : ''}`}
            aria-expanded={styleOpen}
            aria-haspopup="listbox"
            onClick={() => {
              setStyleOpen((v) => !v);
              setAlignOpen(false);
            }}
          >
            <span>{styleLabel}</span>
            <IconChevron />
          </button>
          {styleOpen ? (
            <div className="dl-toolbar-menu" role="listbox">
              {(
                [
                  ['Normal text', () => editor?.chain().focus().setParagraph().run()],
                  ['Heading 1', () => editor?.chain().focus().toggleHeading({ level: 1 }).run()],
                  ['Heading 2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run()],
                  ['Heading 3', () => editor?.chain().focus().toggleHeading({ level: 3 }).run()],
                ] as const
              ).map(([label, action]) => (
                <button
                  key={label}
                  type="button"
                  role="option"
                  className={styleLabel === label ? 'is-active' : ''}
                  onClick={() => {
                    action();
                    setStyleOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="dl-toolbar-group">
          <label className="dl-toolbar-select dl-toolbar-font" title="Font">
            <select
              value={currentFontFamily}
              aria-label="Font"
              onChange={(e) => {
                const next = e.target.value;
                if (!next) {
                  editor?.chain().focus().unsetFontFamily().run();
                  return;
                }
                editor?.chain().focus().setFontFamily(next).run();
              }}
            >
              {FONT_FAMILIES.map((font) => (
                <option key={font.label} value={font.value} style={{ fontFamily: font.value || undefined }}>
                  {font.label}
                </option>
              ))}
              {currentFontFamily &&
              !FONT_FAMILIES.some((f) => f.value === currentFontFamily) ? (
                <option value={currentFontFamily}>{currentFontFamily}</option>
              ) : null}
            </select>
          </label>
          <label className="dl-toolbar-select dl-toolbar-fontsize" title="Font size">
            <select
              value={currentFontSize}
              aria-label="Font size"
              onChange={(e) => {
                const next = e.target.value;
                editor?.chain().focus().setFontSize(`${next}pt`).run();
              }}
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
              {!FONT_SIZES.includes(currentFontSize as (typeof FONT_SIZES)[number]) ? (
                <option value={currentFontSize}>{currentFontSize}</option>
              ) : null}
            </select>
          </label>
        </div>

        <ToolbarDivider />

        <div className="dl-toolbar-group">
          <ToolIcon
            title="Bold"
            active={editor?.isActive('bold')}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <span className="dl-tool-letter">B</span>
          </ToolIcon>
          <ToolIcon
            title="Italic"
            active={editor?.isActive('italic')}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <span className="dl-tool-letter italic">I</span>
          </ToolIcon>
          <ToolIcon
            title="Underline"
            active={editor?.isActive('underline')}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <span className="dl-tool-letter underline">U</span>
          </ToolIcon>
          <ToolIcon
            title="Strikethrough"
            active={editor?.isActive('strike')}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <span className="dl-tool-letter strike">S</span>
          </ToolIcon>
        </div>

        <ToolbarDivider />

        <div className="dl-toolbar-group">
          <ToolIcon title="Insert citation" onClick={insertCite}>
            <IconCite />
          </ToolIcon>
          <ToolIcon title="Insert comment" onClick={() => onToggleComments?.()}>
            <IconComment />
          </ToolIcon>
          <ToolIcon
            title="Insert table"
            onClick={() =>
              editor
                ?.chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            <IconTable />
          </ToolIcon>
          <ToolIcon
            title="Page break"
            onClick={() =>
              editor
                ?.chain()
                .focus()
                .insertContent({ type: 'pageBreak', attrs: { id: generateNodeId() } })
                .run()
            }
          >
            <IconPageBreak />
          </ToolIcon>
        </div>

        <ToolbarDivider />

        <div className="dl-toolbar-group dl-toolbar-dropdown-wrap">
          <button
            type="button"
            className={`dl-toolbar-icon ${alignOpen ? 'is-active' : ''}`}
            title="Align"
            aria-expanded={alignOpen}
            onClick={() => {
              setAlignOpen((v) => !v);
              setStyleOpen(false);
            }}
          >
            {alignLabel === 'center' ? (
              <IconAlignCenter />
            ) : alignLabel === 'right' ? (
              <IconAlignRight />
            ) : alignLabel === 'justify' ? (
              <IconAlignJustify />
            ) : (
              <IconAlignLeft />
            )}
            <IconChevron small />
          </button>
          {alignOpen ? (
            <div className="dl-toolbar-menu dl-toolbar-menu-icons" role="menu">
              {(
                [
                  ['left', <IconAlignLeft key="l" />],
                  ['center', <IconAlignCenter key="c" />],
                  ['right', <IconAlignRight key="r" />],
                  ['justify', <IconAlignJustify key="j" />],
                ] as const
              ).map(([align, icon]) => (
                <button
                  key={align}
                  type="button"
                  className={alignLabel === align ? 'is-active' : ''}
                  title={`Align ${align}`}
                  onClick={() => {
                    editor?.chain().focus().setTextAlign(align).run();
                    setAlignOpen(false);
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="dl-toolbar-group">
          <ToolIcon
            title="Line spacing / block quote"
            active={editor?.isActive('blockquote')}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <IconSpacing />
          </ToolIcon>
          <ToolIcon
            title="Bulleted list"
            active={editor?.isActive('bulletList')}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <IconBulletList />
          </ToolIcon>
          <ToolIcon
            title="Numbered list"
            active={editor?.isActive('orderedList')}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <IconNumberList />
          </ToolIcon>
          <ToolIcon
            title="Decrease indent"
            onClick={() => editor?.chain().focus().liftListItem('listItem').run()}
          >
            <IconOutdent />
          </ToolIcon>
          <ToolIcon
            title="Increase indent"
            onClick={() => editor?.chain().focus().sinkListItem('listItem').run()}
          >
            <IconIndent />
          </ToolIcon>
          <ToolIcon
            title="Clear formatting"
            onClick={() =>
              editor
                ?.chain()
                .focus()
                .unsetAllMarks()
                .unsetFontFamily()
                .unsetFontSize()
                .clearNodes()
                .run()
            }
          >
            <IconClearFormat />
          </ToolIcon>
        </div>
      </div>

      <EditorRuler />
    </div>
  );
}

function EditorRuler() {
  const ticks = Array.from({ length: 17 }, (_, i) => i);
  return (
    <div className="dl-ruler" aria-hidden="true">
      <div className="dl-ruler-margin dl-ruler-margin-left" />
      <div className="dl-ruler-track">
        {ticks.map((n) => (
          <div key={n} className="dl-ruler-tick" style={{ left: `${(n / 16) * 100}%` }}>
            {n > 0 && n < 16 ? <span>{n}</span> : null}
          </div>
        ))}
        <div className="dl-ruler-indent" style={{ left: '0%' }} />
        <div className="dl-ruler-indent dl-ruler-indent-right" style={{ right: '0%' }} />
      </div>
      <div className="dl-ruler-margin dl-ruler-margin-right" />
    </div>
  );
}

function ToolbarDivider() {
  return <div className="dl-toolbar-divider" aria-hidden="true" />;
}

function ToolIcon({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active ? true : undefined}
      disabled={disabled}
      className={`dl-toolbar-icon ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function IconChevron({ small }: { small?: boolean }) {
  const s = small ? 8 : 10;
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 7H5v4M5 7c2.5-3 6-4.5 10-3.5A8 8 0 0 1 20 14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRedo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 7h4v4M19 7c-2.5-3-6-4.5-10-3.5A8 8 0 0 0 4 14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPrint() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect x="7" y="14" width="10" height="6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconCite() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 8H5.5A2.5 2.5 0 0 0 3 10.5V14h5V8zm13 0h-2.5A2.5 2.5 0 0 0 16 10.5V14h5V8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconComment() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 6h14v10H9l-4 3V6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 9v0M9 9v0M15 9v0"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTable() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 10h16M4 15h16M10 5v14M14 5v14" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconPageBreak() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 4h12M6 20h12M4 12h4m3 0h2m3 0h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconAlignLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M4 10h10M4 14h16M4 18h10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconAlignCenter() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M7 10h10M4 14h16M7 18h10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconAlignRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M10 10h10M4 14h16M10 18h10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconAlignJustify() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M4 10h16M4 14h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSpacing() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 7h12M6 12h12M6 17h12M18 5v4M18 15v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M16 7l2-2 2 2M16 17l2 2 2-2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBulletList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="7" r="1.4" fill="currentColor" />
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="6" cy="17" r="1.4" fill="currentColor" />
      <path
        d="M10 7h10M10 12h10M10 17h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconNumberList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 6.5h1.5V10H5M5 13h2.5v.5L5 16.5h2.5M10 7h10M10 12h10M10 17h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconOutdent() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 7h8M4 12h16M12 17h8M9 9.5L6 12l3 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconIndent() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h8M4 12h16M4 17h8M12 9.5l3 2.5-3 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClearFormat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 6h10M10 6v12M7 18h6M15 9l5 10M17.5 14H20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
