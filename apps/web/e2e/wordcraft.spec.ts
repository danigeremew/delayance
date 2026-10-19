import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import type { WordcraftLayout } from '../src/editor/workspace-layout';

declare global {
  interface Window {
    wordcraftTestLayout?: WordcraftLayout;
  }
}

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';
const projectId = '00000000-0000-4000-8000-000000000012';
const documentId = '00000000-0000-4000-8000-000000000013';
const user = {
  id: '00000000-0000-4000-8000-000000000011',
  email: 'writer@example.test',
  name: 'Test Writer',
};
const built = existsSync(path.resolve('public/wordcraft/wordcraft_bg.wasm'));

test.use({
  viewport: { width: 1440, height: 900 },
  launchOptions: { args: ['--enable-unsafe-swiftshader'] },
});

async function fixture(
  page: Page,
  permission: 'read' | 'write' = 'write',
  initialLock: string | null = null,
) {
  await page.addInitScript(() => {
    window.addEventListener('message', (event) => {
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Wordcraft"]');
      if (
        event.source !== frame?.contentWindow ||
        event.origin !== location.origin ||
        typeof event.data !== 'string'
      )
        return;
      const message = JSON.parse(event.data);
      if (message.MessageId === 'Delayance_Layout') window.wordcraftTestLayout = message.Values;
    });
  });
  let sessions = 0;
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame.url().includes('/wordcraft/index.html')) navigations += 1;
  });
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Original text</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
  );
  let bytes = await zip.generateAsync({ type: 'nodebuffer' });
  let version = 1;
  let lock: string | null = initialLock;
  let releases = 0;
  let saves = 0;
  let failSave = false;
  let proposal: Record<string, unknown> | null = null;
  const hash = () => createHash('sha256').update(bytes).digest('hex');
  const web = new URL(test.info().project.use.baseURL ?? 'http://localhost:48721').origin;
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (pathname === '/auth/refresh') return json({ accessToken: 'test-token', user });
    if (pathname === '/auth/me') return json(user);
    if (pathname.endsWith('/office/ai')) {
      const input = request.postDataJSON() as { selectedText: string; instruction: string };
      expect(input.selectedText).toBe('Original text');
      proposal = {
        id: 'proposal',
        mode: 'edit',
        status: 'pending',
        answer: 'Proposed rewrite',
        promptSummary: input.instruction,
        ops: [
          {
            type: 'office-text',
            action: 'replace',
            originalText: input.selectedText,
            text: 'AI proposal accepted in Wordcraft',
            fileHash: hash(),
            version,
          },
        ],
        findings: [],
        citedSourceIds: [],
      };
      return json({
        proposal,
        chatId: 'chat',
        validation: { ok: true, errors: [] },
        externalProviderWarning: null,
      });
    }
    if (pathname.endsWith('/office-accept')) {
      expect(request.postDataJSON().accessToken).toBe('wopi-token');
      return json({});
    }
    if (pathname.endsWith('/office-complete')) {
      expect(saves).toBe(1);
      const saved = await JSZip.loadAsync(bytes);
      expect(await saved.file('word/document.xml')?.async('string')).toContain(
        'AI proposal accepted in Wordcraft',
      );
      if (proposal) proposal.status = 'accepted';
      return json({ ok: true });
    }
    if (pathname.endsWith('/ai/proposals')) return json(proposal ? [proposal] : []);
    if (pathname.endsWith('/office/session')) {
      sessions += 1;
      return json({
        actionUrl: `${web}/wordcraft/index.html`,
        wopiSource: `${API}/wopi/files/${documentId}`,
        accessToken: 'wopi-token',
        permission,
      });
    }
    if (pathname.startsWith('/wopi/files/')) {
      expect(url.searchParams.get('access_token')).toBe('wopi-token');
      if (pathname.endsWith('/release')) {
        const body = new URLSearchParams(request.postData() ?? '');
        const released = body.get('lock') === lock;
        if (released) {
          lock = null;
          releases += 1;
        }
        return json({ released });
      }
      const operation = request.headers()['x-wopi-override'];
      const incomingLock = request.headers()['x-wopi-lock'];
      if (operation === 'UNLOCK') {
        if (incomingLock === lock) lock = null;
        return json({});
      }
      if (operation) {
        if (lock && incomingLock !== lock) return json({}, 409);
        lock = incomingLock ?? null;
        return json({});
      }
      if (pathname.endsWith('/contents')) {
        if (request.method() === 'POST') {
          if (failSave) {
            failSave = false;
            return json({}, 500);
          }
          expect(incomingLock).toBe(lock);
          expect(request.headers()['x-delayance-file-version']).toBe(`${version}:${hash()}`);
          bytes = request.postDataBuffer() ?? Buffer.alloc(0);
          version += 1;
          saves += 1;
          return json({ version });
        }
        return route.fulfill({ contentType: 'application/octet-stream', body: bytes });
      }
      return json({ Version: `${version}:${hash()}` });
    }
    if (pathname.endsWith('/ai-settings'))
      return json({
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        policy: 'any',
        hasApiKey: false,
      });
    if (pathname.endsWith('/ai/chats'))
      return json(
        request.method() === 'POST'
          ? { id: 'chat', title: 'Test chat' }
          : [{ id: 'chat', title: 'Test chat' }],
      );
    if (pathname.endsWith('/documents')) return json([{ id: documentId, title: 'Wordcraft test' }]);
    if (pathname.endsWith(`/documents/${documentId}`))
      return json({ id: documentId, title: 'Wordcraft test' });
    return json([]);
  });
  await page.goto(`/projects/${projectId}/documents/${documentId}`);
  await expect(page.getByText('Loading document…', { exact: true })).toHaveCount(0);
  return {
    failNextSave: () => {
      failSave = true;
    },
    saves: () => saves,
    bytes: () => bytes,
    lock: () => lock,
    releases: () => releases,
    closeOtherEditor: () => {
      if (lock === initialLock) lock = null;
    },
    sessions: () => sessions,
    navigations: () => navigations,
  };
}

