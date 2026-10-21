'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiDownload, apiFetch } from '@/lib/api';
import { useWorkspaceStore } from '@/lib/workspace-store';
import { BrandLogo } from '@/components/brand-logo';
import { ProjectName } from '@/components/project-name';
import { SourcesPanel } from '@/components/sources-panel';
import { HealthPanel } from '@/components/health-panel';
import { AiPanel } from '@/components/ai-panel';
import { SidebarResizeHandle } from '@/components/sidebar-resize-handle';
import { DocumentsList, LeftSidebarShell } from '@/components/left-sidebar';
import { WordcraftEditor } from '@/components/wordcraft-editor';
import { OfficeOutlinePanel } from '@/components/office-outline-panel';
import { fitWorkspacePanels, type WordcraftLayout } from '@/editor/workspace-layout';
import type { EditorAdapter, EditorCommand, EditorSaveState } from '@/editor/adapter';

export function DocumentWorkspace() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>();
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
  const currentDocument = useRef(documentId);
  currentDocument.current = documentId;
  const [layoutState, setLayoutState] = useState<{
    documentId: string;
    value: WordcraftLayout | null;
  } | null>(null);
  const layout = layoutState?.documentId === documentId ? layoutState.value : null;
  const [chromeInsets, setChromeInsets] = useState({ top: 0, bottom: 0 });
  const setLayout = useCallback(
    (value: WordcraftLayout | null) => {
      setLayoutState({ documentId, value });
      if (value) setChromeInsets({ top: value.top, bottom: value.bottom });
    },
    [documentId],
  );
  const panels = fitWorkspacePanels(
    workspaceWidth,
    leftOpen ? leftWidth : 0,
    rightOpen ? rightWidth : 0,
  );
  const [docs, setDocs] = useState<{ id: string; title: string }[]>([]);
  const [editorState, setEditorState] = useState<{
    documentId: string;
    value: EditorAdapter;
  } | null>(null);
  const editor = editorState?.documentId === documentId ? editorState.value : null;
  const [commandPending, setCommandPending] = useState(false);
  const [saveStateEntry, setSaveStateEntry] = useState<{
    documentId: string;
    value: EditorSaveState;
  } | null>(null);
  const saveState = saveStateEntry?.documentId === documentId ? saveStateEntry.value : 'loading';
  const setSaveState = useCallback(
    (value: EditorSaveState) => setSaveStateEntry({ documentId, value }),
    [documentId],
  );
  const [error, setError] = useState<string | null>(null);
  const [lockConflictEntry, setLockConflictEntry] = useState<{
    documentId: string;
    value: boolean;
  } | null>(null);
  const lockConflict = lockConflictEntry?.documentId === documentId && lockConflictEntry.value;
  const setLockConflict = useCallback(
    (value: boolean) => setLockConflictEntry({ documentId, value }),
    [documentId],
  );
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [editorErrorEntry, setEditorErrorEntry] = useState<{
    documentId: string;
    value: string | null;
  } | null>(null);
  const editorError = editorErrorEntry?.documentId === documentId ? editorErrorEntry.value : null;
  const setEditorError = useCallback(
    (value: string | null) => setEditorErrorEntry({ documentId, value }),
    [documentId],
  );
  useEffect(() => {
    setError(null);
    setCommandPending(false);
  }, [documentId]);
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
      .catch((cause) => {
        if (currentDocument.current === documentId)
          setError(cause instanceof Error ? cause.message : 'Editor command failed.');
      })
      .finally(() => {
        if (currentDocument.current === documentId) setCommandPending(false);
      });
  };
  const loadDocs = useCallback(async () => {
    setDocs(await apiFetch<{ id: string; title: string }[]>(`/projects/${projectId}/documents`));
  }, [projectId]);

  useEffect(() => {
    void loadDocs().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Failed to load documents'),
    );
  }, [loadDocs]);

  const setAdapter = useCallback(
    (value: EditorAdapter | null) => setEditorState(value ? { documentId, value } : null),
    [documentId],
  );
  const beforeNavigate = async () => {
    if (layout?.blocking)
      throw new Error('Accept or discard the document preview before switching documents.');
    if (!editor || !layout?.writable) return;
    const state = editor.getSaveState();
    if (state === 'saving')
      throw new Error('Wait for the current save to finish before switching documents.');
    if (state === 'dirty' || state === 'error') await editor.save();
  };
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
      if (currentDocument.current === documentId)
        setError(cause instanceof Error ? cause.message : 'Failed to download DOCX');
    }
  }, [projectId, documentId]);

  return (
    <div className="flex h-screen flex-col bg-[var(--dl-bg)] text-[var(--dl-fg)]">
      <header className="dl-app-topbar">
        <div className="dl-app-topbar-main">
          <BrandLogo href="/projects" className="dl-app-brand" showName={false} />
          <div className="dl-app-topbar-title-block">
            <div className="dl-app-topbar-title-row">
              <ProjectName key={projectId} projectId={projectId} />
              {lockConflict || saveState !== 'dirty' ? (
                <span className="dl-app-topbar-status">
                  {lockConflict ? 'read-only' : saveState}
                </span>
              ) : null}
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
            loadingInsets={{ ...chromeInsets, left: panels.left, right: panels.right }}
            onError={setEditorError}
            onLockConflict={setLockConflict}
          />
        </main>
        {panels.left > 0 ? (
          <aside
            aria-label="Document tools"
            inert={layout?.blocking}
            className="absolute left-0 flex flex-col border-r border-[var(--dl-border)] bg-[var(--dl-panel)]"
            style={{ width: panels.left, top: chromeInsets.top, bottom: chromeInsets.bottom }}
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
                  onDocumentsChange={setDocs}
                  beforeNavigate={beforeNavigate}
                />
              ) : null}
              {leftTab === 'outline' ? (
                <OfficeOutlinePanel
                  key={documentId}
                  projectId={projectId}
                  documentId={documentId}
                  editor={editor}
                />
              ) : null}
              {leftTab === 'sources' ? <SourcesPanel projectId={projectId} /> : null}
              {leftTab === 'memory' ? (
                <p className="dl-tools-empty">
                  Edit project memory from the{' '}
                  <Link href={`/projects/${projectId}`}>project hub</Link>.
                </p>
              ) : null}
              {leftTab === 'health' ? (
                <HealthPanel key={documentId} projectId={projectId} documentId={documentId} />
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
            top: chromeInsets.top,
            bottom: chromeInsets.bottom,
          }}
        >
          <SidebarResizeHandle side="right" onResize={setRightWidth} />
          <AiPanel
            key={documentId}
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
