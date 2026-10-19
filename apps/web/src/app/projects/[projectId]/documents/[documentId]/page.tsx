'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiDownload, apiFetch } from '@/lib/api';
import { useWorkspaceStore } from '@/lib/workspace-store';
import { BrandLogo } from '@/components/brand-logo';
import { SourcesPanel } from '@/components/sources-panel';
import { HealthPanel } from '@/components/health-panel';
import { AiPanel } from '@/components/ai-panel';
import { SidebarResizeHandle } from '@/components/sidebar-resize-handle';
import { DocumentsList, LeftSidebarShell } from '@/components/left-sidebar';
import { WordcraftEditor } from '@/components/wordcraft-editor';
import { OfficeOutlinePanel } from '@/components/office-outline-panel';
import { fitWorkspacePanels, type WordcraftLayout } from '@/editor/workspace-layout';
import type { EditorAdapter, EditorCommand, EditorSaveState } from '@/editor/adapter';

export default function WorkspacePage() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>();
  const router = useRouter();
  const leftOpen = useWorkspaceStore((state) => state.leftOpen);
  const rightOpen = useWorkspaceStore((state) => state.rightOpen);
  const leftWidth = useWorkspaceStore((state) => state.leftWidth);
  const rightWidth = useWorkspaceStore((state) => state.rightWidth);
  const leftTab = useWorkspaceStore((state) => state.leftTab);
  const setLeftOpen = useWorkspaceStore((state) => state.setLeftOpen);
  const setRightOpen = useWorkspaceStore((state) => state.setRightOpen);
  const setLeftWidth = useWorkspaceStore((state) => state.setLeftWidth);
  const setRightWidth = useWorkspaceStore((state) => state.setRightWidth);
  const setLeftTab = useWorkspaceStore((state) => state.setLeftTab);
  const workspace = useRef<HTMLDivElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [layout, setLayout] = useState<WordcraftLayout | null>(null);
  const panels = fitWorkspacePanels(
    workspaceWidth,
    leftOpen ? leftWidth : 0,
    rightOpen ? rightWidth : 0,
  );
  const [title, setTitle] = useState('Document');
  const [docs, setDocs] = useState<{ id: string; title: string }[]>([]);
  const [editor, setEditor] = useState<EditorAdapter | null>(null);
  const [commandPending, setCommandPending] = useState(false);
  const [saveState, setSaveState] = useState<EditorSaveState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [lockConflict, setLockConflict] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [editorError, setEditorError] = useState<string | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWorkspaceWidth(entry.contentRect.width);
    });
    if (workspace.current) observer.observe(workspace.current);
    return () => observer.disconnect();
  }, []);
  const runCommand = (command: EditorCommand) => {
    if (!editor || commandPending) return;
    setCommandPending(true);
    void editor
      .executeCommand(command)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Editor command failed.'))
      .finally(() => setCommandPending(false));
  };
  const loadDocs = useCallback(async () => {
    setDocs(await apiFetch<{ id: string; title: string }[]>(`/projects/${projectId}/documents`));
  }, [projectId]);

  useEffect(() => {
    void Promise.all([
      apiFetch<{ title: string }>(`/projects/${projectId}/documents/${documentId}`),
      loadDocs(),
    ])
      .then(([document]) => setTitle(document.title))
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Failed to load document'),
      );
  }, [projectId, documentId, router, loadDocs]);

  const setAdapter = useCallback((adapter: EditorAdapter | null) => setEditor(adapter), []);
  const download = useCallback(async () => {
    try {
      const { blob, filename } = await apiDownload(
        `/projects/${projectId}/documents/${documentId}/office/download`,
      );
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to download DOCX');
    }
  }, [projectId, documentId]);

  return (
    <div className="flex h-screen flex-col bg-[var(--dl-bg)] text-[var(--dl-fg)]">
      <header className="dl-app-topbar">
        <div className="dl-app-topbar-main">
          <Link href="/projects" className="dl-app-topbar-back" title="Back to projects">
            ←
          </Link>
          <BrandLogo href="/projects" className="dl-app-brand" />
          <div className="dl-doc-icon" aria-hidden="true">
            ▤
          </div>
          <div className="dl-app-topbar-title-block">
            <div className="dl-app-topbar-title-row">
              <h1 className="dl-app-topbar-title">{title}</h1>
              <span className="dl-app-topbar-status">{lockConflict ? 'read-only' : saveState}</span>
            </div>
          </div>
          <div className="dl-app-topbar-actions" aria-busy={commandPending}>
            <button
              type="button"
              className="dl-topbar-btn"
              disabled={
                !layout?.writable ||
                commandPending ||
                layout.blocking ||
                saveState === 'saving' ||
                saveState === 'loading'
              }
              onClick={() =>
                void editor
                  ?.save()
                  .catch((cause) =>
                    setEditorError(
                      cause instanceof Error ? cause.message : 'Could not save document.',
                    ),
                  )
              }
            >
              Save
            </button>
            <button
              type="button"
              className="dl-topbar-btn"
              aria-label="Undo"
              disabled={!layout?.writable || !layout.canUndo || layout.blocking || commandPending}
              onClick={() => runCommand({ type: 'undo' })}
            >
              ↶
            </button>
            <button
              type="button"
              className="dl-topbar-btn"
              aria-label="Redo"
              disabled={!layout?.writable || !layout.canRedo || layout.blocking || commandPending}
              onClick={() => runCommand({ type: 'redo' })}
            >
              ↷
            </button>
            <button
              type="button"
              className="dl-topbar-btn"
              disabled={!layout || layout.blocking || commandPending || saveState === 'loading'}
              onClick={() => runCommand({ type: 'search-commands' })}
            >
              Search commands
            </button>
            <button
              type="button"
              className="dl-topbar-btn"
              aria-expanded={panels.left > 0}
              onClick={() => setLeftOpen(!leftOpen)}
            >
              Tools
            </button>
            <button
              type="button"
              className="dl-topbar-btn"
              aria-expanded={panels.right > 0}
              onClick={() => setRightOpen(!rightOpen)}
            >
              AI
            </button>
          </div>
        </div>
      </header>
      {error || editorError ? (
        <div
          role="alert"
          className="border-b border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error ?? editorError}
        </div>
      ) : null}
      {lockConflict ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <span>
            Another editor holds this document’s editing lock. Showing the last saved copy
            read-only. Close that editor, then retry editing.
          </span>
          <button
            type="button"
            className="dl-topbar-btn shrink-0"
            onClick={() => setEditorGeneration((value) => value + 1)}
          >
            Retry editing
          </button>
        </div>
      ) : null}
      <div
        ref={workspace}
        className="relative min-h-0 flex-1 overflow-hidden"
        data-testid="editor-workspace"
      >
        <main aria-label="Document workspace">
          <WordcraftEditor
            key={`${projectId}:${documentId}:${editorGeneration}`}
            projectId={projectId}
            documentId={documentId}
            onAdapter={setAdapter}
            onSaveState={setSaveState}
            leftWidth={panels.left}
            rightWidth={panels.right}
            onLayout={setLayout}
            onError={setEditorError}
            onLockConflict={setLockConflict}
          />
        </main>
        {panels.left > 0 ? (
          <aside
            aria-label="Document tools"
            inert={layout?.blocking}
            className="absolute left-0 flex flex-col border-r border-[var(--dl-border)] bg-[var(--dl-panel)]"
            style={{ width: panels.left, top: layout?.top ?? 0, bottom: layout?.bottom ?? 0 }}
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
                  onRefreshDocs={() => void loadDocs()}
                />
              ) : null}
              {leftTab === 'outline' ? (
                <OfficeOutlinePanel projectId={projectId} documentId={documentId} editor={editor} />
              ) : null}
              {leftTab === 'sources' ? <SourcesPanel projectId={projectId} /> : null}
              {leftTab === 'memory' ? (
                <p className="dl-tools-empty">
                  Edit project memory from the{' '}
                  <Link href={`/projects/${projectId}`}>project hub</Link>.
                </p>
              ) : null}
              {leftTab === 'health' ? (
                <HealthPanel projectId={projectId} documentId={documentId} />
              ) : null}
              {leftTab === 'comments' ? (
                <div className="flex flex-col gap-3 p-3 text-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--dl-muted)]">
                    Document Comments
                  </h3>
                  <p className="text-xs text-[var(--dl-muted)]">
                    Add and review inline comments inside the document.
                  </p>
                  <button
                    type="button"
                    className="rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-3 py-1.5 text-xs hover:bg-[color-mix(in_srgb,var(--dl-fg)_6%,transparent)]"
                    onClick={() =>
                      void editor
                        ?.executeCommand({ type: 'uno', command: '.uno:InsertAnnotation' })
                        .catch((cause) =>
                          setError(
                            cause instanceof Error ? cause.message : 'Could not insert comment.',
                          ),
                        )
                    }
                  >
                    + Insert Comment at Selection
                  </button>
                </div>
              ) : null}
              {leftTab === 'layout' ? (
                <p className="dl-tools-empty">
                  Use the Layout tab above for page and paragraph settings.
                </p>
              ) : null}
              {leftTab === 'io' ? (
                <button
                  type="button"
                  className="border border-[var(--dl-border)] px-2 py-1 text-left text-sm"
                  onClick={() => void download()}
                >
                  Download DOCX
                </button>
              ) : null}
            </LeftSidebarShell>
            <SidebarResizeHandle side="left" onResize={setLeftWidth} />
          </aside>
        ) : null}
        <aside
          aria-label="AI assistant"
          inert={layout?.blocking}
          className="dl-ai-sidebar absolute right-0 flex flex-col border-l border-[var(--dl-border)] bg-[var(--dl-panel)]"
          style={{
            display: panels.right > 0 ? undefined : 'none',
            width: panels.right,
            top: layout?.top ?? 0,
            bottom: layout?.bottom ?? 0,
          }}
        >
          <SidebarResizeHandle side="right" onResize={setRightWidth} />
          <AiPanel
            projectId={projectId}
            documentId={documentId}
            selectedNodeId={null}
            editor={editor}
            onCollapse={() => setRightOpen(false)}
            onAccepted={() => setError(null)}
          />
        </aside>
      </div>
    </div>
  );
}