async function command(page: Page, method: string, params: Record<string, unknown> = {}) {
  return page.evaluate(
    async ({ method, params }) => {
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Wordcraft"]');
      if (!frame?.contentWindow) throw new Error('Wordcraft frame unavailable');
      const requestId = crypto.randomUUID();
      return new Promise<{
        ok: boolean;
        result?: { handle: string; text: string };
        error?: string;
      }>((resolve, reject) => {
        const timer = setTimeout(() => {
          window.removeEventListener('message', listener);
          reject(new Error('Bridge timed out'));
        }, 15000);
        const listener = (event: MessageEvent) => {
          if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
          let data: unknown;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          const message = data as {
            MessageId?: string;
            Values?: {
              requestId?: string;
              ok: boolean;
              result?: { handle: string; text: string };
              error?: string;
            };
          };
          if (message.MessageId === 'Delayance_Reply' && message.Values?.requestId === requestId) {
            clearTimeout(timer);
            window.removeEventListener('message', listener);
            resolve(message.Values);
          }
        };
        window.addEventListener('message', listener);
        frame.contentWindow?.postMessage(
          JSON.stringify({ MessageId: 'Delayance_Request', Values: { requestId, method, params } }),
          location.origin,
        );
      });
    },
    { method, params },
  );
}

test('provides an actionable fallback when the Wordcraft build is missing', async ({ page }) => {
  await page.route('**/wordcraft/index.html', (route) =>
    route.fulfill({ status: 404, body: 'Missing build' }),
  );
  await fixture(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Wordcraft is not built' })).toBeVisible();
  await expect(page.getByLabel('Document editor')).toHaveCount(0);
});

test('real Wordcraft rejects stale ranges, preserves bold text in DOCX, saves through WOPI, and releases its lock on navigation', async ({
  page,
}) => {
  test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  const data = await fixture(page);
  await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
    timeout: 90000,
  });
  await expect(page.frameLocator('iframe[title="Wordcraft"]').locator('canvas')).toBeVisible();
  expect((await command(page, 'command', { command: 'select.all' })).ok).toBe(true);
  const old = await command(page, 'selection');
  expect(old.result?.text).toBe('Original text');
  expect((await command(page, 'command', { command: 'format.bold' })).ok).toBe(true);
  const stale = await command(page, 'replace', {
    handle: old.result?.handle,
    text: 'Wrong replacement',
  });
  expect(stale.ok).toBe(false);
  expect(stale.error).toContain('document changed');
  const current = await command(page, 'selection');
  expect(
    (
      await command(page, 'replace', {
        handle: current.result?.handle,
        text: 'Wordcraft replacement',
      })
    ).ok,
  ).toBe(true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(data.saves).toBe(1);
  await expect(page.locator('.dl-app-topbar-status')).toHaveText('saved');
  const saved = await JSZip.loadAsync(data.bytes());
  const xml = await saved.file('word/document.xml')?.async('string');
  expect(xml).toContain('Wordcraft replacement');
  expect(xml).toMatch(/<w:b(?:\s|\/|>)/);
  await expect(page.getByLabel('Document editor')).toHaveCount(0);
  await page.getByTitle('Back to projects').click();
  await expect.poll(data.lock).toBe(null);
});

