const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:48722';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken as string;
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  let token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    token = await refreshAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      res = await fetch(`${API_URL}${path}`, { ...init, headers });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** Download an authenticated file response without exposing a storage URL to the browser. */
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers();
  let token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response = await fetch(`${API_URL}${path}`, { headers });
  if (response.status === 401) {
    token = await refreshAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      response = await fetch(`${API_URL}${path}`, { headers });
    }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `Download failed (${response.status})`);
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? 'document.docx';
  return { blob: await response.blob(), filename };
}

/** Consume an SSE endpoint that emits `data: {json}\n\n` events. */
export async function apiFetchSse(
  path: string,
  init: RequestInit,
  onEvent: (event: unknown) => void,
): Promise<void> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'text/event-stream');
  let token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    token = await refreshAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      res = await fetch(`${API_URL}${path}`, { ...init, headers });
    }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { message?: string }).message ?? `Request failed (${res.status})`,
    );
  }
  if (!res.body) throw new Error('No response body for stream');

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
      const lines = part.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          onEvent(JSON.parse(payload));
        } catch {
          // ignore malformed events
        }
      }
    }
  }
}

export async function updateProfileApi(data: { name?: string; email?: string }) {
  return apiFetch<{ id: string; email: string; name: string }>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function changePasswordApi(data: { currentPassword: string; newPassword: string }) {
  return apiFetch<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getSessionsApi() {
  return apiFetch<Array<{ id: string; createdAt: string; expiresAt: string }>>('/auth/sessions');
}

export async function revokeSessionApi(sessionId: string) {
  return apiFetch<{ ok: boolean }>(`/auth/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

export async function revokeAllSessionsApi() {
  return apiFetch<{ ok: boolean }>('/auth/sessions/revoke-all', {
    method: 'POST',
  });
}

export async function logoutApi() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (refreshToken) {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // ignore network errors on logout
    }
  }
  clearTokens();
}

export { API_URL };
