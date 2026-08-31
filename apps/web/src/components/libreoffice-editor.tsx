'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type {
  DocumentLocation,
  EditorAdapter,
  EditorCommand,
  EditorSaveState,
  EditorSelection,
} from '@/editor/adapter';

interface OfficeSession {
  actionUrl: string;
  wopiSource: string;
  accessToken: string;
  accessTokenTtl: number;
  permission: 'read' | 'write';
}

type PendingRequest = { resolve: (value: EditorSelection) => void; reject: (error: Error) => void };

class LibreOfficeEditorAdapter implements EditorAdapter {
  private state: EditorSaveState = 'loading';
  private readonly listeners = new Set<(state: EditorSaveState) => void>();
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly officeOrigin: string,
  ) {}

  openDocument() { return Promise.resolve(); }
  async focus() { this.send('Action_Focus'); }
  async save() { this.setState('saving'); this.send('Action_Save'); }
  getSaveState() { return this.state; }
  async getSelection() { return this.requestSelection(); }
  async getSelectedText() { return (await this.getSelection()).text; }
  async replaceSelection(handle: string, text: string) {
    this.send('Delayance_ReplaceSelection', { handle, text });
  }
  async insertText(handle: string, text: string) {
    this.send('Delayance_InsertText', { handle, text });
  }
  async navigateTo(location: DocumentLocation) {
    this.send('Delayance_NavigateTo', { location });
  }
  async executeCommand(command: EditorCommand) {
    if (command.type === 'save') return this.save();
    if (command.type === 'undo') return void this.send('Send_UNO_Command', { Command: '.uno:Undo' });
    if (command.type === 'redo') return void this.send('Send_UNO_Command', { Command: '.uno:Redo' });
    if (command.type === 'find') return void this.send('Send_UNO_Command', { Command: '.uno:SearchDialog' });
    this.send('Send_UNO_Command', { Command: command.command, Args: command.args ?? {} });
  }
  subscribe(listener: (state: EditorSaveState) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  dispose() { for (const pending of this.pending.values()) pending.reject(new Error('Editor disposed')); this.pending.clear(); this.listeners.clear(); }

  ready() { this.send('Host_PostmessageReady'); }
  handleMessage(event: MessageEvent) {
    if (event.origin !== this.officeOrigin || event.source !== this.frame.contentWindow) return;
    const message = typeof event.data === 'string' ? this.parse(event.data) : event.data;
    if (!message || typeof message !== 'object') return;
    const row = message as { MessageId?: string; Values?: Record<string, unknown> };
    if (row.MessageId === 'App_LoadingStatus') {
      const status = String(row.Values?.Status ?? '');
      if (status === 'Document_Loaded') this.setState('saved');
    }
    if (row.MessageId === 'Document_ModifiedStatus') this.setState(row.Values?.Modified ? 'dirty' : 'saved');
    if (row.MessageId === 'Action_Save_Resp') this.setState(row.Values?.success === false ? 'error' : 'saved');
    if (row.MessageId === 'Delayance_Selection') {
      const id = String(row.Values?.requestId ?? '');
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      pending.resolve({
        text: String(row.Values?.text ?? ''),
        isCollapsed: Boolean(row.Values?.isCollapsed),
        handle: String(row.Values?.handle ?? ''),
      });
    }
  }

  private requestSelection(): Promise<EditorSelection> {
    const requestId = crypto.randomUUID();
    this.send('Delayance_GetSelection', { requestId });
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('The installed Collabora bridge does not provide selection access yet.'));
      }, 3_000);
      this.pending.set(requestId, {
        resolve: (value) => { window.clearTimeout(timeout); resolve(value); },
        reject: (error) => { window.clearTimeout(timeout); reject(error); },
      });
    });
  }

  private send(MessageId: string, Values?: Record<string, unknown>) {
    this.frame.contentWindow?.postMessage(JSON.stringify({ MessageId, ...(Values ? { Values } : {}) }), this.officeOrigin);
  }
  private setState(state: EditorSaveState) { this.state = state; this.listeners.forEach((listener) => listener(state)); }
  private parse(value: string) { try { return JSON.parse(value); } catch { return null; } }
}

export function LibreOfficeEditor({
  projectId,
  documentId,
  onAdapter,
  onSaveState,
}: {
  projectId: string;
  documentId: string;
  onAdapter: (adapter: EditorAdapter | null) => void;
  onSaveState?: (state: EditorSaveState) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const adapterRef = useRef<LibreOfficeEditorAdapter | null>(null);
  const [session, setSession] = useState<OfficeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frameName = useMemo(() => `collabora-${documentId}`, [documentId]);

  useEffect(() => {
    let active = true;
    setSession(null);
    void apiFetch<OfficeSession>(`/projects/${projectId}/documents/${documentId}/office/session`, { method: 'POST', body: '{}' })
      .then((value) => active && setSession(value))
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Unable to open LibreOffice'));
    return () => { active = false; };
  }, [projectId, documentId]);

  useEffect(() => {
    if (!session || !frame.current) return;
    const origin = new URL(session.actionUrl).origin;
    const adapter = new LibreOfficeEditorAdapter(frame.current, origin);
    adapterRef.current = adapter;
    const handler = (event: MessageEvent) => adapter.handleMessage(event);
    window.addEventListener('message', handler);
    const unsubscribe = onSaveState ? adapter.subscribe(onSaveState) : undefined;
    onAdapter(adapter);
    form.current?.submit();
    return () => {
      window.removeEventListener('message', handler);
      unsubscribe?.();
      adapter.dispose();
      if (adapterRef.current === adapter) adapterRef.current = null;
      onAdapter(null);
    };
  }, [session, onAdapter, onSaveState]);

  const onLoad = useCallback(() => {
    // The ready message is intentionally sent only after the form target exists.
    // Collabora ignores host commands until this handshake arrives.
    adapterRef.current?.ready();
  }, []);

  if (error) return <div className="flex flex-1 items-center justify-center text-red-600">{error}</div>;
  if (!session) return <div className="flex flex-1 items-center justify-center text-[var(--dl-muted)]">Opening LibreOffice Writer…</div>;

  return (
    <div className="relative flex min-h-0 flex-1 bg-[var(--dl-bg)]">
      <form ref={form} action={session.actionUrl} method="post" target={frameName} className="hidden">
        <input name="access_token" value={session.accessToken} readOnly />
        <input name="access_token_ttl" value={String(session.accessTokenTtl)} readOnly />
        <input name="WOPISrc" value={session.wopiSource} readOnly />
      </form>
      <iframe
        ref={frame}
        name={frameName}
        title="LibreOffice Writer"
        className="h-full min-h-0 w-full border-0"
        allow="clipboard-read; clipboard-write; fullscreen"
        onLoad={onLoad}
      />
      {session.permission === 'read' ? <span className="absolute right-3 top-3 rounded bg-[var(--dl-panel)] px-2 py-1 text-xs">Read only</span> : null}
    </div>
  );
}