test('real Wordcraft applies an AI rewrite only after preview and acceptance', async ({ page }) => {
  test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  const data = await fixture(page);
  await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
    timeout: 90000,
  });
  expect((await command(page, 'command', { command: 'select.all' })).ok).toBe(true);
  await page.locator('.dl-ai-composer-pills button').first().click();
  await page
    .getByRole('option')
    .filter({ has: page.locator('.dl-ai-menu-label', { hasText: 'Edit' }) })
    .click();
  await page.locator('.dl-ai-composer-input').fill('Rewrite selected text');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page.getByText('Preview highlighted in the document.', { exact: false }),
  ).toBeVisible();
  expect(data.saves()).toBe(0);
  const saved = await JSZip.loadAsync(data.bytes());
  expect(await saved.file('word/document.xml')!.async('string')).toContain('Original text');
  const controls = await page.evaluate(() => window.wordcraftTestLayout?.preview);
  expect(controls?.id).toBe('proposal');
  expect((await command(page, 'command', { command: 'edit.undo' })).ok).toBe(false);
  await page.screenshot({ path: '../../output/playwright/inline-ai-preview.png' });
  const box = await page.locator('iframe[title="Wordcraft"]').boundingBox();
  const accept = controls!.accept;
  await page.mouse.click(
    box!.x + accept.x + accept.width / 2,
    box!.y + accept.y + accept.height / 2,
  );
  await expect(page.getByText('Applied to document', { exact: true })).toBeVisible();
  expect(data.saves()).toBe(1);
});

test('rejects an outdated editor before acquiring a WOPI lock', async ({ page }) => {
  await page.route('**/wordcraft/index.html*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<script>parent.postMessage(JSON.stringify({MessageId:'App_LoadingStatus',Values:{Status:'Frame_Ready'}}),location.origin)</script>`,
    }),
  );
  const data = await fixture(page);
  await expect(page.getByRole('alert').filter({ hasText: 'needs rebuilding' })).toBeVisible();
  expect(data.lock()).toBe(null);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('real integrated chrome preserves the editor across resizing and layers File/search above panels', async ({
  page,
}) => {
  test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  const data = await fixture(page);
  await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
    timeout: 90000,
  });
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(380);
  const original = await page.evaluate(() => window.wordcraftTestLayout!);
  expect(original.width).toBe(1440);
  expect(original.center.width).toBe(660);
  const tools = page.getByRole('complementary', { name: 'Document tools', exact: true });
  const assistant = page.getByRole('complementary', { name: 'AI assistant', exact: true });
  const frame = page.locator('iframe[title="Wordcraft"]');
  const bounds = (await frame.boundingBox())!;
  expect((await tools.boundingBox())!.y).toBeCloseTo(bounds.y + original.top, 0);
  expect((await assistant.boundingBox())!.y).toBeCloseTo(bounds.y + original.top, 0);
  await page.screenshot({ path: path.resolve('../../output/playwright/integrated-workspace.png') });

  expect((await command(page, 'command', { command: 'select.all' })).ok).toBe(true);
  const selection = await command(page, 'selection');
  const lock = data.lock();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(0);
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(380);
  const resize = page.getByRole('separator', { name: 'Resize left sidebar' });
  await resize.hover({ position: { x: 2, y: 100 } });
  const handle = (await resize.boundingBox())!;
  await page.mouse.move(handle.x + 2, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x + 42, handle.y + 100, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(420);
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(assistant).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.width)).toBe(480);
  await page.screenshot({
    path: path.resolve('../../output/playwright/integrated-workspace-narrow.png'),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(assistant).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.width)).toBe(620);
  expect(data.sessions()).toBe(1);
  expect(data.navigations()).toBe(1);
  expect(data.lock()).toBe(lock);
  expect((await command(page, 'selection')).result?.text).toBe(selection.result?.text);

  // The font-family menu extends into the host's left sidebar below the ribbon.
  await page.mouse.click(bounds.x + 285, bounds.y + 46);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const layout = window.wordcraftTestLayout;
        return layout?.overlays.some(
          (rect) =>
            rect.x < layout.center.x && rect.y + rect.height > layout.top + 100 && rect.width > 100,
        );
      }),
    )
    .toBe(true);
  const menuAbovePanel = await page.evaluate(() => {
    const layout = window.wordcraftTestLayout!;
    const menu = layout.overlays.find(
      (rect) =>
        rect.x < layout.center.x && rect.y + rect.height > layout.top + 100 && rect.width > 100,
    )!;
    const frame = document.querySelector('iframe[title="Wordcraft"]')!.getBoundingClientRect();
    return document.elementFromPoint(
      frame.x + menu.x + 30,
      frame.y + Math.max(layout.top + 20, menu.y + 20),
    )?.tagName;
  });
  expect(menuAbovePanel).toBe('IFRAME');
  await page.screenshot({
    path: path.resolve('../../output/playwright/integrated-workspace-menu.png'),
  });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Search commands', exact: true }).click();
  await expect(page.locator('.dl-app-topbar-actions')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.blocking)).toBe(true);
  await expect(tools).toHaveAttribute('inert', '');
  await page.screenshot({
    path: path.resolve('../../output/playwright/integrated-workspace-search.png'),
  });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.blocking)).toBe(false);
  // File is the first native ribbon tab; its position follows the measured full-width surface.
  await page.mouse.click(bounds.x + 24, bounds.y + 15);
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.blocking)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.blocking)).toBe(false);
});

