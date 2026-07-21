'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { apiFetch, apiFetchSse } from '@/lib/api';
import type { Document } from '@delayance/document-model';

type Mode = 'auto' | 'ask' | 'edit' | 'write' | 'review';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Pick Ask / Edit / Write / Review from your prompt' },
  { id: 'ask', label: 'Ask', hint: 'Chat only — document unchanged' },
  { id: 'edit', label: 'Edit', hint: 'Change existing document content' },
  { id: 'write', label: 'Write', hint: 'Insert new content into the document' },
  { id: 'review', label: 'Review', hint: 'Findings and optional document updates' },
];

const FALLBACK_MODELS = ['llama3.2', 'mistral', 'qwen2.5', 'gpt-4o-mini', 'gpt-4o'];

interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface Proposal {
  id: string;
  chatId?: string | null;
  mode: string;
  status: string;
  answer: string | null;
  ops: unknown[];
  findings: unknown[];
  citedSourceIds?: string[];
  promptSummary: string;
  provider: string;
  model: string;
  createdAt?: string;
}

interface SourceRow {
  id: string;
  title: string;
}

function formatChatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function IconChevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconClip() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.5V8.8a5.3 5.3 0 0 0-10.6 0v8.4a3.5 3.5 0 1 0 7 0V9.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5M5 12l7-7 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStop() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function ComposerPill({
  label,
  title,
  prefix,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  title?: string;
  prefix?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="dl-ai-pill"
        title={title}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => onOpenChange(!open)}
      >
        {prefix}
        <span className="dl-ai-pill-label">{label}</span>
        <IconChevron />
      </button>
      {open ? (
        <div className="dl-ai-menu" role="listbox">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function AiPanel({
  projectId,
  documentId,
  selectedNodeId,
  onAccepted,
  onStreamStart,
  onStreamToken,
  onStreamFinish,
  onStreamAbort,
}: {
  projectId: string;
  documentId: string;
  selectedNodeId: string | null;
  onAccepted: () => void;
  /** Called once before the first streamed token hits the editor. */
  onStreamStart?: () => void;
  onStreamToken?: (text: string) => void;
  /** Final document after stream apply, or null if nothing applied. */
  onStreamFinish?: (document: Document | null) => void;
  onStreamAbort?: () => void;
}) {
  const [mode, setMode] = useState<Mode>('auto');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [settings, setSettings] = useState<{
    provider: string;
    model: string;
    policy: string;
    baseUrl?: string | null;
  } | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [menuOpen, setMenuOpen] = useState<'mode' | 'model' | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bootstrapped = useRef(false);

  const loadChats = useCallback(async () => {
    const list = await apiFetch<Chat[]>(
      `/projects/${projectId}/documents/${documentId}/ai/chats`,
    );
    setChats(list);
    return list;
  }, [projectId, documentId]);

  const loadProposals = useCallback(
    async (chatId: string | null) => {
      if (!chatId) {
        setProposals([]);
        return;
      }
      const list = await apiFetch<Proposal[]>(
        `/projects/${projectId}/documents/${documentId}/ai/proposals?chatId=${encodeURIComponent(chatId)}`,
      );
      setProposals(list);
    },
    [projectId, documentId],
  );

  const openChat = useCallback(
    async (chatId: string) => {
      setActiveChatId(chatId);
      setOpenTabIds((prev) => (prev.includes(chatId) ? prev : [...prev, chatId]));
      setShowHistory(false);
      setError(null);
      await loadProposals(chatId);
    },
    [loadProposals],
  );

  const startNewChat = useCallback(async () => {
    const chat = await apiFetch<Chat>(
      `/projects/${projectId}/documents/${documentId}/ai/chats`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    await loadChats();
    setActiveChatId(chat.id);
    setOpenTabIds((prev) => [...prev.filter((id) => id !== chat.id), chat.id]);
    setProposals([]);
    setShowHistory(false);
    setError(null);
  }, [projectId, documentId, loadChats]);

  const closeTab = (chatId: string, e: MouseEvent) => {
    e.stopPropagation();
    setOpenTabIds((prev) => {
      const next = prev.filter((id) => id !== chatId);
      if (activeChatId === chatId) {
        const fallback = next[next.length - 1] ?? null;
        setActiveChatId(fallback);
        void loadProposals(fallback);
      }
      return next;
    });
  };

  useEffect(() => {
    void (async () => {
      try {
        const [s, src, list] = await Promise.all([
          apiFetch<{
            provider: string;
            model: string;
            policy: string;
            baseUrl: string | null;
          }>(`/projects/${projectId}/ai-settings`),
          apiFetch<SourceRow[]>(`/projects/${projectId}/sources`),
          loadChats(),
        ]);
        setSettings(s);
        setSources(src);
        if (s.provider === 'ollama') {
          const q = encodeURIComponent(s.baseUrl || 'http://127.0.0.1:11434/v1');
          const models = await apiFetch<{
            ok: boolean;
            models: { name: string }[];
          }>(`/ai/ollama/models?baseUrl=${q}`).catch(() => ({ ok: false, models: [] }));
          setOllamaModels(models.models.map((m) => m.name));
        } else {
          setOllamaModels([]);
        }
        if (!bootstrapped.current) {
          bootstrapped.current = true;
          if (list.length) {
            const first = list[0]!;
            setActiveChatId(first.id);
            setOpenTabIds([first.id]);
            await loadProposals(first.id);
          } else {
            await startNewChat();
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load AI');
      }
    })();
  }, [projectId, documentId, loadChats, loadProposals, startNewChat]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [proposals, busy, showHistory]);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  const changeModel = async (model: string) => {
    if (!settings) return;
    setSettings({ ...settings, model });
    try {
      await apiFetch(`/projects/${projectId}/ai-settings`, {
        method: 'PUT',
        body: JSON.stringify({ model }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update model');
    }
  };

  const attachFile = async (file: File) => {
    const text = await file.text().catch(() => '');
    const snippet = text.slice(0, 4000);
    setInstruction((prev) => {
      const block = snippet
        ? `\n\n[Attached ${file.name}]\n${snippet}`
        : `\n\n[Attached ${file.name}]`;
      return (prev.trim() ? prev.trim() + block : block.trim()).trim();
    });
  };

  const run = async (opts?: { preferredMode?: 'edit' | 'write'; instruction?: string }) => {
    const prompt = (opts?.instruction ?? instruction).trim();
    if (!prompt || busy) return;
    setBusy(true);
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;

    const useStream =
      mode === 'write' ||
      mode === 'auto' ||
      opts?.preferredMode === 'write' ||
      opts?.preferredMode === 'edit';

    try {
      let chatId = activeChatId;
      if (!chatId) {
        const chat = await apiFetch<Chat>(
          `/projects/${projectId}/documents/${documentId}/ai/chats`,
          { method: 'POST', body: JSON.stringify({}), signal: ac.signal },
        );
        chatId = chat.id;
        setActiveChatId(chat.id);
        setOpenTabIds((prev) => [...prev.filter((id) => id !== chat.id), chat.id]);
      }

      if (useStream && (mode === 'write' || mode === 'auto' || opts?.preferredMode)) {
        let started = false;
        let sawError: string | null = null;
        let finalChatId = chatId;
        let applied = false;
        let streamDoc: Document | null = null;

        const streamMode: 'write' | 'auto' =
          opts?.preferredMode || mode === 'auto' ? 'auto' : 'write';

        await apiFetchSse(
          `/projects/${projectId}/documents/${documentId}/ai/stream`,
          {
            method: 'POST',
            body: JSON.stringify({
              instruction: prompt,
              nodeIds: selectedNodeId ? [selectedNodeId] : undefined,
              chatId,
              mode: streamMode,
              preferredMode: opts?.preferredMode,
            }),
            signal: ac.signal,
          },
          (raw) => {
            const event = raw as {
              type: string;
              text?: string;
              message?: string;
              proposal?: Proposal;
              chatId?: string;
              applied?: boolean;
              document?: Document | null;
              externalProviderWarning?: string | null;
              validation?: { ok: boolean; errors: string[] };
            };

            if (event.type === 'token' && event.text) {
              if (!started) {
                started = true;
                onStreamStart?.();
              }
              onStreamToken?.(event.text);
              return;
            }

            if (event.type === 'clarification' && event.proposal && event.chatId) {
              finalChatId = event.chatId;
              setActiveChatId(event.chatId);
              setOpenTabIds((prev) =>
                prev.includes(event.chatId!) ? prev : [...prev, event.chatId!],
              );
              void loadChats();
              void loadProposals(event.chatId);
              return;
            }

            if (event.type === 'done') {
              if (event.chatId) finalChatId = event.chatId;
              applied = Boolean(event.applied);
              streamDoc = event.document ?? null;
              if (event.externalProviderWarning) setWarning(event.externalProviderWarning);
              if (event.validation && !event.validation.ok) {
                setError(
                  event.validation.errors.join('; ') ||
                    'AI could not produce valid document ops',
                );
              }
              return;
            }

            if (event.type === 'error') {
              sawError = event.message ?? 'Stream failed';
            }
          },
        );

        if (sawError) throw new Error(sawError);

        if (!opts?.instruction) setInstruction('');
        setActiveChatId(finalChatId);
        setOpenTabIds((prev) =>
          prev.includes(finalChatId) ? prev : [...prev, finalChatId],
        );
        await Promise.all([loadChats(), loadProposals(finalChatId)]);

        if (started) {
          onStreamFinish?.(applied ? streamDoc : null);
        } else if (applied) {
          onAccepted();
        }
        return;
      }

      const endpointMode = opts?.preferredMode ? 'auto' : mode;
      const body: {
        instruction: string;
        nodeIds?: string[];
        chatId: string;
        preferredMode?: 'edit' | 'write';
      } = {
        instruction: prompt,
        nodeIds: selectedNodeId ? [selectedNodeId] : undefined,
        chatId,
      };
      if (opts?.preferredMode) body.preferredMode = opts.preferredMode;

      const res = await apiFetch<{
        proposal: Proposal;
        chatId: string;
        applied?: boolean;
        needsClarification?: boolean;
        resolvedMode?: string | null;
        externalProviderWarning: string | null;
        validation: { ok: boolean; errors: string[] };
      }>(`/projects/${projectId}/documents/${documentId}/ai/${endpointMode}`, {
        method: 'POST',
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      setWarning(res.externalProviderWarning);
      if (!res.validation.ok) {
        setError(res.validation.errors.join('; ') || 'AI could not produce valid document ops');
      }
      if (!opts?.instruction) setInstruction('');
      setActiveChatId(res.chatId);
      setOpenTabIds((prev) =>
        prev.includes(res.chatId) ? prev : [...prev, res.chatId],
      );
      await Promise.all([loadChats(), loadProposals(res.chatId)]);
      if (res.applied) onAccepted();
    } catch (e) {
      onStreamAbort?.();
      if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('abort'))) {
        setError('Stopped');
      } else {
        setError(e instanceof Error ? e.message : 'AI request failed');
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const resolveClarification = async (
    proposal: Proposal,
    preferredMode: 'edit' | 'write',
  ) => {
    try {
      await apiFetch(`/projects/${projectId}/ai/proposals/${proposal.id}/reject`, {
        method: 'POST',
      });
    } catch {
      // Still proceed even if discarding the clarification card fails.
    }
    await run({ preferredMode, instruction: proposal.promptSummary });
  };

  const accept = async (id: string) => {
    await apiFetch(`/projects/${projectId}/ai/proposals/${id}/accept`, {
      method: 'POST',
      body: '{}',
    });
    await loadProposals(activeChatId);
    onAccepted();
  };

  const reject = async (id: string) => {
    await apiFetch(`/projects/${projectId}/ai/proposals/${id}/reject`, {
      method: 'POST',
      body: '{}',
    });
    await loadProposals(activeChatId);
  };

  const archiveChat = async (chatId: string, e: MouseEvent) => {
    e.stopPropagation();
    await apiFetch(`/projects/${projectId}/ai/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ archive: true }),
    });
    const list = await loadChats();
    setOpenTabIds((prev) => prev.filter((id) => id !== chatId));
    if (activeChatId === chatId) {
      const next = list[0]?.id ?? null;
      setActiveChatId(next);
      if (next) {
        setOpenTabIds((prev) => (prev.includes(next) ? prev : [...prev, next]));
        await loadProposals(next);
      } else {
        setProposals([]);
        await startNewChat();
      }
    }
  };

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0]!;
  const activeChat = chats.find((c) => c.id === activeChatId);
  const openTabs = openTabIds
    .map((id) => chats.find((c) => c.id === id))
    .filter((c): c is Chat => Boolean(c));
  const modelOptions = Array.from(
    new Set([
      ...(settings?.model ? [settings.model] : []),
      ...(settings?.provider === 'ollama' && ollamaModels.length
        ? ollamaModels
        : FALLBACK_MODELS),
    ]),
  );

  return (
    <div className="flex h-full min-h-0 flex-col text-base">
      <div className="shrink-0 space-y-2 border-b border-[var(--dl-border)] pb-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={`border px-2 py-1 text-sm ${showHistory ? 'border-[var(--dl-accent)] bg-[var(--dl-bg)]' : 'border-[var(--dl-border)]'}`}
            onClick={() => setShowHistory((v) => !v)}
            title="Chat history"
          >
            History
          </button>
          <button
            type="button"
            className="border border-[var(--dl-border)] px-2 py-1 text-sm"
            onClick={() => void startNewChat()}
            title="New chat"
          >
            New
          </button>
        </div>

        {openTabs.length > 0 ? (
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {openTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => void openChat(tab.id)}
                className={`group flex max-w-[9rem] shrink-0 items-center gap-1 border px-2 py-1 text-xs ${
                  activeChatId === tab.id && !showHistory
                    ? 'border-[var(--dl-accent)] bg-[var(--dl-bg)]'
                    : 'border-[var(--dl-border)]'
                }`}
              >
                <span className="truncate">{tab.title}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="text-[var(--dl-muted)] opacity-60 hover:opacity-100"
                  onClick={(e) => closeTab(tab.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') closeTab(tab.id, e as never);
                  }}
                  title="Close tab"
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {warning ? (
          <div className="border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-900">
            {warning}
          </div>
        ) : null}
      </div>

      {showHistory ? (
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--dl-muted)]">
            All chats
          </p>
          {chats.length === 0 ? (
            <p className="text-sm text-[var(--dl-muted)]">No chats yet.</p>
          ) : (
            <ul className="space-y-1">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => void openChat(chat.id)}
                    className={`flex w-full items-start gap-2 border px-2.5 py-2 text-left text-sm ${
                      activeChatId === chat.id
                        ? 'border-[var(--dl-accent)] bg-[var(--dl-bg)]'
                        : 'border-[var(--dl-border)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{chat.title}</p>
                      <p className="text-xs text-[var(--dl-muted)]">
                        {formatChatTime(chat.updatedAt)}
                      </p>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      className="shrink-0 text-xs text-[var(--dl-muted)] underline"
                      onClick={(e) => void archiveChat(chat.id, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void archiveChat(chat.id, e as never);
                      }}
                    >
                      Archive
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3">
          {!activeChatId || (proposals.length === 0 && !busy) ? (
            <p className="text-sm text-[var(--dl-muted)]">
              {activeChat
                ? `“${activeChat.title}” — send a message to start.`
                : 'Start a conversation. Auto picks Ask / Edit / Write / Review from your prompt.'}
            </p>
          ) : null}
          {proposals.map((p) => (
            <div key={p.id} className="space-y-1.5">
              <div className="ml-4 rounded border border-[var(--dl-border)] bg-[var(--dl-bg)] px-2.5 py-2 text-sm">
                <div className="mb-0.5 text-xs uppercase tracking-wide text-[var(--dl-muted)]">
                  You · {p.mode}
                </div>
                <p className="whitespace-pre-wrap">{p.promptSummary}</p>
              </div>
              <div className="mr-2 rounded border border-[var(--dl-border)] px-2.5 py-2 text-sm">
                <div className="mb-0.5 text-xs uppercase tracking-wide text-[var(--dl-muted)]">
                  Assistant · {p.status}
                  {p.mode !== 'ask' && Array.isArray(p.ops) && p.ops.length
                    ? ` · ${p.ops.length} op(s)`
                    : ''}
                </div>
                {p.answer ? <p className="whitespace-pre-wrap">{p.answer}</p> : null}
                {!p.answer && (p.mode === 'ask' || p.mode === 'auto') ? (
                  <p className="text-[var(--dl-muted)]">(empty reply)</p>
                ) : null}
                {p.citedSourceIds?.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.citedSourceIds.map((id) => {
                      const title = sources.find((s) => s.id === id)?.title ?? id.slice(0, 8);
                      return (
                        <span
                          key={id}
                          className="border border-[var(--dl-border)] px-1.5 py-0.5 text-xs"
                        >
                          {title}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {p.status === 'pending' && p.mode === 'auto' ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="border border-[var(--dl-border)] px-2 py-1 text-sm"
                      disabled={busy}
                      onClick={() => void resolveClarification(p, 'edit')}
                    >
                      Edit existing
                    </button>
                    <button
                      type="button"
                      className="border border-[var(--dl-border)] px-2 py-1 text-sm"
                      disabled={busy}
                      onClick={() => void resolveClarification(p, 'write')}
                    >
                      Write new
                    </button>
                    <button
                      type="button"
                      className="border border-[var(--dl-border)] px-2 py-1 text-sm text-[var(--dl-muted)]"
                      disabled={busy}
                      onClick={() => void reject(p.id)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
                {p.status === 'pending' && p.mode !== 'ask' && p.mode !== 'auto' ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="border border-[var(--dl-border)] px-2 py-1 text-sm"
                      onClick={() => void accept(p.id)}
                    >
                      Apply to document
                    </button>
                    <button
                      type="button"
                      className="border border-[var(--dl-border)] px-2 py-1 text-sm"
                      onClick={() => void reject(p.id)}
                    >
                      Discard
                    </button>
                  </div>
                ) : null}
                {p.status === 'accepted' && p.mode !== 'ask' && p.mode !== 'auto' ? (
                  <p className="mt-1 text-xs text-[var(--dl-muted)]">Applied to document</p>
                ) : null}
              </div>
            </div>
          ))}
          {busy ? (
            <p className="text-sm text-[var(--dl-muted)]">
              {mode === 'write' || mode === 'auto' ? 'Writing into document…' : 'Thinking…'}
            </p>
          ) : null}
        </div>
      )}

      {!showHistory ? (
        <div className="shrink-0 border-t border-[var(--dl-border)] pt-2">
          {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
          <div className="dl-ai-composer">
            <textarea
              className="w-full resize-none border-0 bg-transparent px-3.5 pt-3 pb-2 text-sm outline-none placeholder:text-[var(--dl-muted)]"
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void run();
                }
              }}
              placeholder="Describe what you need — Auto picks the mode"
            />
            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <ComposerPill
                  label={activeMode.label}
                  title={activeMode.hint}
                  prefix={<span className="text-[var(--dl-muted)]">∞</span>}
                  open={menuOpen === 'mode'}
                  onOpenChange={(open) => setMenuOpen(open ? 'mode' : null)}
                >
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      data-active={mode === m.id}
                      aria-selected={mode === m.id}
                      onClick={() => {
                        setMode(m.id);
                        setMenuOpen(null);
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </ComposerPill>
                <ComposerPill
                  label={
                    settings
                      ? `${settings.provider}/${settings.model}`
                      : 'Model'
                  }
                  title="Model"
                  open={menuOpen === 'model'}
                  onOpenChange={(open) =>
                    settings && setMenuOpen(open ? 'model' : null)
                  }
                >
                  {modelOptions.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="option"
                      data-active={settings?.model === m}
                      aria-selected={settings?.model === m}
                      onClick={() => {
                        void changeModel(m);
                        setMenuOpen(null);
                      }}
                    >
                      {settings?.provider ? `${settings.provider}/${m}` : m}
                    </button>
                  ))}
                </ComposerPill>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {busy ? <span className="dl-ai-spinner mr-1" title="Running" /> : null}
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void attachFile(file);
                  }}
                />
                <button
                  type="button"
                  className="dl-ai-icon-btn"
                  title="Attach file"
                  onClick={() => fileRef.current?.click()}
                >
                  <IconClip />
                </button>
                {busy ? (
                  <button
                    type="button"
                    className="dl-ai-send"
                    title="Stop"
                    onClick={stop}
                    aria-label="Stop"
                  >
                    <IconStop />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dl-ai-send"
                    title={
                      mode === 'ask'
                        ? 'Send'
                        : mode === 'auto'
                          ? 'Send (auto)'
                          : 'Send & apply'
                    }
                    disabled={!instruction.trim()}
                    onClick={() => void run()}
                    aria-label="Send"
                  >
                    <IconSend />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
