'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type DocumentRow = { id: string; title: string };

export function DocumentsList({
  projectId,
  documentId,
  docs,
  onDocumentsChange,
  beforeNavigate,
}: {
  projectId: string;
  documentId?: string;
  docs: DocumentRow[];
  onDocumentsChange: (docs: DocumentRow[]) => void;
  beforeNavigate?: () => Promise<void>;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const busy = useRef(false);
  const editing = useRef<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const canEdit = role === 'owner' || role === 'editor' || role === 'contributor';
  const canDelete = role === 'owner' || role === 'editor';
  const base = `/projects/${projectId}/documents`;

  useEffect(() => {
    let active = true;
    void apiFetch<{ role: string }>(`/projects/${projectId}`)
      .then((project) => {
        if (active) setRole(project.role);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Could not load document permissions');
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (renameId) {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [renameId]);

  useEffect(() => {
    if (!menuId) return;
    menu.current?.querySelector('button')?.focus();
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-document-actions]'))
        setMenuId(null);
    };
    const blur = () => setMenuId(null);
    document.addEventListener('pointerdown', close);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', blur);
    };
  }, [menuId]);

  const perform = async (operation: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Document action failed');
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const saveName = async (doc: DocumentRow) => {
    if (editing.current !== doc.id || busy.current) return;
    const title = draft.trim();
    if (!title) {
      setError('Enter a document name.');
      return;
    }
    if (title === doc.title) {
      editing.current = null;
      setRenameId(null);
      return;
    }
    await perform(async () => {
      const updated = await apiFetch<DocumentRow>(`${base}/${doc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      onDocumentsChange(
        docs.map((row) => (row.id === doc.id ? { ...row, title: updated.title } : row)),
      );
      editing.current = null;
      setRenameId(null);
    });
  };

  const remove = (doc: DocumentRow) =>
    perform(async () => {
      await apiFetch(`${base}/${doc.id}`, { method: 'DELETE' });
      const remaining = docs.filter((row) => row.id !== doc.id);
      onDocumentsChange(remaining);
      setDeleteId(null);
      if (doc.id === documentId) {
        router.replace(remaining[0] ? `${base}/${remaining[0].id}` : `/projects/${projectId}`);
      }
    });

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div className="dl-document-list-toolbar">
        <button
          type="button"
          className="dl-ai-btn"
          disabled={!canEdit || pending}
          onClick={() =>
            void perform(async () => {
              await beforeNavigate?.();
              const doc = await apiFetch<DocumentRow>(base, {
                method: 'POST',
                body: JSON.stringify({ title: 'Untitled document' }),
              });
              onDocumentsChange([doc, ...docs]);
              router.push(`${base}/${doc.id}`);
            })
          }
        >
          + New Doc
        </button>
        <button
          type="button"
          className="dl-ai-btn dl-ai-btn-primary"
          disabled={!canEdit || pending}
          onClick={() => fileInput.current?.click()}
        >
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".docx"
          aria-label="Import DOCX document"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void perform(async () => {
              await beforeNavigate?.();
              const body = new FormData();
              body.append('file', file);
              const doc = await apiFetch<DocumentRow>(`${base}/office-import`, {
                method: 'POST',
                body,
              });
              onDocumentsChange([doc, ...docs]);
              router.push(`${base}/${doc.id}`);
            }).finally(() => {
              if (fileInput.current) fileInput.current.value = '';
            });
          }}
        />
      </div>
      {pending ? (
        <p role="status" className="text-xs text-[var(--dl-muted)]">
          Updating documents…
        </p>
      ) : null}
      {role && !canEdit ? (
        <p className="dl-tools-empty">You have read-only access to documents.</p>
      ) : null}
      {error ? (
        <div className="dl-document-action-error" role="alert">
          {error}
        </div>
      ) : null}
      {!docs.length ? (
        <p className="dl-tools-empty">No documents in this project yet.</p>
      ) : (
        <ul className="dl-doc-list">
          {docs.map((doc) => (
            <li key={doc.id} data-document-id={doc.id}>
              <div className={`dl-doc-row${doc.id === documentId ? ' is-active' : ''}`}>
                {renameId === doc.id ? (
                  <input
                    ref={nameInput}
                    className="dl-document-name-input"
                    aria-label="Document name"
                    maxLength={500}
                    value={draft}
                    readOnly={pending}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setError(null);
                    }}
                    onBlur={() => void saveName(doc)}
                    onKeyDown={(event) => {
                      if (pending || event.nativeEvent.isComposing) return;
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void saveName(doc);
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        editing.current = null;
                        setRenameId(null);
                        setError(null);
                      }
                    }}
                  />
                ) : (
                  <Link
                    href={`${base}/${doc.id}`}
                    className="dl-doc-list-item"
                    onClick={(event) => {
                      if (
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      if (doc.id === documentId) return;
                      void perform(async () => {
                        await beforeNavigate?.();
                        router.push(`${base}/${doc.id}`);
                      });
                    }}
                    aria-current={doc.id === documentId ? 'page' : undefined}
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
                    <span className="dl-doc-list-title">{doc.title || 'Untitled document'}</span>
                  </Link>
                )}
                {canEdit && renameId !== doc.id ? (
                  <div className="dl-document-actions" data-document-actions>
                    <button
                      type="button"
                      className="dl-document-menu-trigger"
                      aria-label={`Actions for ${doc.title}`}
                      aria-haspopup="menu"
                      aria-expanded={menuId === doc.id}
                      disabled={pending}
                      onClick={(event) => {
                        menuTrigger.current = event.currentTarget;
                        setMenuId(menuId === doc.id ? null : doc.id);
                        setDeleteId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setMenuId(null);
                        if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          menuTrigger.current = event.currentTarget;
                          setMenuId(doc.id);
                        }
                      }}
                    >
                      ⋯
                    </button>
                    {menuId === doc.id ? (
                      <div
                        ref={menu}
                        className="dl-document-menu"
                        role="menu"
                        aria-label={`Actions for ${doc.title}`}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setMenuId(null);
                            menuTrigger.current?.focus();
                          }
                          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                            event.preventDefault();
                            const items = Array.from(
                              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                                '[role="menuitem"]',
                              ),
                            );
                            const current = items.findIndex(
                              (item) => item === document.activeElement,
                            );
                            const next =
                              event.key === 'Home'
                                ? 0
                                : event.key === 'End'
                                  ? items.length - 1
                                  : (current +
                                      (event.key === 'ArrowDown' ? 1 : -1) +
                                      items.length) %
                                    items.length;
                            items[next]?.focus();
                          }
                        }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            editing.current = doc.id;
                            setDraft(doc.title);
                            setRenameId(doc.id);
                            setMenuId(null);
                            setError(null);
                          }}
                        >
                          Rename
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="dl-document-delete"
                            onClick={() => {
                              setDeleteId(doc.id);
                              setMenuId(null);
                              setError(null);
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {deleteId === doc.id ? (
                <div
                  className="dl-document-delete-confirm"
                  role="group"
                  aria-label={`Delete ${doc.title}?`}
                >
                  <p>Delete “{doc.title}” and its version history? This cannot be undone.</p>
                  <button
                    type="button"
                    className="dl-ai-btn dl-document-delete"
                    disabled={pending}
                    onClick={() => void remove(doc)}
                  >
                    Delete document
                  </button>
                  <button
                    type="button"
                    className="dl-ai-btn"
                    disabled={pending}
                    onClick={() => setDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