test('read-only integrated header disables writes and the native bridge rejects formatting', async ({
  page,
}) => {
  test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  const data = await fixture(page, 'read');
  await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
    timeout: 90000,
  });
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.writable)).toBe(false);
  for (const name of ['Save', 'Undo', 'Redo'])
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  expect((await command(page, 'command', { command: 'format.bold' })).ok).toBe(false);
  expect(data.lock()).toBe(null);
});

test('real ribbon formatting retains typing focus and shared header history saves formatted DOCX', async ({
  page,
}) => {
  test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  const data = await fixture(page);
  await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
    timeout: 90000,
  });
  await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(380);
  expect((await command(page, 'command', { command: 'select.all' })).ok).toBe(true);
  const bounds = (await page.locator('iframe[title="Wordcraft"]').boundingBox())!;
  // Native Home ribbon's Bold button, verified in the desktop screenshot.
  await page.mouse.click(bounds.x + 155, bounds.y + 72);
  await page.keyboard.type('Integrated writing');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.dl-app-topbar-actions')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.dl-app-topbar-actions')).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.type(' continued');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(data.saves).toBe(1);
  const zip = await JSZip.loadAsync(data.bytes());
  const xml = await zip.file('word/document.xml')?.async('string');
  expect(xml).toContain('Integrated writing continued');
  expect(xml).toMatch(/<w:b(?:\s|\/|>)/);
});

test('a failed WOPI save keeps the document available for retry', async ({ page }) => {
  test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  const data = await fixture(page);
  await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
    timeout: 90000,
  });
  await command(page, 'command', { command: 'select.all' });
  const range = await command(page, 'selection');
  expect(
    (
      await command(page, 'replace', {
        handle: range.result?.handle,
        text: 'Retained after save failure',
      })
    ).ok,
  ).toBe(true);
  data.failNextSave();
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await save.click();
  await expect(
    page.getByRole('alert').filter({ hasText: /save|access the document/ }),
  ).toBeVisible();
  await expect(page.locator('iframe[title="Wordcraft"]')).toBeVisible();
  expect(data.saves()).toBe(0);
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(data.saves).toBe(1);
  await expect(page.locator('.dl-app-topbar-status')).toHaveText('saved');
  await expect(page.getByRole('alert').filter({ hasText: /save|access the document/ })).toHaveCount(
    0,
  );
  const zip = await JSZip.loadAsync(data.bytes());
  expect(await zip.file('word/document.xml')?.async('string')).toContain(
    'Retained after save failure',
  );
});

test('a locked existing document opens read-only and retries without taking the other editor’s lock', async ({
  page,
}) => {
  test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  const data = await fixture(page, 'write', 'another-editor-lock');
  await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
    timeout: 90000,
  });
  await expect(page.getByText(/Showing the last saved copy read-only/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  expect(data.lock()).toBe('another-editor-lock');
  expect(data.releases()).toBe(0);
  await command(page, 'command', { command: 'select.all' });
  expect((await command(page, 'selection')).result?.text).toBe('Original text');
  expect((await command(page, 'command', { command: 'format.bold' })).ok).toBe(false);
  data.closeOtherEditor();
  await page.getByRole('button', { name: 'Retry editing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
    timeout: 90000,
  });
  await expect(page.getByText(/Showing the last saved copy read-only/)).toHaveCount(0);
  expect(data.lock()).not.toBe(null);
  expect((await command(page, 'command', { command: 'format.bold' })).ok).toBe(true);
});

test('page exit releases the exact lock, and a reload can reopen the existing document', async ({
  page,
}) => {
  test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  const data = await fixture(page);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
    timeout: 90000,
  });
  const previous = data.lock();
  expect(previous).not.toBe(null);
  // Exercise the real page-exit handler while keeping route interception alive to observe its beacon.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(data.lock).toBe(null);
  expect(data.releases()).toBe(1);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect.poll(data.lock).toBe(previous);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({
    timeout: 90000,
  });
  expect(data.lock()).not.toBe(previous);
  await expect(page.getByText(/Showing the last saved copy read-only/)).toHaveCount(0);
});
