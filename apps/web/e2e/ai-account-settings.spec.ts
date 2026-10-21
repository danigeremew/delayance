import { expect, request, test } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';
const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:48721';

test('account keys persist across projects and sessions without exposing keys to other members', async () => {
  const api = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Origin: new URL(WEB).origin },
  });
  const projects: string[] = [];
  const password = 'Synthetic-ai-settings-1234!';
  const email = `ai-key-${crypto.randomUUID()}@example.test`;
  let token = '';
  try {
    const registered = await api.post('/auth/register', {
      data: { email, firstName: 'Key', lastName: 'Writer', password, confirmPassword: password },
    });
    expect(registered.status()).toBe(201);
    token = (await registered.json()).accessToken;
    const headers = () => ({ Authorization: `Bearer ${token}` });
    for (let i = 0; i < 2; i++) {
      const response = await api.post('/projects', {
        headers: headers(),
        data: { name: `Account key fixture ${i}` },
      });
      expect(response.status()).toBe(201);
      projects.push((await response.json()).id);
    }
    const projectUrl = `/projects/${projects[0]}`;
    const renamed = await api.patch(projectUrl, {
      headers: headers(),
      data: { name: '  Renamed API project  ' },
    });
    expect(renamed.status()).toBe(200);
    expect(await renamed.json()).toMatchObject({ name: 'Renamed API project' });
    expect(await (await api.get(projectUrl, { headers: headers() })).json()).toMatchObject({
      name: 'Renamed API project',
      role: 'owner',
    });
    expect(
      (await api.patch(projectUrl, { headers: headers(), data: { name: '   ' } })).status(),
    ).toBe(400);
    const first = `/projects/${projects[0]}/ai-settings`;
    const second = `/projects/${projects[1]}/ai-settings`;
    const saved = await api.put(first, {
      headers: headers(),
      data: { apiKey: 'synthetic-account-key', apiKeyScope: 'account' },
    });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toMatchObject({ hasAccountApiKey: true, keySource: 'account' });
    expect(await saved.text()).not.toContain('synthetic-account-key');
    expect(await saved.text()).not.toContain('encryptedGeminiApiKey');
    await api.post('/auth/logout');
    const login = await api.post('/auth/login', { data: { email, password } });
    expect(login.status()).toBe(201);
    token = (await login.json()).accessToken;
    expect(await (await api.get(second, { headers: headers() })).json()).toMatchObject({
      hasAccountApiKey: true,
      keySource: 'account',
    });
    const model = await api.put(second, {
      headers: headers(),
      data: { model: 'gemini-3.8-flash', policy: 'local_only' },
    });
    expect(model.status()).toBe(200);
    expect(await model.json()).toMatchObject({ hasAccountApiKey: true });
    // This policy check must fail before any call to a live provider.
    expect((await api.post(`${second}/test`, { headers: headers() })).status()).toBe(403);

    const memberEmail = `ai-member-${crypto.randomUUID()}@example.test`;
    const member = await api.post('/auth/register', {
      data: {
        email: memberEmail,
        firstName: 'Other',
        lastName: 'Writer',
        password,
        confirmPassword: password,
      },
    });
    expect(member.status()).toBe(201);
    const memberHeaders = { Authorization: `Bearer ${(await member.json()).accessToken}` };
    expect(
      (
        await api.post(`/projects/${projects[0]}/members`, {
          headers: headers(),
          data: { email: memberEmail, role: 'viewer' },
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await api.patch(projectUrl, { headers: memberHeaders, data: { name: 'Forbidden rename' } })
      ).status(),
    ).toBe(403);
    expect(await (await api.get(projectUrl, { headers: memberHeaders })).json()).toMatchObject({
      name: 'Renamed API project',
      role: 'viewer',
    });
    const memberSettings = await api.get(first, { headers: memberHeaders });
    expect(memberSettings.status()).toBe(200);
    expect(await memberSettings.json()).toMatchObject({ hasAccountApiKey: false });
    expect(
      (
        await api.put(first, {
          headers: memberHeaders,
          data: { apiKey: 'forbidden-key', apiKeyScope: 'account' },
        })
      ).status(),
    ).toBe(403);

    const removed = await api.put(first, {
      headers: headers(),
      data: { apiKey: null, apiKeyScope: 'account' },
    });
    expect(removed.status()).toBe(200);
    expect(await (await api.get(second, { headers: headers() })).json()).toMatchObject({
      hasAccountApiKey: false,
    });
  } finally {
    for (const id of projects) {
      await api.delete(`/projects/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    }
    await api.post('/auth/logout');
    await api.dispose();
  }
});
