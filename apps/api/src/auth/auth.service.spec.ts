import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { AuthService } from './auth.service';
import { hashPassword, verifyPassword } from './password';
import { sessions, users } from '../database/schema';
import type { DatabaseService } from '../database/database.service';
import type { AppConfigService } from '../config/app-config.service';
import type { RedisService } from '../redis/redis.service';

vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));
const userId = '00000000-0000-4000-8000-000000000001';
const env = { AUTH_JWT_SECRET: 'a'.repeat(64), WEB_ORIGIN: 'http://web', NODE_ENV: 'test' };
type User = { id: string; email: string; name: string; passwordHash: string | null };
type Session = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};
function setup(initialUser: User | null = null, redisClient: object = {}, extraEnv: object = {}) {
  let user = initialUser;
  let session: Session | null = null;
  const userFind = vi.fn().mockImplementation(async () => user);
  const sessionFind = vi.fn().mockImplementation(async () => session && { ...session });
  const insert = vi.fn().mockImplementation((table: unknown) => ({
    values: (value: Partial<User & Session>) => {
      if (table === users) {
        const result = {
          onConflictDoNothing: () => result,
          returning: async () => {
            if (user) return [];
            user = {
              id: userId,
              email: value.email!,
              name: value.name!,
              passwordHash: value.passwordHash ?? null,
            };
            return [user];
          },
        };
        return result;
      }
      if (table === sessions)
        session = {
          id: value.id!,
          userId: value.userId!,
          refreshTokenHash: value.refreshTokenHash!,
          expiresAt: value.expiresAt!,
          revokedAt: null,
        };
      return Promise.resolve();
    },
  }));
  const update = vi.fn().mockImplementation((table: unknown) => ({
    set: (value: Partial<User & Session>) => ({
      where: () => {
        if (table === users && user) user = { ...user, ...value };
        if (table === sessions && session) session = { ...session, ...value };
        return {
          returning: async () =>
            table === users ? (user ? [user] : []) : session ? [session] : [],
          then: (resolve: (value: unknown) => void) => resolve(undefined),
        };
      },
    }),
  }));
  const db = {
    query: { users: { findFirst: userFind }, sessions: { findFirst: sessionFind } },
    insert,
    update,
    transaction: async (run: (value: unknown) => Promise<unknown>) => run(db),
  };
  const auth = new AuthService(
    { db } as unknown as DatabaseService,
    { env: { ...env, ...extraEnv } } as unknown as AppConfigService,
    { client: redisClient } as unknown as RedisService,
  );
  return { auth, insert, update, userFind, sessionFind, user: () => user, session: () => session };
}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected external auth request')));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Local email/password authentication', () => {
  it('keeps the account after the fixed 24-hour session expires and does not extend expiry on refresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = new Date('2026-10-14T00:00:00Z');
    vi.setSystemTime(start);
    const { auth, session } = setup();
    const input = {
      email: 'writer@example.test',
      firstName: 'Test',
      lastName: 'Writer',
      password: 'Example-password!',
    };
    const first = await auth.register(input);
    expect(first.refreshExpiresIn).toBe(86400);
    expect(session()?.expiresAt.getTime()).toBe(start.getTime() + 86400000);
    vi.setSystemTime(new Date(start.getTime() + 86340000));
    const refreshed = await auth.refresh(first.refreshToken);
    expect(refreshed.refreshExpiresIn).toBe(60);
    expect(session()?.expiresAt.getTime()).toBe(start.getTime() + 86400000);
    vi.setSystemTime(new Date(start.getTime() + 86400000));
    await expect(auth.refresh(refreshed.refreshToken)).rejects.toThrow('Invalid refresh session');
    await expect(auth.authenticateAccessToken(refreshed.accessToken)).rejects.toThrow('expired');
    const signedInAgain = await auth.login(input);
    expect(signedInAgain.user.id).toBe(first.user.id);
    expect(signedInAgain.refreshExpiresIn).toBe(86400);
  });
  it('salts passwords and rejects wrong passwords and malformed legacy hashes', async () => {
    const one = await hashPassword('Example-password!');
    const two = await hashPassword('Example-password!');
    expect(one).not.toBe(two);
    expect(one).not.toContain('Example-password!');
    expect(await verifyPassword('Example-password!', one)).toBe(true);
    expect(await verifyPassword('wrong', one)).toBe(false);
    expect(await verifyPassword('wrong', null)).toBe(false);
    expect(await verifyPassword('wrong', 'scrypt$invalid$hash')).toBe(false);
  });
  it('registers locally, keeps secrets out of the user contract, and creates revocable access tokens', async () => {
    const { auth, user, session } = setup();
    const result = await auth.register({
      email: 'Writer@Example.test',
      firstName: 'Test',
      lastName: 'Writer',
      password: 'Example-password!',
    });
    expect(result.user).toEqual({ id: userId, email: 'writer@example.test', name: 'Test Writer' });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(user()?.passwordHash).toMatch(/^scrypt\$/);
    expect(session()?.refreshTokenHash).not.toContain(result.refreshToken);
    expect(await auth.authenticateAccessToken(result.accessToken)).toMatchObject({ userId });
    await auth.logout(result.refreshToken);
    await expect(auth.authenticateAccessToken(result.accessToken)).rejects.toThrow('revoked');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rotates refresh tokens, refuses replay and rejects expired sessions', async () => {
    const { auth, update } = setup();
    const first = await auth.register({
      email: 'writer@example.test',
      firstName: 'Test',
      lastName: 'Writer',
      password: 'Example-password!',
    });
    const second = await auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow('Invalid refresh session');
    await expect(auth.refresh('not-a-token')).rejects.toThrow('Invalid refresh session');
    expect(update).toHaveBeenCalled();
  });
  it('keeps existing password-less accounts protected instead of allowing signup to claim them', async () => {
    const { auth, insert } = setup({
      id: userId,
      email: 'writer@example.test',
      name: 'Existing Writer',
      passwordHash: null,
    });
    await expect(auth.login({ email: 'writer@example.test', password: 'wrong' })).rejects.toThrow(
      'Invalid email or password',
    );
    await expect(
      auth.register({
        email: 'writer@example.test',
        firstName: 'Other',
        lastName: 'Writer',
        password: 'Example-password!',
      }),
    ).rejects.toThrow('already exists');
    expect(insert).not.toHaveBeenCalled();
  });
  it('rejects malformed, tampered, and other-issuer access tokens', async () => {
    const { auth, sessionFind } = setup();
    await expect(auth.authenticateAccessToken('not-a-token')).rejects.toThrow(
      'Invalid access token',
    );
    expect(sessionFind).not.toHaveBeenCalled();
    const result = await auth.register({
      email: 'writer@example.test',
      firstName: 'Test',
      lastName: 'Writer',
      password: 'Example-password!',
    });
    const [header, payload, signature] = result.accessToken.split('.');
    const changed = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString()),
        sub: '00000000-0000-4000-8000-000000000002',
      }),
    ).toString('base64url');
    await expect(auth.authenticateAccessToken(`${header}.${changed}.${signature}`)).rejects.toThrow(
      'Invalid access token',
    );
  });
  it('consumes recovery tokens once, updates the local password, and revokes prior sessions', async () => {
    const getdel = vi.fn().mockResolvedValueOnce(userId).mockResolvedValueOnce(null);
    const { auth, user } = setup(null, { getdel });
    const original = await auth.register({
      email: 'writer@example.test',
      firstName: 'Test',
      lastName: 'Writer',
      password: 'Old-password!',
    });
    await auth.resetPassword({ token: 'a'.repeat(43), password: 'New-password!' });
    expect(await verifyPassword('New-password!', user()?.passwordHash ?? null)).toBe(true);
    await expect(auth.authenticateAccessToken(original.accessToken)).rejects.toThrow('revoked');
    await expect(
      auth.resetPassword({ token: 'a'.repeat(43), password: 'Other-password!' }),
    ).rejects.toThrow('Invalid or expired reset link');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('stores only recovery token hashes and sends a single-use SMTP fragment link', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const sendMail = vi.fn().mockResolvedValue({});
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
    const { auth } = setup(
      { id: userId, email: 'writer@example.test', name: 'Writer', passwordHash: null },
      { set },
      {
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: 587,
        SMTP_FROM: 'support@example.test',
        SMTP_SECURE: false,
      },
    );
    await auth.forgotPassword('writer@example.test');
    const message = sendMail.mock.calls[0]?.[0] as { text: string };
    const token = message.text.split('#token=')[1]!;
    expect(set.mock.calls[0]?.[0]).toBe(
      `local-password-reset:${createHash('sha256').update(token).digest('hex')}`,
    );
    expect(set.mock.calls[0]?.[1]).toBe(userId);
  });
  it('does not leak account existence when recovery delivery or lookup fails', async () => {
    const { auth, userFind } = setup();
    await expect(auth.forgotPassword('unknown@example.test')).resolves.toBeUndefined();
    userFind.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(auth.forgotPassword('unknown@example.test')).resolves.toBeUndefined();
  });
});
