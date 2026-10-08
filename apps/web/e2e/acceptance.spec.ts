import { test, expect, request } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';

test.describe('Keycloak authentication boundary', () => {
  test('returns 401 for a missing token so the browser can refresh its session', async () => {
    const api = await request.newContext({ baseURL: API });
    try {
      for (const path of ['/auth/me', '/projects']) {
        const response = await api.get(path);
        expect(response.status()).toBe(401);
      }
    } finally {
      await api.dispose();
    }
  });
  test('rejects credential submissions from an untrusted origin', async () => {
    const api = await request.newContext({ baseURL: API });
    const response = await api.post('/auth/login', {
      headers: { Origin: 'http://untrusted.test' },
      data: { email: 'writer@example.test', password: 'Example-1234!' },
    });
    expect(response.status()).toBe(403);
    await api.dispose();
  });
});
