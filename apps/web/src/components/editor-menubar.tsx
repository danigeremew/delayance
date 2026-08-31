'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { generateNodeId } from '@delayance/document-model';
import { apiFetch } from '@/lib/api';

type MenuId =
  | 'file'
  | 'edit'
  | 'view'
  | 'insert'
  | 'format'
  | 'tools'
  | 'help'
  | null;

export interface EditorMenubarProps {
  editor: Editor | null;
  projectId: string;
  layoutMode: 'continuous' | 'print';
  onLayoutModeChange: (mode: 'continuous' | 'print') => void;
  onCiteError?: (message: string) => void;
  onOpenPalette?: () => void;
  onToggleComments?: () => void;
  onToggleAi?: () => void;
  onToggleLeft?: () => void;
  aiOpen?: boolean;
  leftOpen?: boolean;
}

export function EditorMenubar({
  editor,
  projectId,
  layoutMode,
  onLayoutModeChange,
  onCiteError,
  onOpenPalette,
  onToggleComments,
  onToggleAi,
  onToggleLeft,
  aiOpen,
  leftOpen,
}: EditorMenubarProps) {
  const [, setTick] = useState(0);
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
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
      if (!rootRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const closeMenus = useCallback(() => setOpenMenu(null), []);

  const run = useCallback(
    (fn: (ed: Editor) => void) => {
      if (!editor) return;
      fn(editor);
      closeMenus();
    },
    [editor, closeMenus],
  );

  const insertCite = useCallback(() => {
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
      closeMenus();
    })();
  }, [editor, projectId, onCiteError, closeMenus]);

  const toggle = (id: MenuId) => setOpenMenu((cur) => (cur === id ? null : id));

  return (
    <div className="dl-menubar dl-menubar-top" ref={rootRef}>
      <nav className="dl-menubar-menus" aria-label="Document menus">
        <MenuTrigger label="File" open={openMenu === 'file'} onToggle={() => toggle('file')}>
          <MenuItem
            label="Print layout"
            onClick={() => {
              onLayoutModeChange(layoutMode === 'print' ? 'continuous' : 'print');
              closeMenus();
            }}
          />
          <MenuItem
            label="Print…"
            shortcut="⌘P"
            onClick={() => {
              window.print();
              closeMenus();
            }}
          />
          <MenuDivider />
          <MenuItem
            label="Command palette…"
            shortcut="⌘K"
            onClick={() => {
              onOpenPalette?.();
              closeMenus();
            }}
          />
        </MenuTrigger>

        <MenuTrigger label="Edit" open={openMenu === 'edit'} onToggle={() => toggle('edit')}>
          <MenuItem
            label="Undo"
            shortcut="⌘Z"
            disabled={!editor?.can().undo()}
            onClick={() => run((ed) => ed.chain().focus().undo().run())}
          />
          <MenuItem
            label="Redo"
            shortcut="⌘⇧Z"
            disabled={!editor?.can().redo()}
            onClick={() => run((ed) => ed.chain().focus().redo().run())}
          />
          <MenuDivider />
          <MenuItem
            label="Cut"
            shortcut="⌘X"
            onClick={() => {
              document.execCommand('cut');
              closeMenus();
            }}
          />
          <MenuItem
            label="Copy"
            shortcut="⌘C"
            onClick={() => {
              document.execCommand('copy');
              closeMenus();
            }}
          />
          <MenuItem
            label="Paste"
            shortcut="⌘V"
            onClick={() => {
              void navigator.clipboard.readText().then((text) => {
                editor?.chain().focus().insertContent(text).run();
              });
              closeMenus();
            }}
          />
          <MenuDivider />
          <MenuItem
            label="Select all"
            shortcut="⌘A"
            onClick={() => run((ed) => ed.chain().focus().selectAll().run())}
          />
        </MenuTrigger>

        <MenuTrigger label="View" open={openMenu === 'view'} onToggle={() => toggle('view')}>
          <MenuItem
            label={layoutMode === 'print' ? '✓ Print layout' : 'Print layout'}
            onClick={() => {
              onLayoutModeChange('print');
              closeMenus();
            }}
          />
          <MenuItem
            label={layoutMode === 'continuous' ? '✓ Continuous' : 'Continuous'}
            onClick={() => {
              onLayoutModeChange('continuous');
              closeMenus();
            }}
          />
          <MenuDivider />
          <MenuItem
            label={leftOpen ? 'Hide tools panel' : 'Show tools panel'}
            onClick={() => {
              onToggleLeft?.();
              closeMenus();
            }}
          />
          <MenuItem
            label={aiOpen ? 'Hide AI panel' : 'Show AI panel'}
            onClick={() => {
              onToggleAi?.();
              closeMenus();
            }}
          />
        </MenuTrigger>

        <MenuTrigger label="Insert" open={openMenu === 'insert'} onToggle={() => toggle('insert')}>
          <MenuItem
            label="Page break"
            onClick={() =>
              run((ed) =>
                ed
                  .chain()
                  .focus()
                  .insertContent({ type: 'pageBreak', attrs: { id: generateNodeId() } })
                  .run(),
              )
            }
          />
          <MenuItem
            label="Table"
            onClick={() =>
              run((ed) =>
                ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
              )
            }
          />
          <MenuItem
            label="Horizontal line"
            onClick={() => run((ed) => ed.chain().focus().setHorizontalRule().run())}
          />
          <MenuItem label="Citation" onClick={insertCite} />
          <MenuItem
            label="Block quote"
            onClick={() => run((ed) => ed.chain().focus().toggleBlockquote().run())}
          />
          <MenuDivider />
          <MenuItem
            label="Image"
            onClick={() => {
              const url = window.prompt('Image URL:');
              if (url) run((ed) => ed.chain().focus().setImage({ src: url }).run());
            }}
          />
          <MenuItem
            label="Task list"
            onClick={() => run((ed) => ed.chain().focus().toggleTaskList().run())}
          />
        </MenuTrigger>

        <MenuTrigger label="Format" open={openMenu === 'format'} onToggle={() => toggle('format')}>
          <MenuItem
            label="Bold"
            shortcut="⌘B"
            onClick={() => run((ed) => ed.chain().focus().toggleBold().run())}
          />
          <MenuItem
            label="Italic"
            shortcut="⌘I"
            onClick={() => run((ed) => ed.chain().focus().toggleItalic().run())}
          />
          <MenuItem
            label="Underline"
            shortcut="⌘U"
            onClick={() => run((ed) => ed.chain().focus().toggleUnderline().run())}
          />
          <MenuItem
            label="Strikethrough"
            onClick={() => run((ed) => ed.chain().focus().toggleStrike().run())}
          />
          <MenuDivider />
          <MenuItem
            label="Bulleted list"
            onClick={() => run((ed) => ed.chain().focus().toggleBulletList().run())}
          />
          <MenuItem
            label="Numbered list"
            onClick={() => run((ed) => ed.chain().focus().toggleOrderedList().run())}
          />
          <MenuDivider />
          <MenuItem
            label="Clear formatting"
            onClick={() => run((ed) => ed.chain().focus().unsetAllMarks().clearNodes().run())}
          />
          <MenuDivider />
          <MenuItem
            label="Superscript"
            shortcut="⌘."
            onClick={() => run((ed) => ed.chain().focus().toggleSuperscript().run())}
          />
          <MenuItem
            label="Subscript"
            shortcut="⌘,"
            onClick={() => run((ed) => ed.chain().focus().toggleSubscript().run())}
          />
        </MenuTrigger>

        <MenuTrigger label="Tools" open={openMenu === 'tools'} onToggle={() => toggle('tools')}>
          <MenuItem
            label="Command palette…"
            shortcut="⌘K"
            onClick={() => {
              onOpenPalette?.();
              closeMenus();
            }}
          />
          <MenuItem
            label="Comments"
            onClick={() => {
              onToggleComments?.();
              closeMenus();
            }}
          />
        </MenuTrigger>

        <button
          type="button"
          className={`dl-menu-trigger dl-menu-trigger-ai ${aiOpen ? 'is-open' : ''}`}
          title="Toggle AI panel"
          onClick={() => {
            onToggleAi?.();
            closeMenus();
          }}
        >
          AI
        </button>

        <MenuTrigger label="Help" open={openMenu === 'help'} onToggle={() => toggle('help')}>
          <MenuItem
            label="Keyboard shortcuts"
            shortcut="⌘K"
            onClick={() => {
              onOpenPalette?.();
              closeMenus();
            }}
          />
          <MenuItem
            label="Editing mode"
            onClick={() => {
              closeMenus();
            }}
          />
        </MenuTrigger>
      </nav>
    </div>
  );
}

function MenuTrigger({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="dl-menu">
      <button
        type="button"
        className={`dl-menu-trigger ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        {label}
      </button>
      {open ? (
        <div className="dl-menu-panel" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  label,
  shortcut,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="dl-menu-item"
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      {shortcut ? <span className="dl-menu-shortcut">{shortcut}</span> : null}
    </button>
  );
}

function MenuDivider() {
  return <div className="dl-menu-divider" role="separator" />;
}
