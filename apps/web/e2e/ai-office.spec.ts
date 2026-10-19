import { expect, test, type Page } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';
const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:48721';
const projectId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const chatId = '00000000-0000-4000-8000-000000000004';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'writer@example.test',
  name: 'Test Writer',
};
const workspace = `/projects/${projectId}/documents/${documentId}`;

async function setup(page: Page, options: { failSaveOnce?: boolean; denyAccept?: boolean } = {}) {
  let failSave = options.failSaveOnce ?? false;
  let saves = 0;
  let authorizations = 0;
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
  await page.route('**/wordcraft/index.html*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<textarea aria-label="Office document">Original text</textarea><script>
      const editor = document.querySelector('textarea');
      let preview = null;
      let captured = null;
      const host = ${JSON.stringify(new URL(WEB).origin)};
      const send = (MessageId, Values) => parent.postMessage(JSON.stringify({MessageId, Values}), host);
      window.addEventListener('message', event => {
        if (event.origin !== host || event.source !== parent) return;
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (message.MessageId === 'Delayance_HostLayout') {
          const {left,right} = message.Values;
          editor.style.position = 'absolute'; editor.style.left = left + 'px';
          send('Delayance_Layout', { embeddedLayout:1,width:innerWidth,height:innerHeight,top:0,bottom:0,
            center:{x:left,y:0,width:innerWidth-left-right,height:innerHeight},overlays:[],blocking:false,writable:true,canUndo:false,canRedo:false });
        }
        if (message.MessageId === 'Delayance_LoadDocument') {
          send('App_LoadingStatus', {Status:'Document_Loaded'});
        }
        if (message.MessageId === 'Delayance_Request') {
          const {requestId, method, params} = message.Values;
          let result = {};
          if (method === 'selection') {
            const text = editor.value.slice(editor.selectionStart, editor.selectionEnd);
            captured = {value:editor.value,start:editor.selectionStart,end:editor.selectionEnd};
            result = {text, isCollapsed: !text, handle: 'native-range'};
          }
          if (method === 'preview') {
            preview = {...captured, ...params};
            editor.setRangeText(params.text, captured.start, captured.end, 'end');
            editor.readOnly = true;
            const controls = document.createElement('div'); controls.id='preview'; controls.style.position='absolute'; controls.style.left=editor.style.left; controls.style.top='180px';
            for (const [label,decision] of [['Accept AI text','accept'],['Discard AI text','reject']]) {
              const button=document.createElement('button'); button.textContent=label;
              button.onclick=()=>send('Delayance_PreviewDecision',{id:preview.id,decision}); controls.append(button);
            }
            document.body.append(controls);
          }
          if (method === 'preview-discard' || method === 'preview-commit') {
            editor.value=preview.value; editor.setSelectionRange(preview.start,preview.end);
            if (method === 'preview-commit') { editor.setRangeText(preview.text, preview.start, preview.end, 'end'); send('Doc_ModifiedStatus',{Modified:true}); }
            editor.readOnly=false; document.querySelector('#preview').remove(); preview=null;
          }
          if (method === 'replace' || method === 'insert') {
            editor.setRangeText(params.text, editor.selectionStart, editor.selectionEnd, 'end');
            send('Doc_ModifiedStatus', {Modified:true});
          }
          send('Delayance_Reply', {requestId, ok:true, result});
        }
        if (message.MessageId === 'Action_Save') parent.postMessage({MessageId:'Delayance_Docx', Values:{id:1, bytes:new Uint8Array([1,2,3])}},host);
        if (message.MessageId === 'Delayance_SaveResult') send('Action_Save_Resp', {success:message.Values.success});
      });
      send('App_LoadingStatus', {Status:'Frame_Ready',embeddedLayout:1});
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
        actionUrl: `${WEB}/wordcraft/index.html`,
        wopiSource: `${API}/wopi/files/${documentId}`,
        accessToken: 'test-wopi-session',
        accessTokenTtl: Date.now() + 600000,
        permission: 'write',
      });
    if (path.startsWith('/wopi/files/')) {
      if (method === 'POST') {
        if (path.endsWith('/contents')) {
          if (failSave) {
            failSave = false;
            return json({ message: 'Synthetic save failure' }, 500);
          }
          saves += 1;
        }
        return json({ version: 2 });
      }
      if (path.endsWith('/contents')) return route.fulfill({ body: Buffer.from([1, 2, 3]) });
      return json({ Version: `1:${'a'.repeat(64)}` });
    }
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
      authorizations += 1;
      if (options.denyAccept) return json({ message: 'You cannot edit this document.' }, 403);
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
    if (path.endsWith('/reject')) {
      const proposal = proposals.find((item) => path.includes(String(item.id)));
      if (proposal) proposal.status = 'rejected';
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
  await expect(
    page
      .frameLocator('iframe[title="Wordcraft"]')
      .getByRole('textbox', { name: 'Office document' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI settings', exact: true })).toBeVisible();
  return {
    requests,
    saves: () => saves,
    authorizations: () => authorizations,
    office: page
      .frameLocator('iframe[title="Wordcraft"]')
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
  const keyInput = page.getByLabel('Gemini API Key', { exact: true });
  await expect(keyInput).toHaveAttribute('type', 'password');
  await keyInput.fill('synthetic-test-key');
  await page.getByRole('button', { name: 'Show API key', exact: true }).click();
  await expect(keyInput).toHaveAttribute('type', 'text');
  await expect(keyInput).toHaveValue('synthetic-test-key');
  await page.getByRole('button', { name: 'Hide API key', exact: true }).click();
  await expect(keyInput).toHaveAttribute('type', 'password');
  await page.getByLabel('Model', { exact: true }).selectOption('gemini-3.8-flash');
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  await expect(page.getByText('Gemini API key and settings saved successfully.')).toBeVisible();
  await page.getByRole('button', { name: 'Show API key', exact: true }).click();
  await expect(keyInput).toHaveAttribute('type', 'text');
  await expect(keyInput).toHaveValue('synthetic-test-key');
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
  await expect(
    page.getByText('Preview highlighted in the document.', { exact: false }),
  ).toBeVisible();
  await expect(office).toHaveValue('Original text New draft');
  await page
    .frameLocator('iframe[title="Wordcraft"]')
    .getByRole('button', { name: 'Accept AI text' })
    .click();
  await expect(office).toHaveValue('Original text New draft');
  await expect(page.getByText('Applied to document', { exact: true })).toBeVisible();
  await chooseMode(page, 'Edit');
  await office.selectText();
  await page.locator('.dl-ai-composer-input').fill('Rewrite selected text');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page.getByText('Preview highlighted in the document.', { exact: false }),
  ).toBeVisible();
  expect(requests.at(-1)?.selectedText).toBe('Original text New draft');
  await expect(office).toHaveValue('Revised text');
  await page
    .frameLocator('iframe[title="Wordcraft"]')
    .getByRole('button', { name: 'Accept AI text' })
    .click();
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

test('inline discard restores text without a save and survives hiding the assistant', async ({
  page,
}) => {
  const { office, saves } = await setup(page);
  await chooseMode(page, 'Write');
  await office.click();
  await office.press('End');
  await page.locator('.dl-ai-composer-input').fill('Draft a paragraph');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(office).toHaveValue('Original text New draft');
  await expect(
    page.getByText('Saved document text is sent to Gemini.', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'AI assistant', exact: true })).toBeHidden();
  await page
    .frameLocator('iframe[title="Wordcraft"]')
    .getByRole('button', { name: 'Discard AI text' })
    .click();
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await expect(office).toHaveValue('Original text');
  await expect(page.locator('[data-status="rejected"]')).toBeVisible();
  expect(saves()).toBe(0);
});

test('retrying a failed save never inserts the accepted text twice', async ({ page }) => {
  const { office, saves, authorizations } = await setup(page, { failSaveOnce: true });
  await chooseMode(page, 'Write');
  await office.click();
  await office.press('End');
  await page.locator('.dl-ai-composer-input').fill('Draft content');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Accept preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry saving', exact: true })).toBeEnabled();
  await expect(office).toHaveValue('Original text New draft');
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(page.getByText('Applied to document', { exact: true })).toBeVisible();
  await expect(office).toHaveValue('Original text New draft');
  expect(saves()).toBe(1);
  expect(authorizations()).toBe(1);
});

test('denied acceptance keeps the preview reversible and never saves it', async ({ page }) => {
  const { office, saves } = await setup(page, { denyAccept: true });
  await chooseMode(page, 'Write');
  await office.click();
  await office.press('End');
  await page.locator('.dl-ai-composer-input').fill('Draft content');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Accept preview', exact: true }).click();
  await expect(page.getByText('You cannot edit this document.', { exact: true })).toBeVisible();
  expect(saves()).toBe(0);
  await page
    .frameLocator('iframe[title="Wordcraft"]')
    .getByRole('button', { name: 'Discard AI text' })
    .click();
  await expect(office).toHaveValue('Original text');
});
