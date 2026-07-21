'use client';

import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface CommentRow {
  id: string;
  anchorNodeId: string;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
}

export function CommentsPanel({
  projectId,
  documentId,
  comments,
  selectedNodeId,
  onRefresh,
}: {
  projectId: string;
  documentId: string;
  comments: CommentRow[];
  selectedNodeId: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedNodeId) {
      setError('Select a node in the editor first');
      return;
    }
    try {
      await apiFetch(`/projects/${projectId}/documents/${documentId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ anchorNodeId: selectedNodeId, body }),
      });
      setBody('');
      setError(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function resolve(id: string) {
    await apiFetch(`/projects/${projectId}/documents/${documentId}/comments/${id}/resolve`, {
      method: 'POST',
    });
    await onRefresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--dl-muted)]">
        Selected node: {selectedNodeId ?? 'none'}
      </p>
      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={3}
          className="w-full border border-[var(--dl-border)] bg-[var(--dl-bg)] px-2 py-1 text-sm"
          placeholder="Comment"
        />
        <button type="submit" className="border border-[var(--dl-border)] px-2 py-1 text-xs">
          Add comment
        </button>
      </form>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <ul className="space-y-2">
        {comments.map((c) => (
          <li key={c.id} className="border-b border-[var(--dl-border)] pb-2 text-sm">
            <p className="text-xs text-[var(--dl-muted)]">on {c.anchorNodeId.slice(0, 8)}…</p>
            <p>{c.body}</p>
            {c.resolvedAt ? (
              <span className="text-xs text-[var(--dl-muted)]">Resolved</span>
            ) : (
              <button
                type="button"
                className="mt-1 text-xs underline"
                onClick={() => void resolve(c.id)}
              >
                Resolve
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
