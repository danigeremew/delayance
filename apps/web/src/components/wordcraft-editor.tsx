'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  officeBrowserSessionSchema,
  wordcraftFileSchema,
  wordcraftWopiInfoSchema,
  wordcraftSaveSchema,
  wordcraftStatusSchema,
  wordcraftHostLayoutSchema,
  wordcraftLayoutSchema,
} from '@delayance/validation';
import { apiFetch } from '@/lib/api';
import { EditorLockConflictError, releaseEditorLock } from '@/editor/editor-lock';
import { WordcraftEditorAdapter } from '@/editor/wordcraft-adapter';
import { editorRegions, type WordcraftLayout } from '@/editor/workspace-layout';
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
  leftWidth,
  rightWidth,
  onLayout,
  onError,
  onLockConflict,
}: {
  leftWidth: number;
  rightWidth: number;
  onLayout: (layout: WordcraftLayout | null) => void;
  onError: (error: string | null) => void;
  onLockConflict: (conflicted: boolean) => void;
  projectId: string;
  documentId: string;
  onAdapter: (adapter: EditorAdapter | null) => void;
  onSaveState: (state: EditorSaveState) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const documentLoaded = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const clipId = useId().replace(/:/g, '');
  const [layout, setLayout] = useState<WordcraftLayout | null>(null);
  const sendLayout = useCallback(() => {
    if (!session || !frame.current) return;
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const parsed = wordcraftHostLayoutSchema.safeParse({
      left: leftWidth,
      right: rightWidth,
      theme: {
        background: color('--dl-bg'),
        panel: color('--dl-panel'),
        text: color('--dl-fg'),
        muted: color('--dl-muted'),
        border: color('--dl-border'),
        accent: color('--dl-accent'),
      },
    });
    if (parsed.success)
      frame.current.contentWindow?.postMessage(
        JSON.stringify({ MessageId: 'Delayance_HostLayout', Values: parsed.data }),
        new URL(session.actionUrl).origin,
      );
  }, [session, leftWidth, rightWidth]);
  const sendLayoutRef = useRef(sendLayout);
  sendLayoutRef.current = sendLayout;
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    sendLayout();
    const observer = new ResizeObserver(sendLayout);
    if (container.current) observer.observe(container.current);
    const themeObserver = new MutationObserver(sendLayout);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, [sendLayout]);

  useEffect(() => {
    let active = true;
    setError(null);
    setLoaded(false);
    documentLoaded.current = false;
    onError(null);
    onLockConflict(false);
    setLayout(null);
    onLayout(null);
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
  }, [projectId, documentId, onSaveState, onLayout, onError, onLockConflict]);

  useEffect(() => {
    if (!session || !frame.current) return;
    let active = true;
    let loading = false;
    let saving = false;
    let version = '';
    let hasLock = false;
    let suspended = false;
    let writable = session.permission === 'write';
    const abort = new AbortController();
    const lock = crypto.randomUUID();
    const origin = new URL(session.actionUrl).origin;
    const wopiUrl = new URL(session.wopiSource);
    wopiUrl.searchParams.set('access_token', session.accessToken);
    const contentsUrl = new URL(wopiUrl);
    contentsUrl.pathname += '/contents';
    const report = (cause: unknown) => {
      if (!active || suspended) return;
      const message = cause instanceof Error ? cause.message : 'Wordcraft failed.';
      setError(message);
      if (documentLoaded.current) onError(message);
      onSaveState('error');
    };
    const fetchWopi = async (url: URL, init: RequestInit = {}) => {
      const response = await fetch(url, { ...init, signal: init.signal ?? abort.signal });
      if (response.status === 409) {
        if (new Headers(init.headers).has('X-WOPI-Override'))
          throw new EditorLockConflictError(
            'Another editor currently holds this document’s editing lock. Close that editor and reopen this document.',
          );
        throw new Error('The saved document changed. Reopen this document before saving.');
      }
      if (!response.ok)
        throw new Error(
          `Wordcraft could not access the document (${response.status}). Reopen it to refresh the session.`,
        );
      return response;
    };
    const releaseLock = () => {
      if (!hasLock) return;
      hasLock = false;
      releaseEditorLock(wopiUrl, lock);
    };
    const lockFile = async (operation: 'LOCK' | 'REFRESH_LOCK') => {
      await fetchWopi(wopiUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'X-WOPI-Override': operation, 'X-WOPI-Lock': lock },
      });
      hasLock = true;
      if (!active || suspended) {
        releaseLock();
        throw new Error('Editor closed.');
      }
    };
    const adapter = new WordcraftEditorAdapter(frame.current, origin, session.accessToken, () => {
      if (active) {
        documentLoaded.current = true;
        setLoaded(true);
      }
    });
    const unsubscribe = adapter.subscribe(onSaveState);
    onAdapter(adapter);
    const post = (MessageId: string, Values: Record<string, unknown>) =>
      frame.current?.contentWindow?.postMessage(JSON.stringify({ MessageId, Values }), origin);
    const load = async () => {
      if (loading) return;
      loading = true;
      if (writable) {
        try {
          await lockFile('LOCK');
        } catch (cause) {
          if (!(cause instanceof EditorLockConflictError)) throw cause;
          writable = false;
          if (active) onLockConflict(true);
        }
      }
      const response = await fetchWopi(wopiUrl);
      const info = wordcraftWopiInfoSchema.parse(await response.json());
      version = info.Version;
      const file = await fetchWopi(contentsUrl);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error('Invalid DOCX size.');
      if (active)
        frame.current?.contentWindow?.postMessage(
          { MessageId: 'Delayance_LoadDocument', bytes, writable },
          origin,
        );
    };
    const save = async (id: number, bytes: Uint8Array) => {
      if (saving || !writable || suspended) {
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
          onError(null);
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
      const geometry = wordcraftLayoutSchema.safeParse(data);
      if (geometry.success) {
        setLayout(geometry.data.Values);
        onLayout(geometry.data.Values);
      }
      const status = wordcraftStatusSchema.safeParse(data);
      if (status.success && status.data.Values.Status === 'Frame_Ready') {
        if (status.data.Values.embeddedLayout !== 1) {
          report(
            new Error(
              'Wordcraft needs rebuilding for the integrated workspace. Run pnpm wordcraft:build, then reopen the document.',
            ),
          );
          return;
        }
        sendLayoutRef.current();
        void load().catch(report);
      }
      if (data.MessageId === 'Delayance_Error')
        report(
          new Error(
            'Wordcraft could not open this document. Reopen it or download the saved DOCX.',
          ),
        );
    };
    const dismissPopups = (event: PointerEvent) => {
      if (event.target !== frame.current) post('Delayance_DismissPopups', {});
    };
    const hide = () => {
      suspended = true;
      releaseLock();
    };
    const show = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      suspended = false;
      if (!documentLoaded.current) {
        loading = false;
        setError(null);
        post('Host_PostmessageReady', {});
      } else if (writable) {
        void (async () => {
          await lockFile('LOCK');
          const info = wordcraftWopiInfoSchema.parse(await (await fetchWopi(wopiUrl)).json());
          if (info.Version !== version) {
            releaseLock();
            throw new Error(
              'The saved document changed while you were away. Reopen this document before saving.',
            );
          }
        })().catch(report);
      }
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    window.addEventListener('pointerdown', dismissPopups, true);
    window.addEventListener('message', handler);
    const refresh = window.setInterval(
      () => {
        if (hasLock && !suspended) void lockFile('REFRESH_LOCK').catch(report);
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
      window.removeEventListener('pointerdown', dismissPopups, true);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      releaseLock();
      unsubscribe();
      adapter.dispose();
      onAdapter(null);
    };
  }, [session, onAdapter, onSaveState, onLayout, onError, onLockConflict]);

  return (
    <div ref={container} className="pointer-events-none absolute inset-0 z-20">
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            {layout ? (
              editorRegions(layout).map((rect, index) => (
                <rect
                  key={index}
                  x={rect.x / layout.width}
                  y={rect.y / layout.height}
                  width={rect.width / layout.width}
                  height={rect.height / layout.height}
                />
              ))
            ) : (
              <rect width="1" height="1" />
            )}
          </clipPath>
        </defs>
      </svg>
      {error && !loaded ? (
        <div
          role="alert"
          className="pointer-events-auto absolute inset-0 z-30 border-b border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}
      {!loaded && !error ? (
        <div
          role="status"
          className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[var(--dl-bg)] text-sm text-[var(--dl-muted)]"
        >
          Loading Wordcraft…
        </div>
      ) : null}
      <iframe
        ref={frame}
        title="Wordcraft"
        className="pointer-events-auto absolute inset-0 h-full w-full border-0"
        style={{ clipPath: `url(#${clipId})`, visibility: error && !loaded ? 'hidden' : undefined }}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
