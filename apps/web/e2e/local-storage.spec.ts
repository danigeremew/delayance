import { expect, request, test } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';
const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:48721';

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });

test('local files support document creation, worker exports, signed downloads, and uploads', async () => {
  const api = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Origin: new URL(WEB).origin },
  });
  const anonymous = await request.newContext({ baseURL: API });
  let projectId: string | undefined;
  let headers: { Authorization: string } | undefined;
  try {
    const registered = await api.post('/auth/register', {
      data: {
        email: `storage-${crypto.randomUUID()}@example.test`,
        firstName: 'Storage',
        lastName: 'Fixture',
        password: 'Synthetic-storage-1234!',
        confirmPassword: 'Synthetic-storage-1234!',
      },
    });
    expect(registered.status()).toBe(201);
    headers = {
      Authorization: `Bearer ${((await registered.json()) as { accessToken: string }).accessToken}`,
    };
    const project = await api.post('/projects', {
      headers,
      data: { name: 'Local storage fixture' },
    });
    expect(project.status()).toBe(201);
    projectId = ((await project.json()) as { id: string }).id;
    const created = await api.post(`/projects/${projectId}/documents`, {
      headers,
      data: { title: 'Storage fixture' },
    });
    expect(created.status()).toBe(201);
    const document = (await created.json()) as { id: string; fileKey: string };
    expect(document.fileKey).toMatch(/\.docx$/);
    const exported = await api.post(`/projects/${projectId}/documents/${document.id}/export`, {
      headers,
      data: { format: 'docx' },
    });
    expect(exported.status()).toBe(201);
    const exportId = ((await exported.json()) as { export: { id: string } }).export.id;
    const downloadPath = `/projects/${projectId}/exports/${exportId}/download`;
    let downloadUrl = '';
    await expect
      .poll(
        async () => {
          const response = await api.get(downloadPath, { headers });
          if (response.status() !== 200) return false;
          downloadUrl = ((await response.json()) as { downloadUrl: string }).downloadUrl;
          return Boolean(downloadUrl);
        },
        { timeout: 60_000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    expect((await anonymous.get(downloadPath)).status()).toBe(401);
    const downloaded = await anonymous.get(downloadUrl);
    expect(downloaded.status()).toBe(200);
    expect(downloaded.headers()['content-disposition']).toContain('attachment;');
    expect(downloaded.headers()['cache-control']).toContain('no-store');
    const bytes = await downloaded.body();
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const tampered = new URL(downloadUrl);
    tampered.searchParams.set('signature', '0'.repeat(64));
    expect((await anonymous.get(tampered.toString())).status()).toBe(403);
    expect((await anonymous.get('/storage/download')).status()).toBe(403);
    const uploaded = await api.post(`/projects/${projectId}/files`, {
      headers,
      multipart: {
        file: {
          name: 'round-trip.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: bytes,
        },
      },
    });
    expect(uploaded.status()).toBe(201);
    expect(await uploaded.json()).toMatchObject({ bucket: 'local', sizeBytes: bytes.length });
  } finally {
    if (projectId && headers) await api.delete(`/projects/${projectId}`, { headers });
    await api.dispose();
    await anonymous.dispose();
  }
});

test('renames a project inline with the real editor and releases its WOPI lock on reload', async ({
  page,
}, testInfo) => {
  page.on('dialog', (dialog) => void dialog.accept());
  let projectId: string | undefined;
  let headers: { Authorization: string } | undefined;
  try {
    const registered = await page.request.post(`${API}/auth/register`, {
      headers: { Origin: new URL(WEB).origin },
      data: {
        email: `editor-reload-${crypto.randomUUID()}@example.test`,
        firstName: 'Reload',
        lastName: 'Fixture',
        password: 'Synthetic-reload-1234!',
        confirmPassword: 'Synthetic-reload-1234!',
      },
    });
    expect(registered.status()).toBe(201);
    headers = {
      Authorization: `Bearer ${((await registered.json()) as { accessToken: string }).accessToken}`,
    };
    const project = await page.request.post(`${API}/projects`, {
      headers,
      data: { name: 'Editor reload fixture' },
    });
    expect(project.status()).toBe(201);
    projectId = ((await project.json()) as { id: string }).id;
    const created = await page.request.post(`${API}/projects/${projectId}/documents`, {
      headers,
      data: { title: 'Existing project reload' },
    });
    expect(created.status()).toBe(201);
    const document = (await created.json()) as { id: string };
    await page.goto(`/projects/${projectId}/documents/${document.id}`);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
      timeout: 90000,
    });
    await page.getByRole('button', { name: 'Editor reload fixture', exact: true }).click();
    const nameInput = page.getByRole('textbox', { name: 'Project name', exact: true });
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toBeFocused();
    await expect(nameInput).toHaveCSS('border-top-style', 'solid');
    await expect(nameInput).toHaveCSS('border-left-width', '1px');
    await expect(nameInput).toHaveCSS('border-radius', '0px');
    await nameInput.fill('Renamed with Enter');
    await page.screenshot({ path: testInfo.outputPath('project-name-input.png') });
    await nameInput.press('Enter');
    await expect(nameInput).toHaveCount(0);
    await page.getByRole('button', { name: 'Renamed with Enter', exact: true }).click();
    await nameInput.fill('Renamed by clicking elsewhere');
    // A real document canvas takes focus in a different browsing context.
    await page
      .frameLocator('iframe[title="Wordcraft"]')
      .locator('canvas')
      .click({ position: { x: 500, y: 250 } });
    await expect(nameInput).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Renamed by clicking elsewhere', exact: true }),
    ).toBeVisible();
    const savedProject = await page.request.get(`${API}/projects/${projectId}`, { headers });
    expect(await savedProject.json()).toMatchObject({ name: 'Renamed by clicking elsewhere' });
    await page.screenshot({ path: testInfo.outputPath('project-name-saved.png') });
    // A fresh page uses a new random lock. Becoming writable proves the server
    // received the old page's release; unload beacons need not expose a response event.
    await page.reload({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
      timeout: 90000,
    });
    await expect(page.getByText(/Showing the last saved copy read-only/)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Renamed by clicking elsewhere', exact: true }),
    ).toBeVisible();
  } finally {
    if (!page.isClosed()) await page.close();
    if (projectId && headers)
      await page.request.delete(`${API}/projects/${projectId}`, { headers });
  }
});
