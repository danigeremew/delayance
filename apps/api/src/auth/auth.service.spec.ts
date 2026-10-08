import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import nodemailer from 'nodemailer';

vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));

const env = {
  KEYCLOAK_ISSUER_URL: 'http://issuer/realms/delayance',
  KEYCLOAK_BASE_URL: 'http://issuer',
  KEYCLOAK_REALM: 'delayance',
  KEYCLOAK_CLIENT_ID: 'delayance-api',
  KEYCLOAK_CLIENT_SECRET: 'secret',
  KEYCLOAK_PROVISIONER_CLIENT_ID: 'provisioner',
  KEYCLOAK_PROVISIONER_CLIENT_SECRET: 'provisioner-secret',
  WEB_ORIGIN: 'http://web',
};
function service(redisClient: object = {}, extraEnv: object = {}) {
  return new AuthService(
    {} as never,
    { env: { ...env, ...extraEnv } } as never,
    { client: redisClient } as never,
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('AuthService', () => {
  it('rejects malformed access tokens before contacting the database', async () => {
    await expect(service().authenticateAccessToken('not-a-jwt')).rejects.toThrow(
      'Malformed access token',
    );
  });
  it('maps bad credentials to a generic unauthorized response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }));
    await expect(service().login({ email: 'a@example.com', password: 'wrong' })).rejects.toThrow(
      'Invalid email or password',
    );
  });
  it('reports a provider outage without leaking credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(service().login({ email: 'a@example.com', password: 'secret' })).rejects.toThrow(
      'Identity provider unavailable',
    );
  });
  it('consumes a reset token only once and sends a credential update to Keycloak', async () => {
    const getdel = vi.fn().mockResolvedValueOnce('user-id').mockResolvedValueOnce(null);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'admin-token' }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'admin-token' }) });
    vi.stubGlobal('fetch', fetch);
    const auth = service({ getdel });
    await auth.resetPassword({ token: 'a'.repeat(43), password: 'new-password' });
    expect(fetch.mock.calls[1]?.[0]).toBe(
      'http://issuer/admin/realms/delayance/users/user-id/reset-password',
    );
    await expect(
      auth.resetPassword({ token: 'a'.repeat(43), password: 'new-password' }),
    ).rejects.toThrow('Invalid or expired reset link');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('does not provision a local session when the database write fails', async () => {
    const returning = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const values = vi.fn().mockReturnValue({ returning });
    const database = {
      db: {
        query: { users: { findFirst: vi.fn().mockResolvedValue(null) } },
        insert: vi.fn().mockReturnValue({ values }),
      },
    };
    const auth = new AuthService(database as never, { env } as never, { client: {} } as never);
    await expect(
      auth['provision']({
        sub: 'keycloak-subject',
        email: 'writer@example.test',
        iss: env.KEYCLOAK_ISSUER_URL,
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    ).rejects.toThrow('database unavailable');
    expect(returning).toHaveBeenCalledOnce();
  });
  it('stores only a reset-token hash and sends a fragment link through configured SMTP', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const sendMail = vi.fn().mockResolvedValue({});
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'admin-token' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 'subject-1', email: 'writer@example.test' }],
        }),
    );
    await service(
      { set },
      {
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: 587,
        SMTP_FROM: 'support@example.test',
        SMTP_SECURE: false,
      },
    ).forgotPassword('writer@example.test');
    expect(set).toHaveBeenCalledOnce();
    expect(set.mock.calls[0]?.[0]).toMatch(/^password-reset:[a-f0-9]{64}$/);
    expect(set.mock.calls[0]?.[1]).toBe('subject-1');
    const message = sendMail.mock.calls[0]?.[0] as { text: string };
    expect(message.text).toContain('http://web/reset-password#token=');
    expect(set.mock.calls[0]?.[0]).not.toContain(message.text.split('#token=')[1]);
  });
  it('reports incomplete provider logout after a revocation outage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(service().logout('refresh-token')).resolves.toEqual({
      providerLogoutComplete: false,
    });
  });
  it('gives the same recovery response when no user exists or Keycloak is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(service().forgotPassword('unknown@example.com')).resolves.toBeUndefined();
  });
});
