'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { LEFT_TABS, type LeftTab } from '@/lib/workspace-store';

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
      <rect x="4" y="5" width="16" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 9.5h16M10 9.5v9.5" stroke="currentColor" strokeWidth="1.6" />
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
  children,
}: {
  leftTab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
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
      </nav>
      <div className="dl-tools-panel">
        <div className="dl-tools-panel-header">
          <h2 className="dl-tools-panel-title">{active.label}</h2>
        </div>
        <div className="dl-tools-panel-body">{children}</div>
      </div>
    </div>
  );
}

export function DocumentsList({
  projectId,
  documentId,
  docs,
}: {
  projectId: string;
  documentId: string;
  docs: { id: string; title: string }[];
}) {
  if (!docs.length) {
    return <p className="dl-tools-empty">No documents in this project yet.</p>;
  }

  return (
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
  );
}
