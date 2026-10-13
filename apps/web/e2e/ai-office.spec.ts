import { expect, test, type Page } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';
const projectId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const chatId = '00000000-0000-4000-8000-000000000004';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'writer@example.test',
  name: 'Test Writer',
};
const workspace = `/projects/${projectId}/documents/${documentId}`;

async function setup(page: Page) {
  const proposals: Record<string, unknown>[] = [];
  const requests: Record<string, unknown>[] = [];
  const completionAttempts = new Map<string, number>();
  let settings = {
    model: 'gemini-3.8-flash',
    provider: 'gemini',
    policy: 'any',
    hasApiKey: false,
    hasCustomApiKey: false,
  };
  await page.route('http://localhost:9980/mock-office**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<textarea aria-label="Office document">Original text</textarea><script>
      const editor = document.querySelector('textarea');
      const host = ${JSON.stringify(new URL(workspace, 'http://localhost:48721').origin)};
      const send = (MessageId, Values) => parent.postMessage(JSON.stringify({MessageId, Values}), host);
      window.addEventListener('message', event => {
        if (event.origin !== host || event.source !== parent) return;
        const message = JSON.parse(event.data);
        if (message.MessageId === 'Host_PostmessageReady') send('App_LoadingStatus', {Status:'Document_Loaded'});
        if (message.MessageId === 'Action_Copy') send('Action_Copy_Resp', {content: editor.value.slice(editor.selectionStart, editor.selectionEnd)});
        if (message.MessageId === 'Action_Paste') {
          editor.setRangeText(message.Values.Data, editor.selectionStart, editor.selectionEnd, 'end');
          send('Doc_ModifiedStatus', {Modified:true});
        }
        if (message.MessageId === 'Action_Save') send('Action_Save_Resp', {success:true});
      });
    </script>`,
    }),
  );
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (path === '/auth/refresh') return json({ accessToken: 'test-token', user });
    if (path === '/auth/me') return json(user);
    if (path.endsWith('/ai-settings/test'))
      return settings.hasApiKey
        ? json({ ok: true, model: settings.model })
        : json({ message: 'Gemini is not configured. Configure a Gemini API key.' }, 400);
    if (path.endsWith('/ai-settings')) {
      if (method === 'PUT') {
        const input = route.request().postDataJSON();
        settings = {
          ...settings,
          model: input.model ?? settings.model,
          hasApiKey: Boolean(input.apiKey || settings.hasApiKey),
          hasCustomApiKey: Boolean(input.apiKey || settings.hasCustomApiKey),
        };
      }
      return json(settings);
    }
    if (path.endsWith('/office/session'))
      return json({
        actionUrl: 'http://localhost:9980/mock-office',
        wopiSource: `${API}/wopi/files/${documentId}`,
        accessToken: 'test-wopi-session',
        accessTokenTtl: Date.now() + 600000,
        permission: 'write',
      });
    if (path.endsWith('/office/ai')) {
      const input = route.request().postDataJSON();
      requests.push(input);
      const mode =
        input.mode === 'auto'
          ? input.instruction.includes('review')
            ? 'review'
            : 'write'
          : input.mode;
      const editing = mode === 'write' || mode === 'edit';
      const proposal = {
        id: `proposal-${proposals.length}`,
        chatId,
        mode,
        answer: `${mode} response`,
        status: 'pending',
        promptSummary: input.instruction,
        ops: editing
          ? [
              {
                type: 'office-text',
                action: mode === 'edit' ? 'replace' : 'insert',
                originalText: mode === 'edit' ? input.selectedText : '',
                text: mode === 'edit' ? 'Revised text' : ' New draft',
              },
            ]
          : [],
        findings: [],
        citedSourceIds: [],
      };
      proposals.push(proposal);
      return json({
        proposal,
        chatId,
        applied: false,
        validation: { ok: true, errors: [] },
        externalProviderWarning: null,
      });
    }
    if (path.endsWith('/office-accept')) {
      expect(route.request().postDataJSON().accessToken).toBe('test-wopi-session');
      return json(proposals.find((item) => path.includes(String(item.id)))?.ops);
    }
    if (path.endsWith('/office-complete')) {
      const attempts = (completionAttempts.get(path) ?? 0) + 1;
      completionAttempts.set(path, attempts);
      if (attempts === 1) return json({ message: 'The editor has not saved the change yet.' }, 409);
      const proposal = proposals.find((item) => path.includes(String(item.id)));
      if (proposal) proposal.status = 'accepted';
      return json({ ok: true });
    }
    if (path.endsWith('/ai/proposals')) return json(proposals);
    if (path.endsWith('/ai/chats'))
      return json(
        method === 'POST'
          ? { id: chatId, title: 'Test chat' }
          : [{ id: chatId, title: 'Test chat' }],
      );
    if (path.endsWith('/sources')) return json([]);
    if (path.endsWith('/documents')) return json([{ id: documentId, title: 'AI test document' }]);
    if (path.endsWith(`/documents/${documentId}`))
      return json({ id: documentId, title: 'AI test document' });
    return json({});
  });
  await page.goto(workspace);
  await expect(page.getByText('Loading document…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'AI settings', exact: true })).toBeVisible();
  return {
    requests,
    office: page
      .frameLocator('iframe[title="LibreOffice Writer"]')
      .getByRole('textbox', { name: 'Office document' }),
  };
}

async function chooseMode(page: Page, label: string) {
  await page.locator('.dl-ai-composer-pills button').first().click();
  await page
    .getByRole('option')
    .filter({ has: page.locator('.dl-ai-menu-label', { hasText: label }) })
    .click();
}

test('saves a Gemini key, selects a current or custom model, and tests the saved connection', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: 'AI settings', exact: true }).click();
  await page.getByRole('button', { name: 'Test saved connection' }).click();
  await expect(
    page.getByText('Gemini is not configured. Configure a Gemini API key.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Gemini API Key', { exact: true })).toHaveAttribute('type', 'text');
  await expect(page.getByLabel('Gemini API Key', { exact: true })).toHaveCSS(
    '-webkit-text-security',
    'disc',
  );
  await page.getByLabel('Gemini API Key', { exact: true }).fill('synthetic-test-key');
  await page.getByLabel('Model', { exact: true }).selectOption('gemini-3.8-flash');
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  await expect(page.getByText('Gemini API key and settings saved successfully.')).toBeVisible();
  await page.getByRole('button', { name: 'Test saved connection' }).click();
  await expect(page.getByText('Gemini connection works with gemini-3.8-flash.')).toBeVisible();
  await page.getByLabel('Custom model ID').fill('gemini-future-text');
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  await expect(page.getByLabel('Custom model ID')).toHaveValue('gemini-future-text');
});

test('Write and Edit preview text, apply only on acceptance, and save through the office bridge', async ({
  page,
}) => {
  const { office, requests } = await setup(page);
  await chooseMode(page, 'Write');
  await office.click();
  await office.press('End');
  await page.locator('.dl-ai-composer-input').fill('Draft new content');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Proposed text', { exact: true })).toBeVisible();
  await expect(office).toHaveValue('Original text');
  await page.getByRole('button', { name: 'Apply to document', exact: true }).click();
  await expect(office).toHaveValue('Original text New draft');
  await expect(page.getByText('Applied to document', { exact: true })).toBeVisible();
  await chooseMode(page, 'Edit');
  await office.selectText();
  await page.locator('.dl-ai-composer-input').fill('Rewrite selected text');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Original text', { exact: true })).toBeVisible();
  expect(requests.at(-1)?.selectedText).toBe('Original text New draft');
  await expect(office).toHaveValue('Original text New draft');
  await page.getByRole('button', { name: 'Apply to document', exact: true }).click();
  await expect(office).toHaveValue('Revised text');
});

test('Ask, Review and Auto send commands against the open office document', async ({ page }) => {
  const { requests, office } = await setup(page);
  for (const mode of ['Ask', 'Review', 'Auto']) {
    await chooseMode(page, mode);
    await page
      .locator('.dl-ai-composer-input')
      .fill(mode === 'Auto' ? 'Please review this document' : `${mode} this text`);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => requests.length).toBe(['Ask', 'Review', 'Auto'].indexOf(mode) + 1);
    await expect(page.locator('.dl-ai-typing')).toHaveCount(0);
    expect(requests.at(-1)?.mode).toBe(mode.toLowerCase());
    await expect(office).toHaveValue('Original text');
  }
  await expect(page.getByRole('button', { name: 'Apply to document', exact: true })).toHaveCount(0);
});
