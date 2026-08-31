'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/lib/workspace-store';
import type { EditorAdapter } from '@/editor/adapter';

interface EditorMenubarProps {
  editor: EditorAdapter | null;
  onDownload: () => Promise<void>;
}

interface MenuItem {
  label?: string;
  shortcut?: string;
  isDivider?: boolean;
  action?: () => void;
  disabled?: boolean;
}

interface MenuDefinition {
  title: string;
  items: MenuItem[];
}

export function EditorMenubar({ editor, onDownload }: EditorMenubarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menubarRef = useRef<HTMLDivElement>(null);

  const leftOpen = useWorkspaceStore((state) => state.leftOpen);
  const rightOpen = useWorkspaceStore((state) => state.rightOpen);
  const setLeftOpen = useWorkspaceStore((state) => state.setLeftOpen);
  const setRightOpen = useWorkspaceStore((state) => state.setRightOpen);
  const setLeftTab = useWorkspaceStore((state) => state.setLeftTab);

  const exec = useCallback(
    (command: string, args?: Record<string, unknown>) => {
      setOpenMenu(null);
      if (!editor) return;
      void editor.executeCommand({ type: 'uno', command, args });
    },
    [editor],
  );

  const disabled = !editor;

  // Close menus when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menubarRef.current && !menubarRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenu(null);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const menus: MenuDefinition[] = [
    {
      title: 'File',
      items: [
        {
          label: 'Save',
          shortcut: 'Ctrl+S',
          disabled,
          action: () => {
            setOpenMenu(null);
            void editor?.save();
          },
        },
        {
          label: 'Download DOCX',
          action: () => {
            setOpenMenu(null);
            void onDownload();
          },
        },
        { isDivider: true },
        {
          label: 'Page Setup…',
          disabled,
          action: () => exec('.uno:PageDialog'),
        },
        {
          label: 'Print…',
          shortcut: 'Ctrl+P',
          disabled,
          action: () => exec('.uno:Print'),
        },
      ],
    },
    {
      title: 'Edit',
      items: [
        {
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          disabled,
          action: () => {
            setOpenMenu(null);
            void editor?.executeCommand({ type: 'undo' });
          },
        },
        {
          label: 'Redo',
          shortcut: 'Ctrl+Y',
          disabled,
          action: () => {
            setOpenMenu(null);
            void editor?.executeCommand({ type: 'redo' });
          },
        },
        { isDivider: true },
        {
          label: 'Cut',
          shortcut: 'Ctrl+X',
          disabled,
          action: () => exec('.uno:Cut'),
        },
        {
          label: 'Copy',
          shortcut: 'Ctrl+C',
          disabled,
          action: () => exec('.uno:Copy'),
        },
        {
          label: 'Paste',
          shortcut: 'Ctrl+V',
          disabled,
          action: () => exec('.uno:Paste'),
        },
        {
          label: 'Select All',
          shortcut: 'Ctrl+A',
          disabled,
          action: () => exec('.uno:SelectAll'),
        },
        { isDivider: true },
        {
          label: 'Find & Replace…',
          shortcut: 'Ctrl+H',
          disabled,
          action: () => {
            setOpenMenu(null);
            void editor?.executeCommand({ type: 'find' });
          },
        },
        {
          label: 'Track Changes',
          disabled,
          action: () => exec('.uno:TrackChanges'),
        },
      ],
    },
    {
      title: 'View',
      items: [
        {
          label: 'Toggle Ruler',
          disabled,
          action: () => exec('.uno:Ruler'),
        },
        {
          label: 'Document Properties (Sidebar)',
          action: () => {
            setOpenMenu(null);
            setLeftTab('layout');
            setLeftOpen(true);
          },
        },
        {
          label: leftOpen ? 'Hide Tools Sidebar' : 'Show Tools Sidebar',
          action: () => {
            setOpenMenu(null);
            setLeftOpen(!leftOpen);
          },
        },
        {
          label: rightOpen ? 'Hide AI Assistant' : 'Show AI Assistant',
          action: () => {
            setOpenMenu(null);
            setRightOpen(!rightOpen);
          },
        },
        { isDivider: true },
        {
          label: 'Full Screen',
          shortcut: 'F11',
          disabled,
          action: () => exec('.uno:FullScreen'),
        },
        {
          label: 'Zoom 100%',
          disabled,
          action: () => exec('.uno:Zoom100Percent'),
        },
        {
          label: 'Zoom In',
          disabled,
          action: () => exec('.uno:ZoomPlus'),
        },
        {
          label: 'Zoom Out',
          disabled,
          action: () => exec('.uno:ZoomMinus'),
        },
      ],
    },
    {
      title: 'Insert',
      items: [
        {
          label: 'Page Break',
          shortcut: 'Ctrl+Enter',
          disabled,
          action: () => exec('.uno:InsertPagebreak'),
        },
        {
          label: 'Table…',
          disabled,
          action: () => exec('.uno:InsertTable'),
        },
        {
          label: 'Image / Graphic…',
          disabled,
          action: () => exec('.uno:InsertGraphic'),
        },
        {
          label: 'Link…',
          shortcut: 'Ctrl+K',
          disabled,
          action: () => exec('.uno:HyperlinkDialog'),
        },
        {
          label: 'Comment',
          shortcut: 'Ctrl+Alt+C',
          disabled,
          action: () => exec('.uno:InsertAnnotation'),
        },
        { isDivider: true },
        {
          label: 'Special Character…',
          disabled,
          action: () => exec('.uno:InsertSymbol'),
        },
        {
          label: 'Horizontal Line',
          disabled,
          action: () => exec('.uno:InsertHorizontalRule'),
        },
        {
          label: 'Bookmark…',
          disabled,
          action: () => exec('.uno:InsertBookmark'),
        },
        {
          label: 'Footnote',
          disabled,
          action: () => exec('.uno:InsertFootnote'),
        },
        {
          label: 'Endnote',
          disabled,
          action: () => exec('.uno:InsertEndnote'),
        },
        { isDivider: true },
        {
          label: 'Header',
          disabled,
          action: () => exec('.uno:InsertPageHeader'),
        },
        {
          label: 'Footer',
          disabled,
          action: () => exec('.uno:InsertPageFooter'),
        },
        {
          label: 'Page Number Field',
          disabled,
          action: () => exec('.uno:InsertPageNumberField'),
        },
      ],
    },
    {
      title: 'Format',
      items: [
        {
          label: 'Bold',
          shortcut: 'Ctrl+B',
          disabled,
          action: () => exec('.uno:Bold'),
        },
        {
          label: 'Italic',
          shortcut: 'Ctrl+I',
          disabled,
          action: () => exec('.uno:Italic'),
        },
        {
          label: 'Underline',
          shortcut: 'Ctrl+U',
          disabled,
          action: () => exec('.uno:Underline'),
        },
        {
          label: 'Strikethrough',
          disabled,
          action: () => exec('.uno:Strikeout'),
        },
        {
          label: 'Superscript',
          shortcut: 'Ctrl+Shift+P',
          disabled,
          action: () => exec('.uno:SuperScript'),
        },
        {
          label: 'Subscript',
          shortcut: 'Ctrl+Shift+B',
          disabled,
          action: () => exec('.uno:Subscript'),
        },
        { isDivider: true },
        {
          label: 'UPPERCASE',
          disabled,
          action: () => exec('.uno:ChangeCaseToUpper'),
        },
        {
          label: 'lowercase',
          disabled,
          action: () => exec('.uno:ChangeCaseToLower'),
        },
        {
          label: 'Capitalize Every Word',
          disabled,
          action: () => exec('.uno:ChangeCaseToTitle'),
        },
        {
          label: 'Clear Direct Formatting',
          shortcut: 'Ctrl+M',
          disabled,
          action: () => exec('.uno:ResetAttributes'),
        },
        { isDivider: true },
        {
          label: 'Paragraph Properties…',
          disabled,
          action: () => exec('.uno:ParagraphDialog'),
        },
        {
          label: 'Character Properties…',
          disabled,
          action: () => exec('.uno:FontDialog'),
        },
      ],
    },
    {
      title: 'References',
      items: [
        {
          label: 'Insert Table of Contents…',
          disabled,
          action: () => exec('.uno:InsertMultiIndex'),
        },
        {
          label: 'Insert Footnote',
          disabled,
          action: () => exec('.uno:InsertFootnote'),
        },
        {
          label: 'Insert Endnote',
          disabled,
          action: () => exec('.uno:InsertEndnote'),
        },
        {
          label: 'Cross-Reference…',
          disabled,
          action: () => exec('.uno:InsertReferenceField'),
        },
        {
          label: 'Bookmark…',
          disabled,
          action: () => exec('.uno:InsertBookmark'),
        },
      ],
    },
    {
      title: 'Table',
      items: [
        {
          label: 'Insert Table…',
          disabled,
          action: () => exec('.uno:InsertTable'),
        },
        { isDivider: true },
        {
          label: 'Insert Row Above',
          disabled,
          action: () => exec('.uno:InsertRowsBefore'),
        },
        {
          label: 'Insert Row Below',
          disabled,
          action: () => exec('.uno:InsertRowsAfter'),
        },
        {
          label: 'Insert Column Left',
          disabled,
          action: () => exec('.uno:InsertColumnsBefore'),
        },
        {
          label: 'Insert Column Right',
          disabled,
          action: () => exec('.uno:InsertColumnsAfter'),
        },
        { isDivider: true },
        {
          label: 'Delete Selected Rows',
          disabled,
          action: () => exec('.uno:DeleteRows'),
        },
        {
          label: 'Delete Selected Columns',
          disabled,
          action: () => exec('.uno:DeleteColumns'),
        },
        {
          label: 'Delete Table',
          disabled,
          action: () => exec('.uno:DeleteTable'),
        },
        { isDivider: true },
        {
          label: 'Merge Cells',
          disabled,
          action: () => exec('.uno:MergeCells'),
        },
        {
          label: 'Split Cells…',
          disabled,
          action: () => exec('.uno:SplitCell'),
        },
        {
          label: 'Table Properties…',
          disabled,
          action: () => exec('.uno:TableDialog'),
        },
      ],
    },
    {
      title: 'Tools',
      items: [
        {
          label: 'Spelling & Grammar',
          shortcut: 'F7',
          disabled,
          action: () => exec('.uno:SpellDialog'),
        },
        {
          label: 'Word Count & Statistics',
          disabled,
          action: () => exec('.uno:WordCountDialog'),
        },
        {
          label: 'Language Settings…',
          disabled,
          action: () => exec('.uno:LanguageStatus'),
        },
        {
          label: 'AutoCorrect Options…',
          disabled,
          action: () => exec('.uno:AutoCorrectDlg'),
        },
      ],
    },
    {
      title: 'Help',
      items: [
        {
          label: 'LibreOffice Writer Help',
          disabled,
          action: () => exec('.uno:HelpIndex'),
        },
        {
          label: 'About Delayance Workspace',
          action: () => {
            setOpenMenu(null);
            alert('Delayance: AI Document Intelligence Workspace with unified LibreOffice Writer integration.');
          },
        },
      ],
    },
  ];

  return (
    <div
      ref={menubarRef}
      className="flex items-center gap-0.5 text-xs text-[var(--dl-fg)] select-none z-30 -ml-1 mt-0.5"
      role="menubar"
    >
      {menus.map((menu) => {
        const isOpen = openMenu === menu.title;
        return (
          <div key={menu.title} className="relative">
            <button
              type="button"
              className={`rounded px-2 py-0.5 font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--dl-fg)_8%,transparent)] ${
                isOpen ? 'bg-[color-mix(in_srgb,var(--dl-fg)_12%,transparent)]' : ''
              }`}
              onClick={() => setOpenMenu(isOpen ? null : menu.title)}
              onMouseEnter={() => {
                if (openMenu !== null) setOpenMenu(menu.title);
              }}
              aria-haspopup="true"
              aria-expanded={isOpen}
            >
              {menu.title}
            </button>

            {isOpen ? (
              <div
                className="absolute left-0 top-full mt-1 min-w-[14rem] rounded-md border border-[var(--dl-border)] bg-[var(--dl-panel)] py-1 shadow-2xl backdrop-blur z-50 animate-in fade-in zoom-in-95 duration-100"
                role="menu"
              >
                {menu.items.map((item, idx) => {
                  if (item.isDivider) {
                    return <div key={`div-${idx}`} className="my-1 border-t border-[var(--dl-border)]" role="separator" />;
                  }
                  return (
                    <button
                      key={item.label}
                      type="button"
                      disabled={item.disabled}
                      className="flex w-full items-center justify-between px-3.5 py-1.5 text-left text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--dl-accent)_14%,transparent)] hover:text-[var(--dl-accent)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--dl-fg)]"
                      onClick={() => item.action?.()}
                      role="menuitem"
                    >
                      <span>{item.label}</span>
                      {item.shortcut ? (
                        <span className="ml-4 text-[10px] text-[var(--dl-muted)] font-mono">{item.shortcut}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
