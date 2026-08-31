'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import TiptapLink from '@tiptap/extension-link';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import CharacterCount from '@tiptap/extension-character-count';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Dropcursor from '@tiptap/extension-dropcursor';
import Typography from '@tiptap/extension-typography';
import { LineSpacing } from '@/components/line-spacing';
import { EditorFindReplace } from '@/components/editor-find-replace';
import {
  computeNumbering,
  type DocumentOperation,
  type NumberingMap,
} from '@delayance/document-engine';
import type { Document } from '@delayance/document-model';
import { generateNodeId } from '@delayance/document-model';
import { documentToPmJson, pmJsonToDocument } from '@delayance/editor-schema';
import { apiFetch, getAccessToken } from '@/lib/api';
import { useWorkspaceStore } from '@/lib/workspace-store';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { OutlinePanel } from '@/components/outline-panel';
import { CommentsPanel } from '@/components/comments-panel';
import { CommandPalette } from '@/components/command-palette';
import { AiPanel } from '@/components/ai-panel';
import { SourcesPanel } from '@/components/sources-panel';
import { ImportExportPanel } from '@/components/import-export-panel';
import { HealthPanel } from '@/components/health-panel';
import { SidebarResizeHandle } from '@/components/sidebar-resize-handle';
import { DocumentsList, LeftSidebarShell } from '@/components/left-sidebar';
import {
  Section,
  Figure,
  Caption,
  PageBreak,
  SectionBreak,
  CrossReference,
  Equation,
  Citation,
  Footnote,
  Appendix,
} from '@/components/editor-extensions';
import { StableIds } from '@/components/stable-ids';
import { EditorToolbar } from '@/components/editor-toolbar';
import { EditorMenubar } from '@/components/editor-menubar';
import { PrintPageGaps } from '@/components/print-page-gaps';
import { markdownToTiptapBlocks, WordStreamTyper } from '@/lib/markdown-stream';
import type { JSONContent } from '@tiptap/core';

interface CommentRow {
  id: string;
  anchorNodeId: string;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
}

