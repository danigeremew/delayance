'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { BrandLogo } from '@/components/brand-logo';
import { ProjectName } from '@/components/project-name';
import { DocumentsList } from '@/components/document-list';

interface DocRow {
  id: string;
  title: string;
}

export default function ProjectWorkspaceRedirectPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocRow[] | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function openWorkspace() {
      try {
        const docs = await apiFetch<DocRow[]>(`/projects/${projectId}/documents`);
        if (!isMounted) return;

        if (docs && docs.length > 0) {
          router.replace(`/projects/${projectId}/documents/${docs[0]!.id}`);
        } else {
          setDocs([]);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to open project workspace');
        }
      }
    }

    void openWorkspace();
    return () => {
      isMounted = false;
    };
  }, [projectId, router]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold text-red-600">Workspace Error</h1>
        <p className="text-sm text-[var(--dl-muted)]">{error}</p>
        <button
          type="button"
          onClick={() => router.push('/projects')}
          className="rounded border border-[var(--dl-border)] px-4 py-2 text-xs font-medium text-[var(--dl-fg)] hover:bg-[var(--dl-panel)]"
        >
          Return to Projects
        </button>
      </main>
    );
  }

  if (docs) {
    return (
      <div className="flex h-screen flex-col bg-[var(--dl-bg)]">
        <header className="dl-app-topbar">
          <div className="dl-app-topbar-main">
            <BrandLogo href="/projects" className="dl-app-brand" showName={false} />
            <ProjectName key={projectId} projectId={projectId} />
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="dl-empty-project-documents" aria-label="Documents">
            <div className="dl-tools-panel-header">
              <h2 className="dl-tools-panel-title">Documents</h2>
            </div>
            <div className="dl-tools-panel-body">
              <DocumentsList projectId={projectId} docs={docs} onDocumentsChange={setDocs} />
            </div>
          </aside>
          <main className="flex flex-1 items-center justify-center p-6 text-center text-[var(--dl-muted)]">
            <p>Create or import a document to start writing.</p>
          </main>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center items-center gap-3 px-6 text-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--dl-accent)] border-t-transparent" />
      <p className="text-sm font-medium text-[var(--dl-muted)]">Opening project workspace…</p>
    </main>
  );
}
