'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, clearTokens, getAccessToken } from '@/lib/api';
import { ThemeSwitcher } from '@/components/theme-switcher';

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  role: string;
  updatedAt: string;
  documentCount: number;
}

interface OllamaModelsResponse {
  ok: boolean;
  models: { name: string; size: number; modifiedAt: string | null }[];
  error?: string;
  baseUrl: string;
}

const DEFAULT_BASE = 'http://127.0.0.1:11434/v1';

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
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiPolicy, setAiPolicy] = useState<'local_only' | 'any'>('local_only');
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_BASE);
  const [ollama, setOllama] = useState<OllamaModelsResponse | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  const load = useCallback(async () => {
    try {
      if (!getAccessToken()) {
        router.replace('/login');
        return;
      }
      const data = await apiFetch<ProjectRow[]>('/projects');
      setProjects(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setProjects([]);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadOllamaModels = useCallback(async (baseUrl: string) => {
    setLoadingModels(true);
    try {
      const q = encodeURIComponent(baseUrl);
      const data = await apiFetch<OllamaModelsResponse>(`/ai/ollama/models?baseUrl=${q}`);
      setOllama(data);
      if (data.models.length) {
        setAiModel((prev) =>
          prev && data.models.some((m) => m.name === prev) ? prev : data.models[0]!.name,
        );
      } else {
        setAiModel('');
      }
    } catch (err) {
      setOllama({
        ok: false,
        models: [],
        baseUrl,
        error: err instanceof Error ? err.message : 'Failed to load models',
      });
      setAiModel('');
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    void loadOllamaModels(aiBaseUrl);
  }, [createOpen, aiBaseUrl, loadOllamaModels]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!aiModel) {
      setError('Select an Ollama model (install one with `ollama pull …` if the list is empty).');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await apiFetch<ProjectRow>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          ai: {
            provider: 'ollama',
            model: aiModel,
            policy: aiPolicy,
            baseUrl: aiBaseUrl || DEFAULT_BASE,
          },
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

  return (
    <div className="dl-home">
      <header className="dl-home-top">
        <div className="dl-home-brand">
          <Link href="/projects" className="dl-home-logo">
            Delayance
          </Link>
          <span className="dl-home-tag">Workspace</span>
        </div>
        <div className="dl-home-top-actions">
          <ThemeSwitcher />
          <Link href="/account" className="dl-home-ghost-btn">
            Account
          </Link>
          <button
            type="button"
            className="dl-home-ghost-btn"
            onClick={() => {
              clearTokens();
              router.push('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="dl-home-main">
        <section className="dl-home-hero">
          <div>
            <h1 className="dl-home-title">Your projects</h1>
            <p className="dl-home-subtitle">
              Open a project to write, or create one with local Ollama AI ready to go.
            </p>
          </div>
          <button type="button" className="dl-home-primary-btn" onClick={() => setCreateOpen(true)}>
            Create new project
          </button>
        </section>

        {error ? <p className="dl-home-error">{error}</p> : null}

        <section className="dl-home-stats" aria-label="Overview">
          <div className="dl-home-stat">
            <span className="dl-home-stat-value">{projects?.length ?? '—'}</span>
            <span className="dl-home-stat-label">Projects</span>
          </div>
          <div className="dl-home-stat">
            <span className="dl-home-stat-value">{projects ? totalDocs : '—'}</span>
            <span className="dl-home-stat-label">Documents</span>
          </div>
          <div className="dl-home-stat">
            <span className="dl-home-stat-value">Ollama</span>
            <span className="dl-home-stat-label">Default AI</span>
          </div>
        </section>

        <section className="dl-home-grid-section">
          <div className="dl-home-section-head">
            <h2>All projects</h2>
            {projects && projects.length > 0 ? (
              <button
                type="button"
                className="dl-home-text-btn"
                onClick={() => setCreateOpen(true)}
              >
                + New
              </button>
            ) : null}
          </div>

          {projects === null ? (
            <p className="dl-home-muted">Loading projects…</p>
          ) : projects.length === 0 ? (
            <div className="dl-home-empty">
              <h3>No projects yet</h3>
              <p>Create your first project to start writing structured documents with AI help.</p>
              <button
                type="button"
                className="dl-home-primary-btn"
                onClick={() => setCreateOpen(true)}
              >
                Create new project
              </button>
            </div>
          ) : (
            <ul className="dl-home-project-grid">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="dl-home-project-card">
                    <div className="dl-home-project-card-top">
                      <h3>{p.name}</h3>
                      <span className="dl-home-role">{p.role}</span>
                    </div>
                    <p className="dl-home-project-desc">
                      {p.description?.trim() || 'No description'}
                    </p>
                    <div className="dl-home-project-meta">
                      <span>
                        {p.documentCount} document{p.documentCount === 1 ? '' : 's'}
                      </span>
                      <span>{formatRelative(p.updatedAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dl-home-tips">
          <h2>Quick tips</h2>
          <ul>
            <li>AI uses your local Ollama models — nothing leaves your machine by default.</li>
            <li>Open a project hub to manage documents, memory, and sources.</li>
            <li>In the editor, use the AI panel for Ask, Edit, Write, and Review modes.</li>
          </ul>
        </section>
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

              <div className="dl-modal-ai">
                <h3>AI setup</h3>
                <p className="dl-home-muted">
                  Configured once at creation. Default is local Ollama.
                </p>
                <label className="dl-field">
                  <span>Provider</span>
                  <input value="Ollama (local)" disabled />
                </label>
                <label className="dl-field">
                  <span>Ollama base URL</span>
                  <input
                    value={aiBaseUrl}
                    onChange={(e) => setAiBaseUrl(e.target.value)}
                    placeholder={DEFAULT_BASE}
                  />
                </label>
                <label className="dl-field">
                  <span>Model</span>
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    required
                    disabled={loadingModels || !ollama?.models.length}
                  >
                    {loadingModels ? <option value="">Loading models…</option> : null}
                    {!loadingModels && !ollama?.models.length ? (
                      <option value="">No models found</option>
                    ) : null}
                    {ollama?.models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                {ollama && !ollama.ok ? (
                  <p className="dl-home-error">{ollama.error}</p>
                ) : null}
                {ollama?.ok && ollama.models.length === 0 ? (
                  <p className="dl-home-muted">
                    No models installed. Run <code>ollama pull llama3.2</code> then refresh.
                  </p>
                ) : null}
                <button
                  type="button"
                  className="dl-home-text-btn"
                  onClick={() => void loadOllamaModels(aiBaseUrl)}
                  disabled={loadingModels}
                >
                  Refresh model list
                </button>
                <label className="dl-field">
                  <span>Policy</span>
                  <select
                    value={aiPolicy}
                    onChange={(e) => setAiPolicy(e.target.value as 'local_only' | 'any')}
                  >
                    <option value="local_only">Local only</option>
                    <option value="any">Allow external providers later</option>
                  </select>
                </label>
              </div>

              <div className="dl-modal-actions">
                <button
                  type="button"
                  className="dl-home-ghost-btn"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="dl-home-primary-btn" disabled={creating || !aiModel}>
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
