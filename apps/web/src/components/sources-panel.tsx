'use client';

import { useEffect, useState } from 'react';
import { apiFetch, API_URL, getAccessToken } from '@/lib/api';

interface Source {
  id: string;
  title: string;
  sourceType: string;
  outdated: boolean;
  aiMayUse: boolean;
  textContent: string;
  processStatus?: string;
  processError?: string | null;
}

interface SearchHit {
  kind: string;
  id: string;
  title: string;
  snippet: string;
  rank: number;
}

function guessSourceType(name: string): 'pdf' | 'docx' | 'md' | 'txt' | 'image' {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.md')) return 'md';
  if (/\.(png|jpe?g|gif|webp)$/.test(n)) return 'image';
  return 'txt';
}

export function SourcesPanel({ projectId }: { projectId: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setSources(await apiFetch(`/projects/${projectId}/sources`));
  };

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [projectId]);

  const create = async () => {
    await apiFetch(`/projects/${projectId}/sources`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        sourceType: 'note',
        textContent: text,
        aiMayUse: true,
      }),
    });
    setTitle('');
    setText('');
    await refresh();
  };

  const search = async () => {
    const res = await apiFetch<{ hits: SearchHit[] }>(
      `/projects/${projectId}/search?q=${encodeURIComponent(q)}&semantic=1`,
    );
    setHits(res.hits);
  };

  const toggle = async (id: string, patch: Partial<Source>) => {
    await apiFetch(`/projects/${projectId}/sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await refresh();
  };

  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/projects/${projectId}/files`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? 'Upload failed');
    await apiFetch(`/projects/${projectId}/sources`, {
      method: 'POST',
      body: JSON.stringify({
        title: file.name,
        sourceType: guessSourceType(file.name),
        fileId: data.id,
        aiMayUse: true,
      }),
    });
    await refresh();
  };

  return (
    <div className="space-y-3 text-sm">
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex gap-1">
        <input
          className="flex-1 border border-[var(--dl-border)] bg-[var(--dl-bg)] px-2 py-1 text-xs"
          placeholder="Project search (FTS)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className="border border-[var(--dl-border)] px-2 text-xs"
          onClick={() => void search()}
        >
          Go
        </button>
      </div>
      {hits.length ? (
        <ul className="space-y-1 text-xs">
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`} className="border-b border-[var(--dl-border)] py-1">
              <span className="uppercase text-[var(--dl-muted)]">{h.kind}</span> {h.title}
              <p className="line-clamp-2 text-[var(--dl-muted)]">{h.snippet}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        className="w-full border border-[var(--dl-border)] bg-[var(--dl-bg)] px-2 py-1 text-xs"
        placeholder="Source title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full border border-[var(--dl-border)] bg-[var(--dl-bg)] p-2 text-xs"
        rows={3}
        placeholder="Note text"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        className="border border-[var(--dl-border)] px-2 py-1 text-xs"
        onClick={() => void create()}
      >
        Add note
      </button>
      <label className="block text-xs">
        Upload file
        <input
          type="file"
          className="mt-1 block w-full text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f).catch((err) => setError(err.message));
          }}
        />
      </label>
      <ul className="space-y-2">
        {sources.map((s) => (
          <li key={s.id} className="border border-[var(--dl-border)] p-2 text-xs">
            <div className="font-medium">{s.title}</div>
            <div className="text-[var(--dl-muted)]">
              {s.sourceType} · {s.processStatus ?? 'ready'}
              {s.processError ? ` · ${s.processError}` : ''}
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={s.aiMayUse}
                  onChange={(e) => void toggle(s.id, { aiMayUse: e.target.checked })}
                />
                AI may use
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={s.outdated}
                  onChange={(e) => void toggle(s.id, { outdated: e.target.checked })}
                />
                Outdated
              </label>
            </div>
            <p className="mt-1 line-clamp-3">{s.textContent.slice(0, 240)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
