'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

export function ProjectName({ projectId }: { projectId: string }) {
  const [name, setName] = useState('Project');
  const [canRename, setCanRename] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    let mounted = true;
    void apiFetch<{ name: string; role: string }>(`/projects/${projectId}`)
      .then((project) => {
        if (!mounted) return;
        setName(project.name);
        setCanRename(project.role === 'owner' || project.role === 'editor');
      })
      .catch((cause) => {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Could not load project');
      });
    return () => {
      mounted = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  const finish = () => {
    active.current = false;
    setEditing(false);
  };

  const save = async () => {
    if (!active.current || pending.current) return;
    const next = draft.trim();
    if (!next) {
      setError('Enter a project name.');
      return;
    }
    if (next === name) {
      finish();
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const project = await apiFetch<{ name: string }>(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: next }),
      });
      setName(project.name);
      finish();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rename project');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="dl-project-name">
      {editing ? (
        <input
          ref={input}
          className="dl-app-topbar-title dl-project-name-input"
          aria-label="Project name"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'project-name-error' : undefined}
          value={draft}
          maxLength={200}
          readOnly={saving}
          aria-busy={saving}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (saving || event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') {
              event.preventDefault();
              void save();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setError(null);
              finish();
            }
          }}
        />
      ) : (
        <h1 className="dl-app-topbar-title">
          {canRename ? (
            <button
              type="button"
              className="dl-project-name-button"
              title="Rename project"
              onClick={() => {
                setDraft(name);
                setError(null);
                active.current = true;
                setEditing(true);
              }}
            >
              {name}
            </button>
          ) : (
            name
          )}
        </h1>
      )}
      {error ? (
        <span id="project-name-error" className="dl-project-name-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
