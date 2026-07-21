'use client';

import { useState } from 'react';
import type { Document } from '@delayance/document-model';
import { apiFetch, API_URL, getAccessToken } from '@/lib/api';

export function ImportExportPanel({
  projectId,
  documentId,
  documentModel,
  onApplyContent,
}: {
  projectId: string;
  documentId: string;
  documentModel: Document | null;
  onApplyContent: (doc: Document) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'normalize' | 'preserve'>('normalize');
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const [report, setReport] = useState<unknown>(null);

  const pollJob = async (jobId: string) => {
    for (let i = 0; i < 60; i++) {
      const job = await apiFetch<{ status: string; error?: string }>(`/jobs/${jobId}`);
      setStatus(`Job ${job.status}`);
      if (job.status === 'completed') return job;
      if (job.status === 'failed') throw new Error(job.error ?? 'Job failed');
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('Job timeout');
  };

  const uploadAndImport = async (file: File) => {
    setError(null);
    setPreviewTitle(null);
    const form = new FormData();
    form.append('file', file);
    const token = getAccessToken();
    const up = await fetch(`${API_URL}/projects/${projectId}/files`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    const fileRow = await up.json();
    if (!up.ok) throw new Error(fileRow.message ?? 'Upload failed');

    const started = await apiFetch<{
      import: { id: string };
      job: { id: string };
    }>(`/projects/${projectId}/documents/import`, {
      method: 'POST',
      body: JSON.stringify({
        fileId: fileRow.id,
        mode: importMode,
        documentId,
      }),
    });
    setImportId(started.import.id);
    await pollJob(started.job.id);
    const imp = await apiFetch<{
      status: string;
      report: unknown;
      previewContent: Document;
    }>(`/projects/${projectId}/imports/${started.import.id}`);
    setReport(imp.report);
    setPreviewTitle(imp.previewContent?.title ?? null);
    setStatus(
      `Import ${imp.status}${imp.previewContent ? ` · preview “${imp.previewContent.title}” (${imp.previewContent.children?.length ?? 0} top nodes)` : ''}`,
    );
  };

  const applyImport = async () => {
    if (!importId) return;
    const doc = await apiFetch<{ content: Document }>(
      `/projects/${projectId}/imports/${importId}/apply`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    onApplyContent(doc.content);
    setStatus('Import applied');
  };

  const exportDoc = async (format: 'docx' | 'pdf' | 'markdown' | 'html' | 'plain') => {
    setError(null);
    const res = await apiFetch<{
      job: { id: string } | null;
      downloadUrl: string | null;
      export: { id: string };
    }>(`/projects/${projectId}/documents/${documentId}/export`, {
      method: 'POST',
      body: JSON.stringify({ format }),
    });
    if (res.downloadUrl) {
      window.open(res.downloadUrl, '_blank');
      setStatus(`Exported ${format}`);
      return;
    }
    if (res.job) {
      await pollJob(res.job.id);
      const dl = await apiFetch<{ downloadUrl: string }>(
        `/projects/${projectId}/exports/${res.export.id}/download`,
      );
      window.open(dl.downloadUrl, '_blank');
      setStatus(`Exported ${format}`);
    }
  };

  const normalize = async () => {
    if (!documentModel) return;
    const preview = await apiFetch<{ issues: unknown[] }>(
      `/projects/${projectId}/documents/${documentId}/cleanup/preview`,
      { method: 'POST', body: JSON.stringify({ content: documentModel }) },
    );
    setReport(preview);
    const applied = await apiFetch<{ content: Document }>(
      `/projects/${projectId}/documents/${documentId}/cleanup/apply`,
      { method: 'POST', body: JSON.stringify({ content: documentModel }) },
    );
    onApplyContent(applied.content);
    await apiFetch(`/projects/${projectId}/documents/${documentId}/content`, {
      method: 'PATCH',
      body: JSON.stringify({
        content: applied.content,
        createVersion: true,
        versionReason: 'normalize.apply',
      }),
    });
    setStatus('Normalized');
  };

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        Import mode
        <select
          className="mt-1 block w-full border border-[var(--dl-border)] bg-[var(--dl-bg)] px-2 py-1"
          value={importMode}
          onChange={(e) => setImportMode(e.target.value as 'normalize' | 'preserve')}
        >
          <option value="normalize">Normalize (recommended)</option>
          <option value="preserve">Preserve appearance</option>
        </select>
      </label>
      <label className="block">
        Import DOCX
        <input
          type="file"
          accept=".docx"
          className="mt-1 block w-full"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadAndImport(f).catch((err) => setError(err.message));
          }}
        />
      </label>
      {previewTitle ? (
        <p className="text-[var(--dl-muted)]">Preview ready: {previewTitle}</p>
      ) : null}
      {importId ? (
        <button
          type="button"
          className="border border-[var(--dl-border)] px-2 py-1"
          onClick={() => void applyImport().catch((e) => setError(e.message))}
        >
          Apply import
        </button>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {(['docx', 'pdf', 'markdown', 'html', 'plain'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className="border border-[var(--dl-border)] px-2 py-1"
            onClick={() => void exportDoc(f).catch((e) => setError(e.message))}
          >
            Export {f}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="border border-[var(--dl-border)] px-2 py-1"
        onClick={() => void normalize().catch((e) => setError(e.message))}
      >
        Normalize document
      </button>
      {status ? <p className="text-[var(--dl-muted)]">{status}</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}
      {report ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[10px]">
          {JSON.stringify(report, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
