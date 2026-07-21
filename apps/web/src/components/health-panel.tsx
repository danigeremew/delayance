'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Health {
  issueCount: number;
  brokenRefCount: number;
  issues: { code: string; severity: string; message: string; nodeId?: string }[];
  brokenRefs: { refId: string; targetId: string; display: string; broken: boolean }[];
  aiFindings: {
    proposalId: string;
    proposalStatus: string;
    nodeId?: string;
    severity: string;
    message: string;
    suggestion?: string;
  }[];
  stubs: { code: string; status: string; message: string }[];
}

export function HealthPanel({
  projectId,
  documentId,
  onSelectNode,
}: {
  projectId: string;
  documentId: string;
  onSelectNode?: (nodeId: string) => void;
}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Health>(`/projects/${projectId}/documents/${documentId}/health`)
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [projectId, documentId]);

  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (!health) return <p className="text-xs text-[var(--dl-muted)]">Loading health…</p>;

  return (
    <div className="space-y-3 text-sm">
      <p>
        {health.issueCount} issues · {health.brokenRefCount} broken refs ·{' '}
        {health.aiFindings.length} AI findings
      </p>
      <ul className="space-y-1">
        {health.issues.map((i, idx) => (
          <li key={`${i.code}-${idx}`}>
            <button
              type="button"
              className="text-left"
              disabled={!i.nodeId}
              onClick={() => i.nodeId && onSelectNode?.(i.nodeId)}
            >
              <span className="uppercase text-[var(--dl-muted)]">{i.severity}</span> {i.message}
            </button>
          </li>
        ))}
      </ul>
      {health.aiFindings.length ? (
        <div>
          <p className="mb-1 font-medium">AI review findings</p>
          <ul className="space-y-1">
            {health.aiFindings.map((f, idx) => (
              <li key={`${f.proposalId}-${idx}`}>
                <button
                  type="button"
                  className="text-left"
                  disabled={!f.nodeId}
                  onClick={() => f.nodeId && onSelectNode?.(f.nodeId)}
                >
                  <span className="uppercase text-[var(--dl-muted)]">
                    {f.severity} · {f.proposalStatus}
                  </span>{' '}
                  {f.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {health.brokenRefs.length ? (
        <ul className="space-y-1">
          {health.brokenRefs.map((b) => (
            <li key={b.refId}>
              Broken ref {b.refId} → {b.targetId}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <p className="mb-1 font-medium">Deferred / stubs</p>
        <ul className="space-y-1 text-[var(--dl-muted)]">
          {health.stubs.map((s) => (
            <li key={s.code}>
              {s.code}: {s.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
