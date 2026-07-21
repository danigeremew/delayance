'use client';

import { useEffect, useState } from 'react';
import type { Document, DocNode } from '@delayance/document-model';
import { generateNodeId } from '@delayance/document-model';
import type { DocumentOperation, NumberingMap } from '@delayance/document-engine';
import { apiFetch, API_URL, getAccessToken } from '@/lib/api';

interface Member {
  userId: string;
  name: string;
  email: string;
}

interface Assignment {
  sectionId: string;
  assigneeId: string | null;
  status: string;
}

const STATUSES = [
  'not_started',
  'notes',
  'draft',
  'needs_review',
  'approved',
  'locked',
] as const;

export function OutlinePanel({
  projectId,
  documentId,
  document,
  numbering,
  onOperate,
  onReload,
}: {
  projectId: string;
  documentId: string;
  document: Document;
  numbering: NumberingMap;
  onOperate: (op: DocumentOperation) => void;
  onReload?: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    void Promise.all([
      apiFetch<Member[]>(`/projects/${projectId}/members`),
      apiFetch<Assignment[]>(
        `/projects/${projectId}/documents/${documentId}/assignments`,
      ),
    ]).then(([m, a]) => {
      setMembers(m);
      setAssignments(a);
    });
  }, [projectId, documentId]);

  const sections = document.children.filter(
    (n): n is Extract<DocNode, { type: 'section' }> => n.type === 'section',
  );

  const upsert = async (
    sectionId: string,
    patch: { assigneeId?: string | null; status: (typeof STATUSES)[number] },
  ) => {
    await apiFetch(`/projects/${projectId}/documents/${documentId}/assignments`, {
      method: 'POST',
      body: JSON.stringify({ sectionId, ...patch }),
    });
    setAssignments(
      await apiFetch(`/projects/${projectId}/documents/${documentId}/assignments`),
    );
    onReload?.();
  };

  const exportSection = async (sectionId: string) => {
    const res = await apiFetch<{ downloadUrl: string }>(
      `/projects/${projectId}/documents/${documentId}/sections/${sectionId}/export-docx`,
    );
    window.open(res.downloadUrl, '_blank');
  };

  const importSection = async (sectionId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const token = getAccessToken();
    const res = await fetch(
      `${API_URL}/projects/${projectId}/documents/${documentId}/sections/${sectionId}/import-docx`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { message?: string }).message ?? 'Import failed');
    }
    onReload?.();
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="w-full border border-[var(--dl-border)] px-2.5 py-1.5 text-left text-sm"
        onClick={() =>
          onOperate({
            type: 'insert',
            parentId: null,
            position: 'into',
            node: {
              id: generateNodeId(),
              type: 'section',
              children: [
                {
                  id: generateNodeId(),
                  type: 'heading',
                  level: 1,
                  content: [{ type: 'text', text: 'New section' }],
                },
                {
                  id: generateNodeId(),
                  type: 'paragraph',
                  content: [{ type: 'text', text: '' }],
                },
              ],
            },
          })
        }
      >
        + Insert section
      </button>
      <ul className="space-y-2">
        {sections.map((section, index) => {
          const heading = section.children.find((c) => c.type === 'heading');
          const headingId = heading?.id;
          const label =
            (heading && numbering[heading.id]?.label) ||
            numbering[section.id]?.label ||
            'Section';
          const assignment = assignments.find((a) => a.sectionId === section.id);
          return (
            <li key={section.id} className="border-b border-[var(--dl-border)] pb-2">
              <div className="font-medium">
                {label}
                {section.locked ? (
                  <span className="ml-2 text-xs text-[var(--dl-muted)]">locked</span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                <button
                  type="button"
                  disabled={index === 0}
                  className="border border-[var(--dl-border)] px-1 disabled:opacity-40"
                  onClick={() => {
                    const prev = sections[index - 1];
                    if (!prev) return;
                    onOperate({
                      type: 'moveSection',
                      sectionId: section.id,
                      parentId: null,
                      position: 'before',
                      referenceId: prev.id,
                    });
                  }}
                >
                  Up
                </button>
                <button
                  type="button"
                  disabled={index >= sections.length - 1}
                  className="border border-[var(--dl-border)] px-1 disabled:opacity-40"
                  onClick={() => {
                    const next = sections[index + 1];
                    if (!next) return;
                    onOperate({
                      type: 'moveSection',
                      sectionId: section.id,
                      parentId: null,
                      position: 'after',
                      referenceId: next.id,
                    });
                  }}
                >
                  Down
                </button>
                {headingId ? (
                  <>
                    <button
                      type="button"
                      className="border border-[var(--dl-border)] px-1"
                      onClick={() => onOperate({ type: 'promoteHeading', headingId })}
                    >
                      Promote
                    </button>
                    <button
                      type="button"
                      className="border border-[var(--dl-border)] px-1"
                      onClick={() => onOperate({ type: 'demoteHeading', headingId })}
                    >
                      Demote
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="border border-[var(--dl-border)] px-1"
                  onClick={() =>
                    onOperate({ type: 'delete', targetId: section.id, force: true })
                  }
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="border border-[var(--dl-border)] px-1"
                  onClick={() => void exportSection(section.id)}
                >
                  DOCX↓
                </button>
                <label className="border border-[var(--dl-border)] px-1">
                  DOCX↑
                  <input
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importSection(section.id, f);
                    }}
                  />
                </label>
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                <select
                  className="border border-[var(--dl-border)] bg-[var(--dl-bg)] px-1"
                  value={assignment?.status ?? 'not_started'}
                  onChange={(e) =>
                    void upsert(section.id, {
                      status: e.target.value as (typeof STATUSES)[number],
                      assigneeId: assignment?.assigneeId ?? null,
                    })
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  className="border border-[var(--dl-border)] bg-[var(--dl-bg)] px-1"
                  value={assignment?.assigneeId ?? ''}
                  onChange={(e) =>
                    void upsert(section.id, {
                      status: (assignment?.status as (typeof STATUSES)[number]) ?? 'draft',
                      assigneeId: e.target.value || null,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
