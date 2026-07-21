'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, getAccessToken } from '@/lib/api';
import { ThemeSwitcher } from '@/components/theme-switcher';

interface DocRow {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

interface MemoryItem {
  id: string;
  kind: string;
  body: string;
}

interface SourceRow {
  id: string;
  title: string;
  sourceType: string;
}

interface MemberRow {
  userId: string;
  name: string;
  email: string;
  role: string;
}

function formatRelative(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ProjectHubPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;
  const [project, setProject] = useState<{ name: string; description: string } | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [title, setTitle] = useState('Untitled document');
  const [memBody, setMemBody] = useState('');
  const [memKind, setMemKind] = useState('instruction');
  const [error, setError] = useState<string | null>(null);
  const [creatingDoc, setCreatingDoc] = useState(false);

  const load = useCallback(async () => {
    if (!getAccessToken()) {
      router.push('/login');
      return;
    }
    try {
      const [p, d, m, s, mems] = await Promise.all([
        apiFetch<{ name: string; description: string }>(`/projects/${projectId}`),
        apiFetch<DocRow[]>(`/projects/${projectId}/documents`),
        apiFetch<MemoryItem[]>(`/projects/${projectId}/memory`),
        apiFetch<SourceRow[]>(`/projects/${projectId}/sources`).catch(() => []),
        apiFetch<MemberRow[]>(`/projects/${projectId}/members`).catch(() => []),
      ]);
      setProject(p);
      setDocs(d);
      setMemory(m);
      setSources(s);
      setMembers(mems);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [projectId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDoc(e: FormEvent) {
    e.preventDefault();
    setCreatingDoc(true);
    try {
      const doc = await apiFetch<{ id: string }>(`/projects/${projectId}/documents`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim() || 'Untitled document' }),
      });
      router.push(`/projects/${projectId}/documents/${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
      setCreatingDoc(false);
    }
  }

  async function addMemory(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch(`/projects/${projectId}/memory`, {
        method: 'POST',
        body: JSON.stringify({ kind: memKind, body: memBody }),
      });
      setMemBody('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Memory save failed');
    }
  }

  const recentDocs = docs.slice(0, 6);
  const memoryPreview = memory.slice(0, 4);

  return (
    <div className="dl-home">
      <header className="dl-home-top">
        <div className="dl-home-brand">
          <Link href="/projects" className="dl-home-logo">
            Delayance
          </Link>
          <span className="dl-home-tag">Project</span>
        </div>
        <div className="dl-home-top-actions">
          <ThemeSwitcher />
          <Link href="/projects" className="dl-home-ghost-btn">
            All projects
          </Link>
        </div>
      </header>

      <main className="dl-home-main">
        <section className="dl-home-hero">
          <div>
            <p className="dl-home-muted" style={{ marginBottom: '0.35rem' }}>
              <Link href="/projects" className="no-underline">
                Projects
              </Link>
              <span> / </span>
              <span>{project?.name ?? '…'}</span>
            </p>
            <h1 className="dl-home-title">{project?.name ?? 'Loading…'}</h1>
            <p className="dl-home-subtitle">
              {project?.description?.trim() ||
                'Manage documents, project memory, and sources for this workspace.'}
            </p>
          </div>
          <form onSubmit={createDoc} className="dl-hub-quick-create">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New document title"
              aria-label="New document title"
            />
            <button type="submit" className="dl-home-primary-btn" disabled={creatingDoc}>
              {creatingDoc ? 'Creating…' : 'New document'}
            </button>
          </form>
        </section>

        {error ? <p className="dl-home-error">{error}</p> : null}

        <section className="dl-home-stats" aria-label="Project overview">
          <div className="dl-home-stat">
            <span className="dl-home-stat-value">{docs.length}</span>
            <span className="dl-home-stat-label">Documents</span>
          </div>
          <div className="dl-home-stat">
            <span className="dl-home-stat-value">{memory.length}</span>
            <span className="dl-home-stat-label">Memory items</span>
          </div>
          <div className="dl-home-stat">
            <span className="dl-home-stat-value">{sources.length}</span>
            <span className="dl-home-stat-label">Sources</span>
          </div>
          <div className="dl-home-stat">
            <span className="dl-home-stat-value">{members.length}</span>
            <span className="dl-home-stat-label">Members</span>
          </div>
        </section>

        <div className="dl-hub-layout">
          <section className="dl-hub-panel">
            <div className="dl-home-section-head">
              <h2>Documents</h2>
            </div>
            {recentDocs.length === 0 ? (
              <div className="dl-home-empty" style={{ padding: '1.5rem' }}>
                <h3>No documents yet</h3>
                <p>Create a document to start writing in the structured editor.</p>
              </div>
            ) : (
              <ul className="dl-hub-list">
                {recentDocs.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/projects/${projectId}/documents/${d.id}`}
                      className="dl-hub-list-item"
                    >
                      <span className="dl-hub-list-title">{d.title}</span>
                      <span className="dl-hub-list-meta">
                        <span className="dl-home-role">{d.status}</span>
                        <span>{formatRelative(d.updatedAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {docs.length > recentDocs.length ? (
              <p className="dl-home-muted" style={{ marginTop: '0.75rem' }}>
                Showing {recentDocs.length} of {docs.length} documents
              </p>
            ) : null}
          </section>

          <section className="dl-hub-panel">
            <div className="dl-home-section-head">
              <h2>Project memory</h2>
            </div>
            <form onSubmit={addMemory} className="dl-hub-memory-form">
              <select value={memKind} onChange={(e) => setMemKind(e.target.value)}>
                <option value="instruction">Instruction</option>
                <option value="fact">Fact</option>
                <option value="decision">Decision</option>
                <option value="open_question">Open question</option>
              </select>
              <input
                value={memBody}
                onChange={(e) => setMemBody(e.target.value)}
                required
                placeholder="Add guidance the AI should remember…"
              />
              <button type="submit" className="dl-home-ghost-btn">
                Add
              </button>
            </form>
            {memoryPreview.length === 0 ? (
              <p className="dl-home-muted">
                No memory yet. Add instructions, facts, or decisions to steer AI help.
              </p>
            ) : (
              <ul className="dl-hub-memory-list">
                {memoryPreview.map((m) => (
                  <li key={m.id}>
                    <span className="dl-home-role">{m.kind.replace('_', ' ')}</span>
                    <p>{m.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dl-hub-panel">
            <div className="dl-home-section-head">
              <h2>Sources</h2>
            </div>
            {sources.length === 0 ? (
              <p className="dl-home-muted">
                No sources attached. Add PDFs, notes, or references from a document&apos;s Sources
                panel.
              </p>
            ) : (
              <ul className="dl-hub-list">
                {sources.slice(0, 6).map((s) => (
                  <li key={s.id} className="dl-hub-list-item static">
                    <span className="dl-hub-list-title">{s.title}</span>
                    <span className="dl-hub-list-meta">
                      <span className="dl-home-role">{s.sourceType}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dl-hub-panel">
            <div className="dl-home-section-head">
              <h2>Team</h2>
            </div>
            {members.length === 0 ? (
              <p className="dl-home-muted">Only you so far.</p>
            ) : (
              <ul className="dl-hub-list">
                {members.map((m) => (
                  <li key={m.userId} className="dl-hub-list-item static">
                    <span className="dl-hub-list-title">{m.name || m.email}</span>
                    <span className="dl-hub-list-meta">
                      <span className="dl-home-role">{m.role}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
