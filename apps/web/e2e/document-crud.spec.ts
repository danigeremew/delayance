import { expect, request, test } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';
const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:48721';
const password = 'Synthetic-document-crud-1234!';
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });

test('document sidebar creates, opens, renames, imports, and deletes documents through the real API', async ({
  page,
}, testInfo) => {
  let projectId: string | undefined;
  let headers: { Authorization: string } | undefined;
  try {
    const registered = await page.request.post(`${API}/auth/register`, {
      headers: { Origin: new URL(WEB).origin },
      data: {
        email: `document-crud-${crypto.randomUUID()}@example.test`,
        firstName: 'Document',
        lastName: 'Writer',
        password,
        confirmPassword: password,
      },
    });
    expect(registered.status()).toBe(201);
    headers = { Authorization: `Bearer ${(await registered.json()).accessToken}` };
    const project = await page.request.post(`${API}/projects`, {
      headers,
      data: { name: 'Document CRUD project' },
    });
    expect(project.status()).toBe(201);
    projectId = (await project.json()).id;
    const base = `${API}/projects/${projectId}/documents`;
    const list = async () => {
      const response = await page.request.get(base, { headers });
      expect(response.status()).toBe(200);
      return (await response.json()) as { id: string; title: string }[];
    };
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('No documents in this project yet.')).toBeVisible();
    expect(await list()).toHaveLength(0);
    await page.getByRole('button', { name: '+ New Doc', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
      timeout: 90000,
    });
    const first = (await list())[0]!;
    const initial = await (await page.request.get(`${base}/${first.id}`, { headers })).json();
    let failRename = true;
    await page.route(`${base}/${first.id}`, (route) => {
      if (route.request().method() === 'PATCH' && failRename) {
        failRename = false;
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Rename failed. Try again.' }),
        });
      }
      return route.continue();
    });
    await page.getByRole('button', { name: 'Actions for Untitled document', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Document name', exact: true });
    await input.fill('Draft');
    await input.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: 'Rename failed.' })).toBeVisible();
    await expect(input).toHaveValue('Draft');
    await input.press('Enter');
    await expect(page.getByRole('link', { name: 'Draft', exact: true })).toBeVisible();
    const renamed = await (await page.request.get(`${base}/${first.id}`, { headers })).json();
    expect(renamed).toMatchObject({
      title: 'Draft',
      fileHash: initial.fileHash,
      currentVersion: initial.currentVersion,
    });
    const file = await page.request.get(`${base}/${first.id}/office/download`, { headers });
    expect(file.status()).toBe(200);
    const bytes = await file.body();

    await page.getByRole('button', { name: '+ New Doc', exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(`${first.id}$`));
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
      timeout: 90000,
    });
    const second = (await list()).find((doc) => doc.id !== first.id)!;
    await page.getByRole('button', { name: 'Actions for Untitled document', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await input.fill('Discarded name');
    await input.press('Escape');
    await expect(page.getByRole('link', { name: 'Untitled document', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Actions for Untitled document', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await input.fill('Notes');
    await page.getByRole('heading', { name: 'Documents', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Notes', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Draft', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${first.id}$`));
    await page.getByLabel('Import DOCX document').setInputFiles({
      name: 'broken.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('not a DOCX archive'),
    });
    await expect(page.getByRole('alert').filter({ hasText: 'not a readable DOCX' })).toBeVisible();
    expect(await list()).toHaveLength(2);
    await page.getByLabel('Import DOCX document').setInputFiles({
      name: 'Imported draft.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: bytes,
    });
    await expect(page.getByRole('link', { name: 'Imported draft', exact: true })).toBeVisible();
    const imported = (await list()).find((doc) => doc.title === 'Imported draft')!;
    await expect(page).toHaveURL(new RegExp(`${imported.id}$`));
    expect(
      await (await page.request.get(`${base}/${imported.id}/office/download`, { headers })).body(),
    ).toEqual(bytes);
    await page.getByRole('button', { name: 'Actions for Notes', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('document-actions.png') });
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await list()).toHaveLength(3);
    await page.getByRole('button', { name: 'Actions for Notes', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    let failDelete = true;
    await page.route(`${base}/${second.id}`, (route) => {
      if (route.request().method() === 'DELETE' && failDelete) {
        failDelete = false;
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Delete failed. Try again.' }),
        });
      }
      return route.continue();
    });
    await page.getByRole('button', { name: 'Delete document', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Delete failed.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Notes', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Delete document', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Notes', exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${imported.id}$`));
    for (const title of ['Imported draft', 'Draft']) {
      await page.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await page.getByRole('button', { name: 'Delete document', exact: true }).click();
      await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
      if (title === 'Imported draft') {
        await expect(page).toHaveURL(new RegExp(`${first.id}$`));
        await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
          timeout: 90000,
        });
      }
    }
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
    await expect(page.getByText('No documents in this project yet.')).toBeVisible();
    await page.reload();
    expect(await list()).toHaveLength(0);
    for (const doc of [first, second, imported])
      expect((await page.request.get(`${base}/${doc.id}`, { headers })).status()).toBe(404);
    await page.getByRole('button', { name: '+ New Doc', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Untitled document', exact: true })).toBeVisible();
    expect(await list()).toHaveLength(1);
  } finally {
    if (projectId && headers)
      await page.request
        .delete(`${API}/projects/${projectId}`, { headers, timeout: 10000 })
        .catch(() => {});
    if (!page.isClosed()) await page.close();
  }
});

test('document CRUD enforces project boundaries and role permissions', async () => {
  const api = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Origin: new URL(WEB).origin },
  });
  const projects: string[] = [];
  let headers: { Authorization: string } | undefined;
  try {
    const register = async (prefix: string) => {
      const email = `${prefix}-${crypto.randomUUID()}@example.test`;
      const response = await api.post('/auth/register', {
        data: {
          email,
          firstName: 'CRUD',
          lastName: 'Fixture',
          password,
          confirmPassword: password,
        },
      });
      expect(response.status()).toBe(201);
      return { email, headers: { Authorization: `Bearer ${(await response.json()).accessToken}` } };
    };
    headers = (await register('crud-owner')).headers;
    for (let i = 0; i < 2; i++) {
      const result = await api.post('/projects', {
        headers,
        data: { name: `CRUD permission ${i}` },
      });
      expect(result.status()).toBe(201);
      projects.push((await result.json()).id);
    }
    const base = `/projects/${projects[0]}/documents`;
    const created = await api.post(base, { headers, data: { title: 'Permission document' } });
    expect(created.status()).toBe(201);
    const id = (await created.json()).id;
    const stranger = await register('crud-stranger');
    expect((await api.get(base, { headers: stranger.headers })).status()).toBe(403);
    for (const method of ['get', 'patch', 'delete'] as const) {
      expect(
        (
          await api[method](`/projects/${projects[1]}/documents/${id}`, {
            headers,
            ...(method === 'patch' ? { data: { title: 'Wrong project' } } : {}),
          })
        ).status(),
      ).toBe(404);
    }
    expect((await api.patch(`${base}/${id}`, { headers, data: { title: ' ' } })).status()).toBe(
      400,
    );
    for (const role of ['viewer', 'contributor', 'editor'] as const) {
      const member = await register(`crud-${role}`);
      expect(
        (
          await api.post(`/projects/${projects[0]}/members`, {
            headers,
            data: { email: member.email, role },
          })
        ).status(),
      ).toBe(201);
      expect((await api.get(`${base}/${id}`, { headers: member.headers })).status()).toBe(200);
      expect(
        (
          await api.patch(`${base}/${id}`, {
            headers: member.headers,
            data: { title: 'Renamed by member' },
          })
        ).status(),
      ).toBe(role === 'viewer' ? 403 : 200);
      if (role !== 'editor')
        expect((await api.delete(`${base}/${id}`, { headers: member.headers })).status()).toBe(403);
      else
        expect((await api.delete(`${base}/${id}`, { headers: member.headers })).status()).toBe(200);
    }
    expect((await api.delete(`${base}/${id}`, { headers })).status()).toBe(404);
  } finally {
    for (const id of projects) if (headers) await api.delete(`/projects/${id}`, { headers });
    await api.dispose();
  }
});
