import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';
const projectId = '00000000-0000-4000-8000-000000000012';
const documentId = '00000000-0000-4000-8000-000000000013';
const user = {
  id: '00000000-0000-4000-8000-000000000011',
  email: 'writer@example.test',
  name: 'Test Writer',
};
const built = existsSync(path.resolve('public/wordcraft/wordcraft_bg.wasm'));

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });

async function fixture(page: Page) {
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
  let lock: string | null = null;
  let saves = 0;
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
      return json({
        actionUrl: `${web}/wordcraft/index.html`,
        wopiSource: `${API}/wopi/files/${documentId}`,
        accessToken: 'wopi-token',
        permission: 'write',
      });
    }
    if (pathname.startsWith('/wopi/files/')) {
      expect(url.searchParams.get('access_token')).toBe('wopi-token');
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
  return { saves: () => saves, bytes: () => bytes, lock: () => lock };
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
  await expect(page.getByText('Proposed text', { exact: true })).toBeVisible();
  expect(data.saves()).toBe(0);
  expect((await command(page, 'selection')).result?.text).toBe('Original text');
  await page.getByRole('button', { name: 'Apply to document', exact: true }).click();
  await expect(page.getByText('Applied to document', { exact: true })).toBeVisible();
  expect(data.saves()).toBe(1);
});
