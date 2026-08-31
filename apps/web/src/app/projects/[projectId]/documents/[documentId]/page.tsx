'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiDownload, apiFetch, getAccessToken } from '@/lib/api';
import { useWorkspaceStore } from '@/lib/workspace-store';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { SourcesPanel } from '@/components/sources-panel';
import { HealthPanel } from '@/components/health-panel';
import { AiPanel } from '@/components/ai-panel';
import { SidebarResizeHandle } from '@/components/sidebar-resize-handle';
import { DocumentsList, LeftSidebarShell } from '@/components/left-sidebar';
import { LibreOfficeEditor } from '@/components/libreoffice-editor';
import { OfficeOutlinePanel } from '@/components/office-outline-panel';
import type { EditorAdapter, EditorSaveState } from '@/editor/adapter';

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
  const [title, setTitle] = useState('Document');
  const [docs, setDocs] = useState<{ id: string; title: string }[]>([]);
  const [editor, setEditor] = useState<EditorAdapter | null>(null);
  const [saveState, setSaveState] = useState<EditorSaveState>('loading');
  const [error, setError] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setDocs(await apiFetch<{ id: string; title: string }[]>(`/projects/${projectId}/documents`));
  }, [projectId]);

  useEffect(() => {
    if (!getAccessToken()) { router.push('/login'); return; }
    void Promise.all([apiFetch<{ title: string }>(`/projects/${projectId}/documents/${documentId}`), loadDocs()])
      .then(([document]) => setTitle(document.title))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Failed to load document'));
  }, [projectId, documentId, router, loadDocs]);

  const setAdapter = useCallback((adapter: EditorAdapter | null) => setEditor(adapter), []);
  const download = useCallback(async () => {
    try {
      const { blob, filename } = await apiDownload(`/projects/${projectId}/documents/${documentId}/office/download`);
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

  return <div className="flex h-screen flex-col bg-[var(--dl-bg)] text-[var(--dl-fg)]">
    <header className="dl-app-topbar"><div className="dl-app-topbar-main">
      <Link href="/projects" className="dl-app-topbar-back" title="Back to projects">←</Link>
      <div className="dl-doc-icon" aria-hidden="true">▤</div>
      <div className="dl-app-topbar-title-block"><div className="dl-app-topbar-title-row"><h1 className="dl-app-topbar-title">{title}</h1><span className="dl-app-topbar-status">{saveState}</span></div><p className="text-xs text-[var(--dl-muted)]">LibreOffice Writer · Delayance intelligence workspace</p></div>
      <div className="dl-app-topbar-actions"><button type="button" className="dl-topbar-btn" onClick={() => void editor?.save()}>Save</button><button type="button" className="dl-topbar-btn" onClick={() => setLeftOpen(!leftOpen)}>Tools</button><button type="button" className="dl-topbar-btn" onClick={() => setRightOpen(!rightOpen)}>AI</button><ThemeSwitcher /></div>
    </div></header>
    {error ? <div className="border-b border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
    <div className="flex min-h-0 flex-1">
      {leftOpen ? <aside className="relative flex shrink-0 flex-col border-r border-[var(--dl-border)] bg-[var(--dl-panel)]" style={{ width: leftWidth }}><LeftSidebarShell leftTab={leftTab} onTabChange={setLeftTab} onCollapse={() => setLeftOpen(false)}>
        {leftTab === 'documents' ? <DocumentsList projectId={projectId} documentId={documentId} docs={docs} onRefreshDocs={() => void loadDocs()} /> : null}
        {leftTab === 'outline' ? <OfficeOutlinePanel projectId={projectId} documentId={documentId} editor={editor} /> : null}
        {leftTab === 'sources' ? <SourcesPanel projectId={projectId} /> : null}
        {leftTab === 'memory' ? <p className="dl-tools-empty">Edit project memory from the <Link href={`/projects/${projectId}`}>project hub</Link>.</p> : null}
        {leftTab === 'health' ? <HealthPanel projectId={projectId} documentId={documentId} /> : null}
        {leftTab === 'comments' ? <p className="dl-tools-empty">Document comments are managed in LibreOffice Writer.</p> : null}
        {leftTab === 'layout' ? <p className="dl-tools-empty">Page layout, printing, styles, and find/replace are managed in LibreOffice Writer.</p> : null}
        {leftTab === 'io' ? <button type="button" className="border border-[var(--dl-border)] px-2 py-1 text-left text-sm" onClick={() => void download()}>Download DOCX</button> : null}
      </LeftSidebarShell><SidebarResizeHandle side="left" onResize={setLeftWidth} /></aside> : null}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden"><LibreOfficeEditor projectId={projectId} documentId={documentId} onAdapter={setAdapter} onSaveState={setSaveState} /></main>
      {rightOpen ? <aside className="dl-ai-sidebar relative flex shrink-0 flex-col border-l border-[var(--dl-border)] bg-[var(--dl-panel)]" style={{ width: rightWidth }}><SidebarResizeHandle side="right" onResize={setRightWidth} /><AiPanel projectId={projectId} documentId={documentId} selectedNodeId={null} onCollapse={() => setRightOpen(false)} onStreamStart={() => undefined} onStreamToken={() => undefined} onStreamFinish={() => undefined} onStreamAbort={() => undefined} onAccepted={() => setError('AI document mutations are being migrated to the LibreOffice bridge. Ask and Review remain available.')} /></aside> : null}
    </div>
  </div>;
}
