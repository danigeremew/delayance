'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/react';

interface EditorFindReplaceProps {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditorFindReplace({ editor, isOpen, onClose }: EditorFindReplaceProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const updateMatches = useCallback(
    (term: string) => {
      if (!editor || !term.trim()) {
        setMatchCount(0);
        setCurrentMatch(0);
        return;
      }

      const text = editor.getText();
      let count = 0;
      let pos = text.toLowerCase().indexOf(term.toLowerCase());
      while (pos !== -1) {
        count++;
        pos = text.toLowerCase().indexOf(term.toLowerCase(), pos + term.length);
      }
      setMatchCount(count);
      setCurrentMatch(count > 0 ? 1 : 0);
    },
    [editor],
  );

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    updateMatches(val);
  };

  const handleNext = () => {
    if (matchCount === 0) return;
    setCurrentMatch((prev) => (prev % matchCount) + 1);
  };

  const handlePrev = () => {
    if (matchCount === 0) return;
    setCurrentMatch((prev) => (prev === 1 ? matchCount : prev - 1));
  };

  const handleReplace = () => {
    if (!editor || !searchTerm.trim() || matchCount === 0) return;
    const content = editor.getHTML();
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const updated = content.replace(regex, replaceTerm);
    editor.commands.setContent(updated, { emitUpdate: false });
    updateMatches(searchTerm);
  };

  const handleReplaceAll = () => {
    if (!editor || !searchTerm.trim() || matchCount === 0) return;
    const content = editor.getHTML();
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const updated = content.replaceAll(regex, replaceTerm);
    editor.commands.setContent(updated, { emitUpdate: false });
    updateMatches(searchTerm);
  };

  if (!isOpen) return null;

  return (
    <div className="dl-find-replace-bar flex items-center gap-2 rounded-lg border border-[var(--dl-border)] bg-[var(--dl-panel)] p-2 shadow-lg text-xs">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Find in document…"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) handlePrev();
                else handleNext();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            className="w-44 rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-2 py-1 text-xs text-[var(--dl-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--dl-accent)]"
          />

          <span className="text-[10px] text-[var(--dl-muted)] min-w-[50px] text-center">
            {matchCount > 0 ? `${currentMatch} of ${matchCount}` : 'No results'}
          </span>

          <button
            type="button"
            title="Previous match (Shift+Enter)"
            onClick={handlePrev}
            disabled={matchCount === 0}
            className="rounded p-1 text-[var(--dl-muted)] hover:bg-[var(--dl-hover)] hover:text-[var(--dl-fg)] disabled:opacity-40"
          >
            ▲
          </button>
          <button
            type="button"
            title="Next match (Enter)"
            onClick={handleNext}
            disabled={matchCount === 0}
            className="rounded p-1 text-[var(--dl-muted)] hover:bg-[var(--dl-hover)] hover:text-[var(--dl-fg)] disabled:opacity-40"
          >
            ▼
          </button>

          <button
            type="button"
            title="Toggle Replace"
            onClick={() => setShowReplace((v) => !v)}
            className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
              showReplace ? 'bg-[var(--dl-accent)] text-white' : 'hover:bg-[var(--dl-hover)]'
            }`}
          >
            Replace
          </button>

          <button
            type="button"
            title="Close (Esc)"
            onClick={onClose}
            className="rounded p-1 text-[var(--dl-muted)] hover:bg-[var(--dl-hover)] hover:text-[var(--dl-fg)]"
          >
            ✕
          </button>
        </div>

        {showReplace && (
          <div className="flex items-center gap-1.5 border-t border-[var(--dl-border)] pt-1.5">
            <input
              type="text"
              placeholder="Replace with…"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReplace();
                else if (e.key === 'Escape') onClose();
              }}
              className="w-44 rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-2 py-1 text-xs text-[var(--dl-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--dl-accent)]"
            />
            <button
              type="button"
              onClick={handleReplace}
              disabled={matchCount === 0}
              className="rounded bg-[var(--dl-hover)] px-2 py-1 text-xs hover:bg-[var(--dl-accent)] hover:text-white disabled:opacity-40"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleReplaceAll}
              disabled={matchCount === 0}
              className="rounded bg-[var(--dl-hover)] px-2 py-1 text-xs hover:bg-[var(--dl-accent)] hover:text-white disabled:opacity-40"
            >
              Replace all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
