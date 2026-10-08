const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:48722';
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
export function getAccessToken() {
  return accessToken;
}
export function setTokens(token: string) {
  accessToken = token;
}
export function clearTokens() {
  accessToken = null;
}
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const run = async () => {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      accessToken = null;
      return null;
    }
    const data = (await response.json()) as { accessToken: string };
    accessToken = data.accessToken;
    return accessToken;
  };
  const locked =
    typeof navigator !== 'undefined' && 'locks' in navigator
      ? navigator.locks.request('delayance-auth-refresh', () => run()).then((value) => value)
      : run();
  refreshPromise = locked.finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const options = { ...init, headers, credentials: 'include' as RequestCredentials };
  let res = await fetch(`${API_URL}${path}`, options);
  if (res.status === 401 && path !== '/auth/refresh') {
    const token = await refreshAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      res = await fetch(`${API_URL}${path}`, options);
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { message?: string }).message ?? `Request failed (${res.status})`);
  return data as T;
}
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let response = await fetch(`${API_URL}${path}`, { headers, credentials: 'include' });
  if (response.status === 401) {
    const token = await refreshAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      response = await fetch(`${API_URL}${path}`, { headers, credentials: 'include' });
    }
  }
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? 'document.docx';
  return { blob: await response.blob(), filename };
}
export async function apiFetchSse(
  path: string,
  init: RequestInit,
  onEvent: (event: unknown) => void,
): Promise<void> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'text/event-stream');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (res.status === 401) {
    const token = await refreshAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
    }
  }
  if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.split('\n').find((v) => v.trim().startsWith('data:'));
      const payload = line?.trim().slice(5).trim();
      if (payload && payload !== '[DONE]') {
        try {
          onEvent(JSON.parse(payload));
        } catch {
          /* ignore malformed event */
        }
      }
    }
  }
}
export async function updateProfileApi(data: { name?: string; email?: string }) {
  return apiFetch<{ id: string; email: string; name: string }>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({ name: data.name }),
  });
}
export function changePasswordApi(...args: unknown[]) {
  void args;
  return Promise.reject(new Error('Password management is handled by Keycloak'));
}
export function getSessionsApi(...args: unknown[]) {
  void args;
  return Promise.reject(new Error('Session management is handled by Keycloak'));
}
export function revokeSessionApi(...args: unknown[]) {
  void args;
  return Promise.reject(new Error('Session management is handled by Keycloak'));
}
export function revokeAllSessionsApi(...args: unknown[]) {
  void args;
  return Promise.reject(new Error('Session management is handled by Keycloak'));
}
export async function logoutApi() {
  try {
    const result = (await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).then((r) => r.json())) as { logoutUrl?: string };
    accessToken = null;
    if (result.logoutUrl && typeof window !== 'undefined') window.location.assign(result.logoutUrl);
  } catch {
    accessToken = null;
  }
}
export { API_URL };
