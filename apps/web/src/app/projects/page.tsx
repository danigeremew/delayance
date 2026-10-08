'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { BrandLogo } from '@/components/brand-logo';
import { useAuth } from '@/lib/auth-context';
import { UserMenu } from '@/components/user-menu';
import { DashboardIcon, WorkspaceIllustration } from '@/components/dashboard-visuals';
import './dashboard.css';

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  role: string;
  updatedAt: string;
  documentCount: number;
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

export default function ProjectsHomePage() {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ProjectRow[]>('/projects');
      setProjects(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    void load();
  }, [authLoading, isAuthenticated, load, router]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await apiFetch<ProjectRow>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
        }),
      });
      setCreateOpen(false);
      setName('');
      setDescription('');
      router.push(`/projects/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  const totalDocs = projects?.reduce((n, p) => n + (p.documentCount ?? 0), 0) ?? 0;
  const recentProjects = [...(projects ?? [])].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const openCreate = () => setCreateOpen(true);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="dl-dashboard-session" role="status">
        Loading your workspace…
      </div>
    );
  }

  return (
    <div className="dl-dashboard">
      <header className="dl-dashboard-topbar">
        <div className="dl-dashboard-topbar-inner">
          <BrandLogo href="/projects" className="dl-dashboard-brand" />
          <UserMenu appearance="dashboard" />
        </div>
      </header>

      <main className="dl-dashboard-main">
        <header className="dl-dashboard-header">
          <div>
            <h1>Your projects</h1>
            <p>Open a project to write, or create a new workspace for your documents.</p>
          </div>
          <div className="dl-dashboard-header-actions">
            <CreateProjectButton onClick={openCreate} />
          </div>
        </header>

        {error ? (
          <div className="dl-dashboard-error" role="alert">
            <span>We couldn’t load your projects. {error}</span>
            <button type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : null}

        <div className="dl-dashboard-counts" role="group" aria-label="Workspace overview">
          <span>
            <strong>{projects?.length ?? '—'}</strong>{' '}
            {projects?.length === 1 ? 'project' : 'projects'}
          </span>
          <span>
            <strong>{projects ? totalDocs : '—'}</strong>{' '}
            {projects && totalDocs === 1 ? 'document' : 'documents'}
          </span>
        </div>

        <section
          id="recent-projects"
          className="dl-dashboard-projects"
          aria-labelledby="recent-projects-title"
        >
          <div className="dl-dashboard-section-title">
            <h2 id="recent-projects-title">All projects</h2>
          </div>
          {projects === null ? (
            <div className="dl-dashboard-recent-empty" role="status">
              <span className="dl-dashboard-icon">
                <DashboardIcon name="folder" />
              </span>
              <h3>{error ? 'Projects unavailable' : 'Loading projects…'}</h3>
              <p>
                {error
                  ? 'Try again to reconnect to your workspace.'
                  : 'Your workspace will be ready in a moment.'}
              </p>
            </div>
          ) : projects.length ? (
            <ul className="dl-dashboard-project-list">
              {recentProjects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`}>
                    <span className="dl-dashboard-icon">
                      <DashboardIcon name="folder" />
                    </span>
                    <span className="dl-dashboard-project-copy">
                      <strong>{p.name}</strong>
                      <small>
                        {p.documentCount} document{p.documentCount === 1 ? '' : 's'} ·{' '}
                        {formatRelative(p.updatedAt)}
                      </small>
                    </span>
                    <DashboardIcon name="chevron" className="dl-dashboard-chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <article className="dl-dashboard-welcome-card">
              <WorkspaceIllustration />
              <div className="dl-dashboard-welcome-copy">
                <h2>No projects yet</h2>
                <p>Create your first project to start writing structured documents with AI help.</p>
                <CreateProjectButton onClick={openCreate} />
              </div>
            </article>
          )}
        </section>

        <aside className="dl-dashboard-tips">
          <span className="dl-dashboard-icon">
            <DashboardIcon name="bulb" />
          </span>
          <div>
            <h2>Quick tips</h2>
            <ul>
              <li>The AI assistant uses Google Gemini to help with your documents.</li>
              <li>Open a project hub to manage documents, memory, and sources.</li>
              <li>In the editor, use the AI panel for Ask, Edit, Write, and Review modes.</li>
            </ul>
          </div>
        </aside>
      </main>

      {createOpen ? (
        <div className="dl-modal-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <div
            className="dl-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dl-modal-head">
              <h2 id="create-project-title">Create project</h2>
              <button
                type="button"
                className="dl-home-ghost-btn"
                onClick={() => setCreateOpen(false)}
              >
                Close
              </button>
            </div>
            <form onSubmit={onCreate} className="dl-modal-body">
              <label className="dl-field">
                <span>Project name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                  placeholder="e.g. Q3 product brief"
                  autoFocus
                />
              </label>
              <label className="dl-field">
                <span>Description (optional)</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={5000}
                  placeholder="What is this project for?"
                />
              </label>

              <div className="dl-modal-actions">
                <button
                  type="button"
                  className="dl-home-ghost-btn"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="dl-home-primary-btn" disabled={creating}>
                  {creating ? 'Creating…' : 'Create project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CreateProjectButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="dl-dashboard-primary" onClick={onClick}>
      <DashboardIcon name="plus" />
      <span>Create new project</span>
    </button>
  );
}
