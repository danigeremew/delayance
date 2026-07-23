'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, getAccessToken } from '@/lib/api';

interface DocRow {
  id: string;
  title: string;
}

export default function ProjectWorkspaceRedirectPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }

    let isMounted = true;
    async function openWorkspace() {
      try {
        const docs = await apiFetch<DocRow[]>(`/projects/${projectId}/documents`);
        if (!isMounted) return;

        if (docs && docs.length > 0) {
          router.replace(`/projects/${projectId}/documents/${docs[0]!.id}`);
        } else {
          // Create initial default document if project has no documents yet
          const newDoc = await apiFetch<{ id: string }>(`/projects/${projectId}/documents`, {
            method: 'POST',
            body: JSON.stringify({ title: 'Untitled document' }),
          });
          if (!isMounted) return;
          router.replace(`/projects/${projectId}/documents/${newDoc.id}`);
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center items-center gap-3 px-6 text-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--dl-accent)] border-t-transparent" />
      <p className="text-sm font-medium text-[var(--dl-muted)]">Opening project workspace…</p>
    </main>
  );
}

