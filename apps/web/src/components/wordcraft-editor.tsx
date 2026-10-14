'use client';

import { useEffect, useRef, useState } from 'react';
import {
  officeBrowserSessionSchema,
  wordcraftFileSchema,
  wordcraftWopiInfoSchema,
  wordcraftSaveSchema,
  wordcraftStatusSchema,
} from '@delayance/validation';
import { apiFetch } from '@/lib/api';
import { WordcraftEditorAdapter } from '@/editor/wordcraft-adapter';
import type { EditorAdapter, EditorSaveState } from '@/editor/adapter';

interface Session {
  actionUrl: string;
  wopiSource: string;
  accessToken: string;
  permission: 'read' | 'write';
}

export function WordcraftEditor({
  projectId,
  documentId,
  onAdapter,
  onSaveState,
}: {
  projectId: string;
  documentId: string;
  onAdapter: (adapter: EditorAdapter | null) => void;
  onSaveState: (state: EditorSaveState) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setError(null);
    setLoaded(false);
    onSaveState('loading');
    void apiFetch<unknown>(`/projects/${projectId}/documents/${documentId}/office/session`, {
      method: 'POST',
      body: JSON.stringify({ editor: 'wordcraft' }),
    })
      .then((value) => {
        if (active) setSession(officeBrowserSessionSchema.parse(value));
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not start Wordcraft.');
      });
    return () => {
      active = false;
    };
  }, [projectId, documentId, onSaveState]);

  useEffect(() => {
    if (!session || !frame.current) return;
    let active = true;
    let loading = false;
    let saving = false;
    let version = '';
    let hasLock = false;
    const abort = new AbortController();
    const lock = crypto.randomUUID();
    const origin = new URL(session.actionUrl).origin;
    const wopiUrl = new URL(session.wopiSource);
    wopiUrl.searchParams.set('access_token', session.accessToken);
    const contentsUrl = new URL(wopiUrl);
    contentsUrl.pathname += '/contents';
    const report = (cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : 'Wordcraft failed.');
      onSaveState('error');
    };
    const fetchWopi = async (url: URL, init: RequestInit = {}) => {
      const response = await fetch(url, { ...init, signal: init.signal ?? abort.signal });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Another editor has this document open, or the saved version changed. Close the other editor and reopen this document.'
            : `Wordcraft could not access the document (${response.status}). Reopen it to refresh the session.`,
        );
      return response;
    };
    const lockFile = async (operation: 'LOCK' | 'REFRESH_LOCK') => {
      await fetchWopi(wopiUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'X-WOPI-Override': operation, 'X-WOPI-Lock': lock },
      });
      hasLock = true;
      if (!active) {
        await fetch(wopiUrl, {
          method: 'POST',
          headers: { 'X-WOPI-Override': 'UNLOCK', 'X-WOPI-Lock': lock },
        });
        throw new Error('Editor closed.');
      }
    };
    const adapter = new WordcraftEditorAdapter(frame.current, origin, session.accessToken, () => {
      if (active) setLoaded(true);
    });
    const unsubscribe = adapter.subscribe(onSaveState);
    onAdapter(adapter);
    const post = (MessageId: string, Values: Record<string, unknown>) =>
      frame.current?.contentWindow?.postMessage(JSON.stringify({ MessageId, Values }), origin);
    const load = async () => {
      if (loading) return;
      loading = true;
      if (session.permission === 'write') await lockFile('LOCK');
      const response = await fetchWopi(wopiUrl);
      const info = wordcraftWopiInfoSchema.parse(await response.json());
      version = info.Version;
      const file = await fetchWopi(contentsUrl);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error('Invalid DOCX size.');
      if (active)
        frame.current?.contentWindow?.postMessage(
          { MessageId: 'Delayance_LoadDocument', bytes, writable: session.permission === 'write' },
          origin,
        );
    };
    const save = async (id: number, bytes: Uint8Array) => {
      if (saving || session.permission !== 'write') {
        post('Delayance_SaveResult', { id, success: false });
        return;
      }
      saving = true;
      onSaveState('saving');
      try {
        await lockFile('REFRESH_LOCK');
        const response = await fetchWopi(contentsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-WOPI-Lock': lock,
            'X-Delayance-File-Version': version,
          },
          body: new Uint8Array(bytes).buffer,
        });
        const result = wordcraftSaveSchema.parse(await response.json());
        const hash = new Uint8Array(
          await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer),
        );
        version = `${result.version}:${Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
        if (active) {
          setError(null);
          post('Delayance_SaveResult', { id, success: true });
        }
      } catch (cause) {
        post('Delayance_SaveResult', { id, success: false });
        report(cause);
      } finally {
        saving = false;
      }
    };
    const handler = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      adapter.handleMessage(event);
      const file = wordcraftFileSchema.safeParse(event.data);
      if (file.success) {
        void save(file.data.Values.id, file.data.Values.bytes);
        return;
      }
      let data: unknown = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (
        !data ||
        typeof data !== 'object' ||
        !('MessageId' in data) ||
        !('Values' in data) ||
        !data.Values ||
        typeof data.Values !== 'object'
      )
        return;
      const status = wordcraftStatusSchema.safeParse(data);
      if (status.success && status.data.Values.Status === 'Frame_Ready') void load().catch(report);
      if (data.MessageId === 'Delayance_Error')
        report(new Error('Wordcraft could not open this document. Try Collabora.'));
    };
    window.addEventListener('message', handler);
    const refresh = window.setInterval(
      () => {
        if (hasLock) void lockFile('REFRESH_LOCK').catch(report);
      },
      5 * 60 * 1000,
    );
    const startup = window.setTimeout(() => {
      if (adapter.getSaveState() === 'loading')
        report(
          new Error(
            'Wordcraft has not loaded. Run pnpm wordcraft:build, then reopen the document.',
          ),
        );
    }, 90000);
    // Register handlers before navigation: the WASM app announces readiness after it starts.
    const url = new URL(session.actionUrl);
    url.searchParams.set('delayance', '1');
    url.searchParams.set('webgl', '1');
    void fetch(session.actionUrl, { signal: abort.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error('Wordcraft is not built. Run pnpm wordcraft:build, then reopen it.');
        if (active && frame.current) frame.current.src = url.toString();
      })
      .catch(report);
    return () => {
      active = false;
      abort.abort();
      window.clearInterval(refresh);
      window.clearTimeout(startup);
      window.removeEventListener('message', handler);
      if (hasLock)
        void fetch(wopiUrl, {
          method: 'POST',
          keepalive: true,
          headers: { 'X-WOPI-Override': 'UNLOCK', 'X-WOPI-Lock': lock },
        }).catch(() => {});
      unsubscribe();
      adapter.dispose();
      onAdapter(null);
    };
  }, [session, onAdapter, onSaveState]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {error ? (
        <div
          role="alert"
          className="border-b border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}
      {!loaded && !error ? (
        <div
          role="status"
          className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--dl-bg)] text-sm text-[var(--dl-muted)]"
        >
          Loading Wordcraft…
        </div>
      ) : null}
      <iframe
        ref={frame}
        title="Wordcraft"
        className="min-h-0 w-full flex-1 border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
