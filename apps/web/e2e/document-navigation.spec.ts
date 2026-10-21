import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';
const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:48721';
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });

test('switches documents without remounting the workspace, saves pending text, and scopes loading to the editor', async ({
  page,
}, testInfo) => {
  let projectId: string | undefined;
  let headers: { Authorization: string } | undefined;
  let resume = () => {};
  const loadingGate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  try {
    const registered = await page.request.post(`${API}/auth/register`, {
      headers: { Origin: new URL(WEB).origin },
      data: {
        email: `navigation-${crypto.randomUUID()}@example.test`,
        firstName: 'Navigation',
        lastName: 'Writer',
        password: 'Synthetic-navigation-1234!',
        confirmPassword: 'Synthetic-navigation-1234!',
      },
    });
    expect(registered.status()).toBe(201);
    headers = { Authorization: `Bearer ${(await registered.json()).accessToken}` };
    const project = await page.request.post(`${API}/projects`, {
      headers,
      data: { name: 'Persistent workspace' },
    });
    expect(project.status()).toBe(201);
    projectId = (await project.json()).id;
    const base = `${API}/projects/${projectId}/documents`;
    const create = async (title: string) => {
      const response = await page.request.post(base, { headers, data: { title } });
      expect(response.status()).toBe(201);
      return (await response.json()) as { id: string; currentVersion: number };
    };
    const first = await create('Document A');
    const second = await create('Document B');
    await page.goto(`/projects/${projectId}/documents/${first.id}`);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
      timeout: 90000,
    });
    const header = await page.locator('.dl-app-topbar').elementHandle();
    const tools = await page
      .getByRole('complementary', { name: 'Document tools', exact: true })
      .elementHandle();
    const assistant = await page
      .getByRole('complementary', { name: 'AI assistant', exact: true })
      .elementHandle();
    expect(header).not.toBeNull();
    expect(tools).not.toBeNull();
    expect(assistant).not.toBeNull();
    const toolsBefore = await tools!.boundingBox();
    let mainNavigations = 0;
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) mainNavigations++;
    });

    await page
      .frameLocator('iframe[title="Wordcraft"]')
      .locator('canvas')
      .click({ position: { x: 500, y: 250 } });
    await page.keyboard.type('Unsaved text in document A');
    await expect(page.locator('.dl-app-topbar-status')).toHaveCount(0);
    let failSave = true;
    await page.route(`${API}/wopi/files/${first.id}/contents*`, (route) => {
      if (route.request().method() === 'POST' && failSave) {
        failSave = false;
        return route.fulfill({ status: 500, body: 'Synthetic save failure' });
      }
      return route.continue();
    });
    await page.getByRole('link', { name: 'Document B', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'could not save' }).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${first.id}$`));
    expect(await header!.evaluate((node) => node.isConnected)).toBe(true);

    await page.route(`${base}/${second.id}/office/session`, async (route) => {
      await loadingGate;
      await route.continue().catch(() => {});
    });
    await page.getByRole('link', { name: 'Document B', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${second.id}$`));
    const loading = page.getByRole('status').filter({ hasText: 'Loading Wordcraft…' });
    await expect(loading).toBeVisible();
    expect(await header!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await tools!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await assistant!.evaluate((node) => node.isConnected)).toBe(true);
    const toolsDuring = await tools!.boundingBox();
    expect(toolsDuring!.y).toBeCloseTo(toolsBefore!.y, 0);
    const loadingBox = await loading.boundingBox();
    const assistantBox = await assistant!.boundingBox();
    expect(loadingBox!.x).toBeGreaterThanOrEqual(toolsDuring!.x + toolsDuring!.width);
    expect(loadingBox!.x + loadingBox!.width).toBeLessThanOrEqual(assistantBox!.x);
    await expect(page.getByRole('link', { name: 'Document B', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.screenshot({ path: testInfo.outputPath('document-switch-loading.png') });

    const saved = await page.request.get(`${base}/${first.id}`, { headers });
    expect((await saved.json()).currentVersion).toBeGreaterThan(first.currentVersion);
    const download = await page.request.get(`${base}/${first.id}/office/download`, { headers });
    const zip = await JSZip.loadAsync(await download.body());
    expect(await zip.file('word/document.xml')?.async('string')).toContain(
      'Unsaved text in document A',
    );
    resume();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
      timeout: 90000,
    });
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${first.id}$`));
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
      timeout: 90000,
    });
    expect(await header!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await tools!.evaluate((node) => node.isConnected)).toBe(true);
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${second.id}$`));
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
      timeout: 90000,
    });
    expect(await assistant!.evaluate((node) => node.isConnected)).toBe(true);
    expect(mainNavigations).toBe(0);
    await expect(page.getByText(/Showing the last saved copy read-only/)).toHaveCount(0);
  } finally {
    resume();
    if (projectId && headers)
      await page.request
        .delete(`${API}/projects/${projectId}`, { headers, timeout: 10000 })
        .catch(() => {});
    if (!page.isClosed()) await page.close();
  }
});
