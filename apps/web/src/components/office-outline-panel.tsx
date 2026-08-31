'use client';

import { useEffect, useState } from 'react';
import type { DocumentLocation, EditorAdapter } from '@/editor/adapter';
import { apiFetch } from '@/lib/api';

interface AnalysisNode {
  id: string;
  kind: string;
  text: string;
  level?: number;
  location: DocumentLocation;
}

export function OfficeOutlinePanel({ projectId, documentId, editor }: { projectId: string; documentId: string; editor: EditorAdapter | null }) {
  const [nodes, setNodes] = useState<AnalysisNode[]>([]);
  const [stale, setStale] = useState(false);
  const [status, setStatus] = useState('Loading analysis…');
  const load = async () => {
    const result = await apiFetch<{ stale: boolean; analysisStatus: string; analysis: { nodes?: AnalysisNode[] } | null }>(`/projects/${projectId}/documents/${documentId}/office/analysis`);
    setNodes((result.analysis?.nodes ?? []).filter((node) => node.kind === 'heading'));
    setStale(result.stale);
    setStatus(result.analysisStatus);
  };
  useEffect(() => { void load(); }, [projectId, documentId]);
  return <div className="space-y-3 text-sm">
    <div className="flex items-center justify-between gap-2"><span className="text-[var(--dl-muted)]">{status}{stale ? ' · updating after save' : ''}</span><button type="button" className="border border-[var(--dl-border)] px-2 py-1" onClick={() => void load()}>Refresh</button></div>
    {nodes.length ? <ul className="space-y-1">{nodes.map((node) => <li key={node.id} style={{ paddingLeft: `${Math.max(0, (node.level ?? 1) - 1) * 12}px` }}><button type="button" className="text-left hover:underline" onClick={() => void editor?.navigateTo(node.location)}>{node.text}</button></li>)}</ul> : <p className="text-[var(--dl-muted)]">No headings have been extracted yet.</p>}
  </div>;
}
