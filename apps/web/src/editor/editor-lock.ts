/** Only releases our exact lock; the API still verifies session and current lock ownership. */
export function releaseEditorLock(wopiUrl: URL, lock: string) {
  const url = new URL(wopiUrl);
  url.pathname += '/release';
  const body = new URLSearchParams({ lock });
  try {
    if (navigator.sendBeacon(url.toString(), body)) return;
  } catch {
    // A denied/unsupported beacon can still use fetch's page-exit keepalive budget.
  }
  void fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {});
}

export class EditorLockConflictError extends Error {}
