'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { apiFetch, apiFetchSse } from '@/lib/api';
import type { EditorAdapter } from '@/editor/adapter';
import type { Document } from '@delayance/document-model';

type Mode = 'auto' | 'ask' | 'edit' | 'write' | 'review';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Pick Ask / Edit / Write / Review from your prompt' },
  { id: 'ask', label: 'Ask', hint: 'Chat only — document unchanged' },
  { id: 'edit', label: 'Edit', hint: 'Change existing document content' },
  { id: 'write', label: 'Write', hint: 'Insert new content into the document' },
  { id: 'review', label: 'Review', hint: 'Review document text and suggest improvements' },
];

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

interface OfficeRevision {
  type: 'office-text';
  action: 'insert' | 'replace';
  originalText: string;
  text: string;
}
function officeRevision(value: unknown): OfficeRevision | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return row.type === 'office-text' &&
    (row.action === 'insert' || row.action === 'replace') &&
    typeof row.originalText === 'string' &&
    typeof row.text === 'string'
    ? { type: 'office-text', action: row.action, originalText: row.originalText, text: row.text }
    : null;
}

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

function IconHistory() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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

function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  initialShowSettings = false,
  editor,
  onAccepted,
  onStreamStart,
  onStreamToken,
  onStreamFinish,
  onStreamAbort,
  onCollapse,
}: {
  projectId: string;
  documentId: string;
  selectedNodeId: string | null;
  initialShowSettings?: boolean;
  editor?: EditorAdapter | null;
  onAccepted: () => void;
  /** Called once before the first streamed token hits the editor. */
  onStreamStart?: () => void;
  onStreamToken?: (text: string) => void;
  /** Final document after stream apply, or null if nothing applied. */
  onStreamFinish?: (document: Document | null) => void;
  onStreamAbort?: () => void;
  onCollapse?: () => void;
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
  const [showSettings, setShowSettings] = useState(initialShowSettings);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [settings, setSettings] = useState<{
    provider: string;
    model: string;
    policy: string;
    baseUrl?: string | null;
    hasApiKey?: boolean;
    hasCustomApiKey?: boolean;
  } | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [menuOpen, setMenuOpen] = useState<'mode' | 'model' | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyChanged, setApiKeyChanged] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [selectedPolicy, setSelectedPolicy] = useState<'any' | 'local_only'>('any');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bootstrapped = useRef(false);
  const [inlineId, setInlineId] = useState<string | null>(null);
  const appliedIds = useRef(new Set<string>());
  const stagedProposals = useRef(new Map<string, Proposal>());
  const accepting = useRef(false);
  const decisionHandler = useRef<(event: { id: string; decision: 'accept' | 'reject' }) => void>(
    () => {},
  );
  useEffect(() => {
    setInlineId(null);
    return editor?.subscribePreview((event) => decisionHandler.current(event));
  }, [editor]);

  const loadChats = useCallback(async () => {
    const list = await apiFetch<Chat[]>(`/projects/${projectId}/documents/${documentId}/ai/chats`);
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
      setShowSettings(false);
      setError(null);
      await loadProposals(chatId);
    },
    [loadProposals],
  );

  const startNewChat = useCallback(async () => {
    const chat = await apiFetch<Chat>(`/projects/${projectId}/documents/${documentId}/ai/chats`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await loadChats();
    setActiveChatId(chat.id);
    setOpenTabIds((prev) => [...prev.filter((id) => id !== chat.id), chat.id]);
    setProposals([]);
    setShowHistory(false);
    setShowSettings(false);
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
            hasApiKey: boolean;
            hasCustomApiKey?: boolean;
          }>(`/projects/${projectId}/ai-settings`),
          apiFetch<SourceRow[]>(`/projects/${projectId}/sources`),
          loadChats(),
        ]);
        setSettings(s);
        setSelectedModel(s.model || 'gemini-3.8-flash');
        setSelectedPolicy((s.policy as 'any' | 'local_only') || 'any');
        setSources(src);
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
    if (settings) {
      setSelectedModel(settings.model || 'gemini-3.8-flash');
      setSelectedPolicy((settings.policy as 'any' | 'local_only') || 'any');
    }
  }, [settings]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [proposals, busy, showHistory, showSettings]);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  const changeModel = async (model: string) => {
    if (!settings) return;

    try {
      await apiFetch(`/projects/${projectId}/ai-settings`, {
        method: 'PUT',
        body: JSON.stringify({ model }),
      });
      setSettings({ ...settings, model });
      setSelectedModel(model);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update model');
    }
  };

  const saveSettings = async (opts?: { clearApiKey?: boolean }) => {
    setSettingsSaving(true);
    setSettingsSuccess(null);
    setSettingsError(null);
    try {
      const payload: {
        model?: string;
        policy?: 'any' | 'local_only';
        apiKey?: string | null;
      } = {
        model: selectedModel.trim() || undefined,
        policy: selectedPolicy,
      };

      if (opts?.clearApiKey) {
        payload.apiKey = null;
      } else if (apiKeyChanged && apiKeyInput.trim()) {
        payload.apiKey = apiKeyInput.trim();
      }

      const updated = await apiFetch<{
        provider: string;
        model: string;
        policy: string;
        baseUrl: string | null;
        hasApiKey: boolean;
        hasCustomApiKey?: boolean;
      }>(`/projects/${projectId}/ai-settings`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      setSettings(updated);
      setSelectedModel(updated.model || 'gemini-3.8-flash');
      setSelectedPolicy((updated.policy as 'any' | 'local_only') || 'any');
      if (opts?.clearApiKey) setApiKeyInput('');
      setApiKeyChanged(false);
      setSettingsSuccess(
        opts?.clearApiKey
          ? 'Custom API key removed.'
          : payload.apiKey
            ? 'Gemini API key and settings saved successfully.'
            : 'Settings saved successfully.',
      );
      setError(null);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : 'Could not save AI settings');
    } finally {
      setSettingsSaving(false);
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
    if (!prompt || busy || inlineId) return;
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

      if (editor !== undefined) {
        if (!editor) throw new Error('Wait for the document editor to load.');
        await editor.save();
        // Capture before generation, including a collapsed caret for Write.
        const selection = mode === 'ask' || mode === 'review' ? null : await editor.getSelection();
        if (
          (opts?.preferredMode === 'write' || mode === 'write') &&
          selection &&
          !selection.isCollapsed
        ) {
          throw new Error(
            'Place the cursor without selecting text for Write, or choose Edit to replace the selection.',
          );
        }
        const result = await apiFetch<{
          chatId: string;
          proposal: Proposal;
          externalProviderWarning: string | null;
          validation: { ok: boolean; errors: string[] };
        }>(`/projects/${projectId}/documents/${documentId}/office/ai`, {
          method: 'POST',
          signal: ac.signal,
          body: JSON.stringify({
            instruction: prompt,
            mode: opts?.preferredMode ? 'auto' : mode,
            preferredMode: opts?.preferredMode,
            chatId,
            selectedText: selection?.text ?? '',
          }),
        });
        setWarning(result.externalProviderWarning);
        if (!opts?.instruction) setInstruction('');
        setActiveChatId(result.chatId);
        await Promise.all([loadChats(), loadProposals(result.chatId)]);
        const revision = officeRevision(result.proposal?.ops[0]);
        if (
          revision &&
          selection &&
          result.proposal.status === 'pending' &&
          (result.proposal.mode === 'write' || result.proposal.mode === 'edit')
        ) {
          await editor.previewProposal({
            id: result.proposal.id,
            handle: selection.handle,
            action: revision.action,
            text: revision.text,
          });
          stagedProposals.current.set(result.proposal.id, result.proposal);
          setInlineId(result.proposal.id);
        }
        return;
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
                  event.validation.errors.join('; ') || 'AI could not produce valid document ops',
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
        setOpenTabIds((prev) => (prev.includes(finalChatId) ? prev : [...prev, finalChatId]));
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
      setOpenTabIds((prev) => (prev.includes(res.chatId) ? prev : [...prev, res.chatId]));
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

  const resolveClarification = async (proposal: Proposal, preferredMode: 'edit' | 'write') => {
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
    if (busy || accepting.current) return;
    accepting.current = true;
    setBusy(true);
    setError(null);
    try {
      const proposal = stagedProposals.current.get(id) ?? proposals.find((item) => item.id === id);
      const revision = officeRevision(proposal?.ops[0]);
      if (revision) {
        if (!editor) throw new Error('Wait for the document editor to load.');
        const body = JSON.stringify({ accessToken: editor.getSessionToken() });
        if (!appliedIds.current.has(id)) {
          if (inlineId !== id)
            throw new Error('Preview this proposal in the document before accepting.');
          await apiFetch(`/projects/${projectId}/ai/proposals/${id}/office-accept`, {
            method: 'POST',
            body,
          });
          await editor.commitPreview(id);
          appliedIds.current.add(id);
          setInlineId(null);
        }
        await editor.save();
        // Retry completion while the saved DOCX snapshot becomes available.
        // Retry verification, never the paste, while the immutable file version arrives.
        for (let attempt = 0; ; attempt++) {
          try {
            await apiFetch(`/projects/${projectId}/ai/proposals/${id}/office-complete`, {
              method: 'POST',
              body,
            });
            break;
          } catch (cause) {
            const pendingSave =
              cause instanceof Error &&
              (cause.message === 'The editor has not saved the change yet.' ||
                cause.message === 'The saved document does not contain the proposed text yet.');
            if (!pendingSave || attempt >= 20) throw cause;
            await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
          }
        }
      } else {
        if (editor !== undefined)
          throw new Error(
            'This proposal cannot modify the office document. Generate a new Edit or Write proposal.',
          );
        await apiFetch(`/projects/${projectId}/ai/proposals/${id}/accept`, {
          method: 'POST',
          body: '{}',
        });
      }
      stagedProposals.current.delete(id);
      await loadProposals(activeChatId);
      onAccepted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not apply proposal');
    } finally {
      accepting.current = false;
      setBusy(false);
    }
  };

  const reject = async (id: string) => {
    if (busy || accepting.current) return;
    if (appliedIds.current.has(id)) {
      setError('This text was already inserted. Retry saving to finish.');
      return;
    }
    accepting.current = true;
    setBusy(true);
    setError(null);
    try {
      if (inlineId === id && editor) {
        await editor.discardPreview(id);
        setInlineId(null);
      }
      await apiFetch(`/projects/${projectId}/ai/proposals/${id}/reject`, {
        method: 'POST',
        body: '{}',
      });
      stagedProposals.current.delete(id);
      await loadProposals(activeChatId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not discard proposal');
    } finally {
      accepting.current = false;
      setBusy(false);
    }
  };

  const previewProposal = async (proposal: Proposal) => {
    if (!editor || busy || inlineId) return;
    try {
      setError(null);
      const revision = officeRevision(proposal.ops[0]);
      if (!revision) return;
      const selection = await editor.getSelection();
      if (revision.action === 'replace' && selection.text !== revision.originalText)
        throw new Error('Select the original text before previewing this edit.');
      await editor.previewProposal({
        id: proposal.id,
        handle: selection.handle,
        action: revision.action,
        text: revision.text,
      });
      stagedProposals.current.set(proposal.id, proposal);
      setInlineId(proposal.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not preview proposal');
    }
  };
  decisionHandler.current = (event) => {
    if (event.id !== inlineId) return;
    void (event.decision === 'accept' ? accept(event.id) : reject(event.id)).catch(
      (cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not resolve preview'),
    );
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

  const testConnection = async () => {
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSuccess(null);
    try {
      const result = await apiFetch<{ model: string }>(`/projects/${projectId}/ai-settings/test`, {
        method: 'POST',
        body: '{}',
      });
      setSettingsSuccess(`Gemini connection works with ${result.model}.`);
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Gemini connection failed');
    } finally {
      setSettingsSaving(false);
    }
  };

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0]!;
  const activeChat = chats.find((c) => c.id === activeChatId);
  const openTabs = openTabIds
    .map((id) => chats.find((c) => c.id === id))
    .filter((c): c is Chat => Boolean(c));
  const modelOptions = Array.from(
    new Set([...(settings?.model ? [settings.model] : []), ...GEMINI_MODELS]),
  );

  return (
    <div className="dl-ai-panel">
      <header className="dl-ai-header">
        <div className="dl-ai-header-title">
          <span className="dl-ai-header-mark" aria-hidden="true" />
          <div>
            <h2>{showSettings ? 'AI Settings' : 'Assistant'}</h2>
            <p>{showSettings ? 'Configure Gemini API key & model' : activeMode.hint}</p>
          </div>
        </div>
        <div className="dl-ai-header-actions">
          <button
            type="button"
            className={`dl-ai-icon-btn ${showHistory ? 'is-active' : ''}`}
            onClick={() => {
              setShowHistory((v) => !v);
              setShowSettings(false);
            }}
            title="Chat history"
            aria-label="Chat history"
            aria-pressed={showHistory}
          >
            <IconHistory />
          </button>
          <button
            type="button"
            className="dl-ai-icon-btn"
            onClick={() => void startNewChat()}
            title="New chat"
            aria-label="New chat"
          >
            <IconPlus />
          </button>
          <button
            type="button"
            className={`dl-ai-icon-btn ${showSettings ? 'is-active' : ''}`}
            onClick={() => {
              setShowSettings((v) => !v);
              setShowHistory(false);
              setSettingsSuccess(null);
              setSettingsError(null);
            }}
            title="AI settings"
            aria-label="AI settings"
            aria-pressed={showSettings}
          >
            <IconSettings />
          </button>
          {onCollapse ? (
            <button
              type="button"
              className="dl-ai-icon-btn"
              onClick={onCollapse}
              title="Hide AI panel"
              aria-label="Hide AI panel"
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
                <path d="M15 4.5v15" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M17.8 9.5l1.7 2.5-1.7 2.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </header>

      {!showSettings && !showHistory && openTabs.length > 0 ? (
        <div className="dl-ai-tabs" role="tablist" aria-label="Open chats">
          {openTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeChatId === tab.id}
              onClick={() => void openChat(tab.id)}
              className={`dl-ai-tab ${activeChatId === tab.id ? 'is-active' : ''}`}
            >
              <span className="dl-ai-tab-label">{tab.title}</span>
              <span
                role="button"
                tabIndex={0}
                className="dl-ai-tab-close"
                onClick={(e) => closeTab(tab.id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') closeTab(tab.id, e as never);
                }}
                title="Close tab"
              >
                <IconClose />
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {warning ? <div className="dl-ai-banner dl-ai-banner-warn">{warning}</div> : null}

      {!showSettings && !showHistory && settings && !settings.hasApiKey ? (
        <div className="dl-ai-banner dl-ai-banner-warn flex items-center justify-between">
          <span>Gemini API key is required.</span>
          <button
            type="button"
            className="dl-ai-banner-action"
            onClick={() => {
              setShowSettings(true);
              setShowHistory(false);
            }}
          >
            Configure Key
          </button>
        </div>
      ) : null}

      {showSettings ? (
        <div className="dl-ai-settings">
          <p className="dl-ai-settings-description">
            AI context: your prompt, saved document text, selection, and relevant project context
            are sent to the configured Gemini service. Write and Edit appear as a preview in the
            document; accepting a preview saves it. Ask and Review stay in this sidebar.
          </p>
          <div className="dl-ai-settings-card">
            <div className="flex items-center justify-between">
              <span className="dl-ai-section-label" style={{ margin: 0 }}>
                Status
              </span>
              {settings?.hasApiKey ? (
                <span className="dl-ai-status-badge is-active">
                  <span className="dl-ai-status-dot" />
                  API Key Configured
                </span>
              ) : (
                <span className="dl-ai-status-badge is-warning">
                  <span className="dl-ai-status-dot" />
                  No API Key
                </span>
              )}
            </div>
            <p className="dl-ai-settings-description">
              {settings?.hasApiKey
                ? settings.hasCustomApiKey
                  ? 'Custom project key active (stored encrypted).'
                  : 'Server default Gemini key active.'
                : 'A Google Gemini API key is required to use AI features.'}
            </p>
          </div>

          {settingsSuccess ? (
            <div className="dl-ai-banner dl-ai-banner-success" role="status">
              {settingsSuccess}
            </div>
          ) : null}
          {settingsError ? (
            <div className="dl-ai-banner dl-ai-banner-warn" role="alert">
              {settingsError}
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveSettings();
            }}
            autoComplete="off"
            className="dl-ai-settings-form"
          >
            <div className="dl-ai-settings-field">
              <label htmlFor="gemini-api-key">Gemini API Key</label>
              <span className="dl-field-hint">
                Show reveals the key entered here. Previously saved keys are not returned.
              </span>
              <div className="dl-ai-settings-input-row">
                <input
                  id="gemini-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  name="gemini-api-token"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    setApiKeyChanged(true);
                  }}
                  placeholder={
                    settings?.hasApiKey ? 'Key saved — leave blank to keep it' : 'AIzaSy...'
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="dl-ai-btn"
                  onClick={() => setShowApiKey((v) => !v)}
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  aria-pressed={showApiKey}
                  aria-controls="gemini-api-key"
                  title={showApiKey ? 'Hide key' : 'Show key'}
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
              {settings?.hasCustomApiKey ? (
                <div>
                  <button
                    type="button"
                    className="text-xs text-[var(--dl-muted)] underline hover:text-[var(--dl-fg)]"
                    onClick={() => void saveSettings({ clearApiKey: true })}
                    disabled={settingsSaving}
                  >
                    Remove custom key (use server default)
                  </button>
                </div>
              ) : null}
            </div>

            <div className="dl-ai-settings-field">
              <label htmlFor="gemini-model-select">Model</label>
              <select
                id="gemini-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="dl-ai-select"
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                {!GEMINI_MODELS.includes(selectedModel) ? (
                  <option value={selectedModel}>{selectedModel}</option>
                ) : null}
              </select>
            </div>

            <div className="dl-ai-settings-field">
              <label htmlFor="gemini-custom-model">Custom model ID</label>
              <input
                id="gemini-custom-model"
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                placeholder="gemini-3.8-flash"
              />
              <span className="dl-field-hint">
                Use the exact text model ID from Google AI Studio. Save settings before testing.
              </span>
            </div>

            <div className="dl-ai-settings-field">
              <label htmlFor="gemini-policy-select">Policy</label>
              <select
                id="gemini-policy-select"
                value={selectedPolicy}
                onChange={(e) => setSelectedPolicy(e.target.value as 'any' | 'local_only')}
                className="dl-ai-select"
              >
                <option value="any">Allow external AI (Gemini)</option>
                <option value="local_only">Local only (block external calls)</option>
              </select>
              <span className="dl-field-hint">
                If local-only, external requests to Gemini are blocked.
              </span>
            </div>

            <div className="dl-ai-settings-actions">
              <button
                type="button"
                className="dl-ai-btn"
                disabled={settingsSaving}
                onClick={() => void testConnection()}
              >
                Test saved connection
              </button>
              <button
                type="button"
                className="dl-ai-btn"
                onClick={() => {
                  setShowSettings(false);
                  setSettingsSuccess(null);
                  setSettingsError(null);
                }}
              >
                Back to Chat
              </button>
              <button
                type="submit"
                className="dl-ai-btn dl-ai-btn-primary"
                disabled={settingsSaving}
              >
                {settingsSaving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      ) : showHistory ? (
        <div className="dl-ai-history">
          <p className="dl-ai-section-label">All chats</p>
          {chats.length === 0 ? (
            <p className="dl-ai-empty-copy">No chats yet.</p>
          ) : (
            <ul className="dl-ai-history-list">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => void openChat(chat.id)}
                    className={`dl-ai-history-item ${activeChatId === chat.id ? 'is-active' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="dl-ai-history-title">{chat.title}</p>
                      <p className="dl-ai-history-meta">{formatChatTime(chat.updatedAt)}</p>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      className="dl-ai-history-archive"
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
        <div ref={listRef} className="dl-ai-thread">
          {!activeChatId || (proposals.length === 0 && !busy) ? (
            <div className="dl-ai-empty">
              <p className="dl-ai-empty-title">
                {activeChat ? activeChat.title : 'Start writing with AI'}
              </p>
              <p className="dl-ai-empty-copy">
                Ask a question, edit existing text, or draft new sections. Auto chooses the right
                mode from your prompt.
              </p>
            </div>
          ) : null}

          {proposals.map((p) => (
            <div key={p.id} className="dl-ai-turn">
              <div className="dl-ai-bubble dl-ai-bubble-user">
                <span className="dl-ai-mode-tag">{p.mode}</span>
                <p>{p.promptSummary}</p>
              </div>

              <div className="dl-ai-bubble dl-ai-bubble-assistant">
                <div className="dl-ai-bubble-meta">
                  Assistant
                  <span className="dl-ai-status-tag" data-status={p.status}>
                    {p.status}
                    {p.mode !== 'ask' && Array.isArray(p.ops) && p.ops.length
                      ? ` · ${p.ops.length} op(s)`
                      : ''}
                  </span>
                </div>
                {p.answer && !officeRevision(p.ops[0]) ? (
                  <p className="dl-ai-bubble-body">{p.answer}</p>
                ) : null}
                {!p.answer && (p.mode === 'ask' || p.mode === 'auto') ? (
                  <p className="dl-ai-empty-copy">(empty reply)</p>
                ) : null}

                {officeRevision(p.ops[0]) && p.status === 'pending' ? (
                  <p className="dl-ai-bubble-body">
                    {inlineId === p.id
                      ? 'Preview highlighted in the document. Choose ✓ to keep it or ✕ to discard it.'
                      : appliedIds.current.has(p.id)
                        ? 'Text inserted. Retry saving to finish verification.'
                        : 'Place the cursor (Write) or select the original text (Edit), then preview in the document.'}
                  </p>
                ) : null}

                {p.citedSourceIds?.length ? (
                  <div className="dl-ai-citations">
                    {p.citedSourceIds.map((id) => {
                      const title = sources.find((s) => s.id === id)?.title ?? id.slice(0, 8);
                      return (
                        <span key={id} className="dl-ai-citation">
                          {title}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                {p.status === 'pending' && p.mode === 'auto' ? (
                  <div className="dl-ai-actions">
                    <button
                      type="button"
                      className="dl-ai-btn dl-ai-btn-primary"
                      disabled={busy}
                      onClick={() => void resolveClarification(p, 'edit')}
                    >
                      Edit existing
                    </button>
                    <button
                      type="button"
                      className="dl-ai-btn dl-ai-btn-primary"
                      disabled={busy}
                      onClick={() => void resolveClarification(p, 'write')}
                    >
                      Write new
                    </button>
                    <button
                      type="button"
                      className="dl-ai-btn"
                      disabled={busy}
                      onClick={() => void reject(p.id)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}

                {p.status === 'pending' &&
                p.mode !== 'ask' &&
                p.mode !== 'auto' &&
                p.mode !== 'review' &&
                p.ops.length > 0 ? (
                  <div className="dl-ai-actions">
                    <button
                      type="button"
                      className="dl-ai-btn dl-ai-btn-primary"
                      disabled={busy}
                      onClick={() =>
                        void (officeRevision(p.ops[0]) &&
                        inlineId !== p.id &&
                        !appliedIds.current.has(p.id)
                          ? previewProposal(p)
                          : accept(p.id))
                      }
                    >
                      {officeRevision(p.ops[0])
                        ? appliedIds.current.has(p.id)
                          ? 'Retry saving'
                          : inlineId === p.id
                            ? 'Accept preview'
                            : 'Preview in document'
                        : 'Apply to document'}
                    </button>
                    <button type="button" className="dl-ai-btn" onClick={() => void reject(p.id)}>
                      Discard
                    </button>
                  </div>
                ) : null}

                {p.status === 'accepted' && p.mode !== 'ask' && p.mode !== 'auto' ? (
                  <p className="dl-ai-applied">Applied to document</p>
                ) : null}
              </div>
            </div>
          ))}

          {busy ? (
            <div className="dl-ai-typing">
              <span className="dl-ai-spinner" />
              <span>
                {accepting.current
                  ? 'Updating document…'
                  : mode === 'write' || mode === 'auto'
                    ? 'Preparing proposal…'
                    : 'Thinking…'}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {!showHistory && !showSettings ? (
        <div className="dl-ai-composer-wrap">
          {inlineId ? (
            <p className="dl-ai-empty-copy">
              Accept or discard the highlighted preview before sending another prompt.
            </p>
          ) : null}
          {error ? (
            <div className="dl-ai-error-wrap">
              <p className="dl-ai-error">{error}</p>
              {error.toLowerCase().includes('gemini') || error.toLowerCase().includes('key') ? (
                <button
                  type="button"
                  className="dl-ai-error-action"
                  onClick={() => {
                    setShowSettings(true);
                    setShowHistory(false);
                  }}
                >
                  Configure Key
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="dl-ai-composer">
            <textarea
              className="dl-ai-composer-input"
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void run();
                }
              }}
              placeholder="Ask, edit, or write… Auto picks the mode"
            />
            <div className="dl-ai-composer-bar">
              <div className="dl-ai-composer-pills">
                <ComposerPill
                  label={activeMode.label}
                  title={activeMode.hint}
                  prefix={<span className="dl-ai-pill-prefix">∞</span>}
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
                      <span className="dl-ai-menu-label">{m.label}</span>
                      <span className="dl-ai-menu-hint">{m.hint}</span>
                    </button>
                  ))}
                </ComposerPill>
                <ComposerPill
                  label={settings ? `${settings.provider}/${settings.model}` : 'Model'}
                  title="Model"
                  open={menuOpen === 'model'}
                  onOpenChange={(open) => settings && setMenuOpen(open ? 'model' : null)}
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
              <div className="dl-ai-composer-tools">
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
                {busy && accepting.current ? (
                  <span role="status" aria-label="Updating document" className="dl-ai-spinner" />
                ) : busy ? (
                  <button
                    type="button"
                    className="dl-ai-send is-stop"
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
                          : 'Generate proposal'
                    }
                    disabled={!instruction.trim() || !!inlineId}
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
