import { expect, request, test } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';
const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:48721';

test('local registration, login, cookie rotation, tenant permissions and logout work without an identity service', async () => {
  const api = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Origin: new URL(WEB).origin },
  });
  const other = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Origin: new URL(WEB).origin },
  });
  const email = `local-auth-${crypto.randomUUID()}@example.test`;
  const password = 'Synthetic-local-auth-1234!';
  let projectId: string | undefined;
  let ownerToken: string | undefined;
  try {
    const registered = await api.post('/auth/register', {
      data: { email, firstName: 'Local', lastName: 'Writer', password, confirmPassword: password },
    });
    expect(registered.status()).toBe(201);
    const identity = (await registered.json()) as {
      accessToken: string;
      user: { id: string; email: string };
    };
    expect(identity.user.email).toBe(email);
    expect('passwordHash' in identity.user).toBe(false);
    expect(registered.headers()['set-cookie']?.toLowerCase()).toContain('httponly');
    expect(registered.headers()['set-cookie']?.toLowerCase()).toContain('max-age=86400');
    expect(registered.headers()['set-cookie']?.toLowerCase()).toContain('samesite=lax');
    const duplicate = await api.post('/auth/register', {
      data: {
        email: email.toUpperCase(),
        firstName: 'Other',
        lastName: 'Writer',
        password,
        confirmPassword: password,
      },
    });
    expect(duplicate.status()).toBe(409);
    const denied = await api.post('/auth/login', { data: { email, password: 'Wrong-password!' } });
    expect(denied.status()).toBe(401);
    const loggedIn = await api.post('/auth/login', {
      data: { email: email.toUpperCase(), password },
    });
    expect(loggedIn.status()).toBe(201);
    const login = (await loggedIn.json()) as { accessToken: string; user: { id: string } };
    ownerToken = login.accessToken;
    expect(login.user.id).toBe(identity.user.id);
    const me = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${login.accessToken}` },
    });
    expect(me.status()).toBe(200);
    const oldCookie = (await api.storageState()).cookies.find(
      (cookie) => cookie.name === 'delayance_refresh',
    )?.value;
    expect(Boolean(oldCookie)).toBe(true);
    const refreshed = await api.post('/auth/refresh');
    expect(refreshed.status()).toBe(201);
    const rotated = (await refreshed.json()) as { accessToken: string };
    ownerToken = rotated.accessToken;
    const replay = await other.post('/auth/refresh', {
      headers: { Cookie: `delayance_refresh=${oldCookie}` },
    });
    expect(replay.status()).toBe(401);
    const tampered = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${rotated.accessToken.slice(0, -8)}invalid` },
    });
    expect(tampered.status()).toBe(401);
    const project = await api.post('/projects', {
      headers: { Authorization: `Bearer ${rotated.accessToken}` },
      data: { name: 'Local auth permission fixture' },
    });
    expect(project.status()).toBe(201);
    projectId = ((await project.json()) as { id: string }).id;
    const stranger = await other.post('/auth/register', {
      data: {
        email: `other-${crypto.randomUUID()}@example.test`,
        firstName: 'Other',
        lastName: 'Writer',
        password,
        confirmPassword: password,
      },
    });
    expect(stranger.status()).toBe(201);
    const strangerSession = (await stranger.json()) as { accessToken: string };
    const forbidden = await other.get(`/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${strangerSession.accessToken}` },
    });
    expect(forbidden.status()).toBe(403);
    await api.delete(`/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${rotated.accessToken}` },
    });
    projectId = undefined;
    expect((await api.post('/auth/logout')).status()).toBe(201);
    expect(
      (
        await api.get('/auth/me', { headers: { Authorization: `Bearer ${rotated.accessToken}` } })
      ).status(),
    ).toBe(401);
    expect((await api.post('/auth/refresh')).status()).toBe(401);
    await other.post('/auth/logout');
  } finally {
    if (projectId && ownerToken)
      await api.delete(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
    await api.dispose();
    await other.dispose();
  }
});

test('the persistent cookie restores login after reload and browser reopening', async ({
  browser,
}) => {
  const api = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Origin: new URL(WEB).origin },
  });
  const email = `persistent-auth-${crypto.randomUUID()}@example.test`;
  const password = 'Synthetic-persistent-auth-1234!';
  let context = await browser.newContext();
  try {
    const registered = await api.post('/auth/register', {
      data: {
        email,
        firstName: 'Persistent',
        lastName: 'Writer',
        password,
        confirmPassword: password,
      },
    });
    expect(registered.status()).toBe(201);
    await context.addCookies((await api.storageState()).cookies);
    let page = await context.newPage();
    await page.goto(`${WEB}/account`);
    await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
    await expect(page.getByLabel('Email Address')).toHaveValue(email);
    await page.reload();
    await expect(page.getByLabel('Email Address')).toHaveValue(email);
    // Retain only persistent browser cookies, with no in-memory access token or local storage.
    const cookies = await context.cookies(`${API}/auth/refresh`);
    expect(cookies.find((cookie) => cookie.name === 'delayance_refresh')?.expires).toBeGreaterThan(
      Date.now() / 1000,
    );
    await context.close();
    context = await browser.newContext();
    await context.addCookies(cookies);
    page = await context.newPage();
    await page.goto(`${WEB}/account`);
    await expect(page.getByLabel('Email Address')).toHaveValue(email);
    await page.getByRole('button', { name: 'Sign Out of Account' }).click();
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await context.close();
    await api.dispose();
  }
});