export default function WorkspacePage() {
  const params = useParams<{ projectId: string; documentId: string }>();
  const router = useRouter();
  const { projectId, documentId } = params;

  const leftOpen = useWorkspaceStore((s) => s.leftOpen);
  const rightOpen = useWorkspaceStore((s) => s.rightOpen);
  const leftWidth = useWorkspaceStore((s) => s.leftWidth);
  const rightWidth = useWorkspaceStore((s) => s.rightWidth);
  const leftTab = useWorkspaceStore((s) => s.leftTab);
  const layoutMode = useWorkspaceStore((s) => s.layoutMode);
  const saveStatus = useWorkspaceStore((s) => s.saveStatus);
  const selectedNodeId = useWorkspaceStore((s) => s.selectedNodeId);
  const setLeftOpen = useWorkspaceStore((s) => s.setLeftOpen);
  const setRightOpen = useWorkspaceStore((s) => s.setRightOpen);
  const setLeftWidth = useWorkspaceStore((s) => s.setLeftWidth);
  const setRightWidth = useWorkspaceStore((s) => s.setRightWidth);
  const setLeftTab = useWorkspaceStore((s) => s.setLeftTab);
  const setLayoutMode = useWorkspaceStore((s) => s.setLayoutMode);
  const setSaveStatus = useWorkspaceStore((s) => s.setSaveStatus);
  const setSelectedNodeId = useWorkspaceStore((s) => s.setSelectedNodeId);

  const [docMeta, setDocMeta] = useState<{ title: string } | null>(null);
  const [documentModel, setDocumentModel] = useState<Document | null>(null);
  const [docs, setDocs] = useState<{ id: string; title: string }[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [numbering, setNumbering] = useState<NumberingMap>({});
  const [error, setError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [editorZoom, setEditorZoom] = useState(100);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedId = useRef<string | null>(null);
  const updating = useRef(false);
  const aiStreaming = useRef(false);
  const preStreamDoc = useRef<Document | null>(null);
  const preStreamJson = useRef<JSONContent | null>(null);
  const streamTyper = useRef<WordStreamTyper | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindReplaceOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      TiptapLink.configure({
        openOnClick: false,
        autolink: true,
      }),
      Color,
      Highlight.configure({ multicolor: true }),
      CharacterCount,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
      Section,
      Appendix,
      Figure,
      Caption,
      PageBreak,
      SectionBreak,
      CrossReference,
      Equation,
      Citation,
      Footnote,
      StableIds,
      PrintPageGaps,
      Superscript,
      Subscript,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Dropcursor.configure({ color: 'var(--dl-accent)', width: 2 }),
      Typography,
      LineSpacing,
    ],
    onUpdate: ({ editor: ed }) => {
      if (updating.current || aiStreaming.current || !documentModel) return;
      const next = pmJsonToDocument(ed.getJSON() as never, {
        id: documentModel.id,
        title: documentModel.title,
        template: documentModel.template,
      });
      setDocumentModel(next);
      setNumbering(computeNumbering(next));
      setSaveStatus('dirty');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaveStatus('saving');
        try {
          await apiFetch(`/projects/${projectId}/documents/${documentId}/content`, {
            method: 'PATCH',
            body: JSON.stringify({
              content: next,
              createVersion: true,
              versionReason: 'autosave',
            }),
          });
          setSaveStatus('saved');
        } catch (err) {
          setSaveStatus('error');
          setError(err instanceof Error ? err.message : 'Save failed');
        }
      }, 1500);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const section = ed.getAttributes('section');
      const heading = ed.getAttributes('heading');
      const paragraph = ed.getAttributes('paragraph');
      setSelectedNodeId(
        (section.id as string) ||
          (heading.id as string) ||
          (paragraph.id as string) ||
          null,
      );
    },
  });

  const syncFromModel = useCallback(
    (model: Document) => {
      setDocumentModel(model);
      setNumbering(computeNumbering(model));
      if (editor && !editor.isDestroyed) {
        updating.current = true;
        editor.commands.setContent(documentToPmJson(model), { emitUpdate: false });
        // Keep the guard through TipTap's sync turn so onUpdate cannot clobber
        queueMicrotask(() => {
          updating.current = false;
        });
      }
    },
    [editor],
  );

  const renderStreamMarkdown = useCallback(
    (markdown: string) => {
      if (!editor || editor.isDestroyed || !preStreamJson.current) return;
      updating.current = true;
      const base = structuredClone(preStreamJson.current) as JSONContent;
      const draftBlocks = markdownToTiptapBlocks(markdown);
      const existing = Array.isArray(base.content) ? base.content : [];
      base.content = [
        ...existing,
        {
          type: 'section',
          attrs: { id: 'ai-stream-draft' },
          content: draftBlocks,
        },
      ];
      editor.commands.setContent(base, { emitUpdate: false });
      // Keep caret near the end of the live draft
      editor.commands.focus('end');
    },
    [editor],
  );

  const appendAiStreamText = useCallback(
    (text: string) => {
      streamTyper.current?.push(text);
    },
    [],
  );

  const beginAiStream = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    preStreamDoc.current = documentModel;
    preStreamJson.current = editor.getJSON();
    aiStreaming.current = true;
    updating.current = true;
    streamTyper.current?.destroy();
    streamTyper.current = new WordStreamTyper((full) => {
      renderStreamMarkdown(full);
    }, 28);
  }, [editor, documentModel, renderStreamMarkdown]);

  const finishAiStream = useCallback(
    (next: Document | null) => {
      const typer = streamTyper.current;
      const snapshot = preStreamDoc.current;
      void (async () => {
        if (typer) await typer.flush();
        typer?.destroy();
        if (streamTyper.current === typer) streamTyper.current = null;
        aiStreaming.current = false;
        updating.current = false;
        preStreamDoc.current = null;
        preStreamJson.current = null;
        if (next) {
          syncFromModel(next);
          setSaveStatus('saved');
        } else if (snapshot) {
          syncFromModel(snapshot);
        }
      })();
    },
    [syncFromModel],
  );

  const abortAiStream = useCallback(() => {
    streamTyper.current?.destroy();
    streamTyper.current = null;
    const snapshot = preStreamDoc.current;
    aiStreaming.current = false;
    updating.current = false;
    preStreamDoc.current = null;
    preStreamJson.current = null;
    if (snapshot) syncFromModel(snapshot);
  }, [syncFromModel]);

  // When the editor mounts after the document fetch, push model → editor
  useEffect(() => {
    if (!editor || editor.isDestroyed || !documentModel) return;
    if (loadedId.current !== documentModel.id) return;
    updating.current = true;
    editor.commands.setContent(documentToPmJson(documentModel), { emitUpdate: false });
    queueMicrotask(() => {
      updating.current = false;
    });
  }, [editor]);

  const applyLocalOp = useCallback(
    async (operation: DocumentOperation) => {
      try {
        const result = await apiFetch<{
          document: { content: Document; title: string };
        }>(`/projects/${projectId}/documents/${documentId}/operations`, {
          method: 'POST',
          body: JSON.stringify({ operation }),
        });
        syncFromModel(result.document.content);
        setDocMeta({ title: result.document.title });
        setSaveStatus('saved');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Operation failed');
      }
    },
    [projectId, documentId, syncFromModel, setSaveStatus],
  );

  useEffect(() => {
    if (!getAccessToken()) {
      router.push('/login');
      return;
    }
    void (async () => {
      try {
        const [doc, list, commentList] = await Promise.all([
          apiFetch<{ title: string; content: Document }>(
            `/projects/${projectId}/documents/${documentId}`,
          ),
          apiFetch<{ id: string; title: string }[]>(`/projects/${projectId}/documents`),
          apiFetch<CommentRow[]>(`/projects/${projectId}/documents/${documentId}/comments`),
        ]);
        setDocMeta({ title: doc.title });
        setDocs(list);
        setComments(commentList);
        loadedId.current = doc.content.id;
        syncFromModel(doc.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document');
      }
    })();
  }, [projectId, documentId, router, syncFromModel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-[var(--dl-bg)] text-[var(--dl-fg)]">
      <header className="dl-app-topbar">
        <div className="dl-app-topbar-main">
          <Link
            href="/projects"
            className="dl-app-topbar-back"
            title="Back to projects"
          >
            ←
          </Link>
          <div className="dl-doc-icon" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
              <rect x="6" y="4" width="28" height="32" rx="3" fill="var(--dl-accent)" />
              <path
                d="M13 14h14M13 20h14M13 26h9"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="dl-app-topbar-title-block">
            <div className="dl-app-topbar-title-row">
              <h1 className="dl-app-topbar-title">{docMeta?.title ?? 'Document'}</h1>
              <span className="dl-app-topbar-status" title="Save status">
                {saveStatus}
              </span>
            </div>
            <EditorMenubar
              editor={editor}
              projectId={projectId}
              layoutMode={layoutMode}
              onLayoutModeChange={setLayoutMode}
              onCiteError={setError}
              onOpenPalette={() => setPaletteOpen(true)}
              onToggleComments={() => {
                setLeftOpen(true);
                setLeftTab('comments');
              }}
              onToggleAi={() => setRightOpen(!rightOpen)}
              onToggleLeft={() => setLeftOpen(!leftOpen)}
              aiOpen={rightOpen}
              leftOpen={leftOpen}
            />
          </div>
          <div className="dl-app-topbar-actions">
            <span className="dl-mode-chip" title="Editing mode">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M13 6.5l4.5 4.5" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Editing
            </span>
            <button
              type="button"
              className="dl-topbar-btn"
              onClick={() => setPaletteOpen(true)}
              title="Command palette"
            >
              ⌘K
            </button>
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      {error ? (
        <div className="border-b border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {leftOpen ? (
          <aside
            className="relative flex shrink-0 flex-col border-r border-[var(--dl-border)] bg-[var(--dl-panel)]"
            style={{ width: leftWidth }}
          >
            <LeftSidebarShell
              leftTab={leftTab}
              onTabChange={setLeftTab}
              onCollapse={() => setLeftOpen(false)}
            >
              {leftTab === 'documents' ? (
                <DocumentsList
                  projectId={projectId}
                  documentId={documentId}
                  docs={docs}
                  onRefreshDocs={async () => {
                    setDocs(
                      await apiFetch<{ id: string; title: string }[]>(
                        `/projects/${projectId}/documents`,
                      ),
                    );
                  }}
                />
              ) : null}

              {leftTab === 'outline' && documentModel ? (
                <OutlinePanel
                  projectId={projectId}
                  documentId={documentId}
                  document={documentModel}
                  numbering={numbering}
                  onOperate={applyLocalOp}
                  onReload={() => {
                    void (async () => {
                      const doc = await apiFetch<{ title: string; content: Document }>(
                        `/projects/${projectId}/documents/${documentId}`,
                      );
                      setDocMeta({ title: doc.title });
                      syncFromModel(doc.content);
                    })();
                  }}
                />
              ) : null}
              {leftTab === 'memory' ? (
                <p className="dl-tools-empty">
                  Edit project memory from the{' '}
                  <Link href={`/projects/${projectId}`}>project hub</Link>.
                </p>
              ) : null}
              {leftTab === 'sources' ? <SourcesPanel projectId={projectId} /> : null}
              {leftTab === 'comments' ? (
                <CommentsPanel
                  projectId={projectId}
                  documentId={documentId}
                  comments={comments}
                  selectedNodeId={selectedNodeId}
                  onRefresh={async () => {
                    setComments(
                      await apiFetch(
                        `/projects/${projectId}/documents/${documentId}/comments`,
                      ),
                    );
                  }}
                />
              ) : null}
              {leftTab === 'health' ? (
                <HealthPanel
                  projectId={projectId}
                  documentId={documentId}
                  onSelectNode={(id) => setSelectedNodeId(id)}
                />
              ) : null}
              {leftTab === 'layout' ? (
                <p className="dl-tools-empty">
                  Use the header toggle for continuous vs print page chrome. Document template
                  margins apply to print layout width.
                </p>
              ) : null}
              {leftTab === 'io' ? (
                <ImportExportPanel
                  projectId={projectId}
                  documentId={documentId}
                  documentModel={documentModel}
                  onApplyContent={(content) => syncFromModel(content)}
                />
              ) : null}
            </LeftSidebarShell>
            <SidebarResizeHandle side="left" onResize={setLeftWidth} />
          </aside>
        ) : (
          <div className="dl-sidebar-edge dl-sidebar-edge-left" aria-label="Tools panel">
            <button
              type="button"
              className="dl-sidebar-toggle-btn"
              title="Show tools panel"
              aria-label="Show tools panel"
              onClick={() => setLeftOpen(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect
                  x="3.5"
                  y="4.5"
                  width="17"
                  height="15"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path d="M9 4.5v15" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M6.2 9.5l1.7 2.5-1.7 2.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!documentModel ? (
            <div className="flex flex-1 items-center justify-center text-base text-[var(--dl-muted)]">
              Loading document…
            </div>
          ) : (
            <>
              <EditorToolbar
                editor={editor}
                projectId={projectId}
                zoom={editorZoom}
                onZoomChange={setEditorZoom}
                onCiteError={setError}
                onToggleComments={() => {
                  setLeftOpen(true);
                  setLeftTab('comments');
                }}
                onToggleFindReplace={() => setFindReplaceOpen((v) => !v)}
              />
              <div className="dl-preview-desk relative">
                <div className="absolute top-3 right-5 z-40">
                  <EditorFindReplace
                    editor={editor}
                    isOpen={findReplaceOpen}
                    onClose={() => setFindReplaceOpen(false)}
                  />
                </div>
                <div
                  className="dl-preview-zoom"
                  style={{
                    transform: `scale(${editorZoom / 100})`,
                    transformOrigin: 'top center',
                  }}
                >
                  <div
                    className={`dl-doc-sheet ${
                      layoutMode === 'print'
                        ? 'dl-doc-sheet-print dl-print-surface'
                        : 'dl-doc-sheet-continuous'
                    }`}
                  >
                    <EditorContent editor={editor} className="prose-doc" />
                  </div>
                </div>
                <div className="absolute bottom-2 right-4 flex items-center gap-3 rounded-full bg-[var(--dl-panel)]/80 backdrop-blur px-3 py-1 text-[11px] text-[var(--dl-muted)] border border-[var(--dl-border)] shadow-sm pointer-events-none">
                  <span>
                    Words:{' '}
                    <strong className="text-[var(--dl-fg)] font-medium">
                      {editor?.storage.characterCount?.words?.() ??
                        editor
                          ?.getText()
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean).length ??
                        0}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Characters:{' '}
                    <strong className="text-[var(--dl-fg)] font-medium">
                      {editor?.storage.characterCount?.characters?.() ??
                        editor?.getText().length ??
                        0}
                    </strong>
                  </span>
                </div>
              </div>
            </>
          )}
        </main>

        {rightOpen ? (
          <aside
            className="dl-ai-sidebar relative flex shrink-0 flex-col border-l border-[var(--dl-border)] bg-[var(--dl-panel)]"
            style={{ width: rightWidth }}
          >
            <SidebarResizeHandle side="right" onResize={setRightWidth} />
            <AiPanel
              projectId={projectId}
              documentId={documentId}
              selectedNodeId={selectedNodeId}
              onCollapse={() => setRightOpen(false)}
              onStreamStart={beginAiStream}
              onStreamToken={appendAiStreamText}
              onStreamFinish={finishAiStream}
              onStreamAbort={abortAiStream}
              onAccepted={() => {
                void (async () => {
                  const doc = await apiFetch<{ title: string; content: Document }>(
                    `/projects/${projectId}/documents/${documentId}`,
                  );
                  setDocMeta({ title: doc.title });
                  syncFromModel(doc.content);
                })();
              }}
            />
          </aside>
        ) : (
          <div className="dl-sidebar-edge dl-sidebar-edge-right" aria-label="AI panel">
            <button
              type="button"
              className="dl-sidebar-toggle-btn"
              title="Show AI panel"
              aria-label="Show AI panel"
              onClick={() => setRightOpen(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect
                  x="3.5"
                  y="4.5"
                  width="17"
                  height="15"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path d="M15 4.5v15" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M17.8 9.5l-1.7 2.5 1.7 2.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onAction={(action) => {
          if (action === 'toggle-left') setLeftOpen(!leftOpen);
          if (action === 'toggle-right') setRightOpen(!rightOpen);
          if (action === 'print-layout') setLayoutMode('print');
          if (action === 'continuous') setLayoutMode('continuous');
          if (action === 'insert-section') {
            void applyLocalOp({
              type: 'insert',
              parentId: null,
              position: 'into',
              node: {
                id: generateNodeId(),
                type: 'section',
                children: [
                  {
                    id: generateNodeId(),
                    type: 'heading',
                    level: 1,
                    content: [{ type: 'text', text: 'New section' }],
                  },
                ],
              },
            });
          }
        }}
      />
    </div>
  );
}
