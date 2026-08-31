'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { LEFT_TABS, type LeftTab } from '@/lib/workspace-store';
import { UserMenu } from '@/components/user-menu';


const TAB_ICONS: Record<LeftTab, ReactNode> = {
  documents: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3.5h7.5L18.5 7.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M14 3.5V8h4.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 12h6M9 15.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  outline: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 7h14M5 12h10M5 17h12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  sources: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 0 4 21.5V7.5z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M4 7.5h14" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  memory: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4.5c-3.6 0-6.5 2.5-6.5 5.6 0 2.2 1.3 4.1 3.3 5.1L8 19.5h8l-.8-4.3c2-.1 3.3-2.9 3.3-5.1C18.5 7 15.6 4.5 12 4.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  comments: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 6.5h14a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H9l-4 3v-3.5H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  health: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12h3.2l2-4.5 3.6 9 2.2-4.5H20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  layout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  io: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4.5v10M8.5 8 12 4.5 15.5 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 14.5V18a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
};

export function LeftSidebarShell({
  leftTab,
  onTabChange,
  onCollapse,
  children,
}: {
  leftTab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  onCollapse?: () => void;
  children: ReactNode;
}) {
  const active = LEFT_TABS.find((t) => t.id === leftTab) ?? LEFT_TABS[0]!;

  return (
    <div className="dl-tools-sidebar">
      <nav className="dl-tools-rail" aria-label="Workspace tools">
        {LEFT_TABS.map((tab) => {
          const isActive = leftTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`dl-tools-rail-btn${isActive ? ' is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
              title={tab.label}
              onClick={() => onTabChange(tab.id)}
            >
              {TAB_ICONS[tab.id]}
              <span className="dl-tools-rail-label">{tab.label}</span>
            </button>
          );
        })}
        <div className="mt-auto pt-4 pb-2 flex justify-center">
          <UserMenu />
        </div>

      </nav>
      <div className="dl-tools-panel">
        <div className="dl-tools-panel-header">
          <h2 className="dl-tools-panel-title">{active.label}</h2>
          {onCollapse ? (
            <button
              type="button"
              className="dl-sidebar-toggle-btn"
              title="Hide tools panel"
              aria-label="Hide tools panel"
              onClick={onCollapse}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect
                  x="3.5"
                  y="4.5"
                  width="17"
                  height="15"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path d="M9 4.5v15" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M6.2 9.5l-1.7 2.5 1.7 2.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="dl-tools-panel-body">{children}</div>
      </div>
    </div>
  );
}

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, API_URL, getAccessToken } from '@/lib/api';

export function DocumentsList({
  projectId,
  documentId,
  docs,
  onRefreshDocs,
}: {
  projectId: string;
  documentId: string;
  docs: { id: string; title: string }[];
  onRefreshDocs?: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateNew = async () => {
    setCreating(true);
    setError(null);
    try {
      const doc = await apiFetch<{ id: string }>(`/projects/${projectId}/documents`, {
        method: 'POST',
        body: JSON.stringify({ title: 'Untitled document' }),
      });
      if (onRefreshDocs) onRefreshDocs();
      router.push(`/projects/${projectId}/documents/${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportStatus('Uploading file…');
    setError(null);

    try {
      const form = new FormData();
      form.append('file', file);
      const token = getAccessToken();
      const upRes = await fetch(`${API_URL}/projects/${projectId}/documents/office-import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const doc = await upRes.json();
      if (!upRes.ok) throw new Error(doc.message ?? 'Import failed');

      setImportStatus('Import complete! LibreOffice is ready.');
      if (onRefreshDocs) onRefreshDocs();
      if (doc.id) {
        router.push(`/projects/${projectId}/documents/${doc.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      {/* Action Header: New Document & Import */}
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--dl-border)]">
        <button
          type="button"
          disabled={creating || importing}
          onClick={handleCreateNew}
          className="flex-1 flex items-center justify-center gap-1.5 rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--dl-fg)] hover:bg-[var(--dl-panel)] disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {creating ? 'Creating…' : 'New Doc'}
        </button>

        <button
          type="button"
          disabled={creating || importing}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded border border-[var(--dl-accent)] bg-[var(--dl-accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          title="Import document into project"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {importing ? 'Importing…' : 'Import'}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {importing && importStatus ? (
        <div className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
          <p className="flex items-center gap-1.5">
            <span className="inline-block animate-spin">⏳</span> {importStatus}
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {/* Document List */}
      {!docs.length ? (
        <p className="dl-tools-empty">No documents in this project yet.</p>
      ) : (
        <ul className="dl-doc-list">
          {docs.map((d) => {
            const active = d.id === documentId;
            return (
              <li key={d.id}>
                <Link
                  href={`/projects/${projectId}/documents/${d.id}`}
                  className={`dl-doc-list-item${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="dl-doc-list-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M7 3.5h7.5L18.5 7.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path d="M14 3.5V8h4.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </span>
                  <span className="dl-doc-list-title">{d.title || 'Untitled document'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
