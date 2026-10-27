# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: wordcraft.spec.ts >> prefetches during editor startup and rechecks the saved version before opening
- Location: e2e/wordcraft.spec.ts:382:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e4]:
      - link "Delayance" [ref=e5] [cursor=pointer]:
        - /url: /projects
        - img "Delayance" [ref=e7]
      - generic [ref=e9]:
        - heading "Project" [level=1] [ref=e11]
        - generic [ref=e12]: loading
      - generic [ref=e13]:
        - button "Save" [disabled] [ref=e14]
        - button "Undo" [disabled] [ref=e15]: ↶
        - button "Redo" [disabled] [ref=e16]: ↷
        - button "Search commands" [disabled] [ref=e17]
        - button "Tools" [ref=e18] [cursor=pointer]
        - button "AI" [ref=e19] [cursor=pointer]
  - generic [ref=e20]:
    - main "Document workspace":
      - generic:
        - generic:
          - group "Document toolbar loading":
            - generic:
              - button "File" [disabled]
              - button "Home" [disabled]
              - button "Insert" [disabled]
              - button "Draw" [disabled]
              - button "Design" [disabled]
              - button "Layout" [disabled]
              - button "References" [disabled]
              - button "Mailings" [disabled]
              - button "Review" [disabled]
              - button "View" [disabled]
              - button "Developer" [disabled]
              - button "Zotero" [disabled]
              - button "Help" [disabled]
            - generic:
              - generic:
                - button "Paste" [disabled]:
                  - img
                  - text: Paste
                - generic:
                  - button "Cut" [disabled]
                  - button "Copy" [disabled]
                  - button "Format" [disabled]
                - generic: Clipboard
              - generic:
                - generic:
                  - combobox "Font" [disabled]:
                    - option "Font" [disabled] [selected]
                  - combobox "Font size" [disabled]:
                    - option "Size" [disabled] [selected]
                - generic:
                  - button "B" [disabled]
                  - button "I" [disabled]
                  - button "U" [disabled]
                  - button "abc" [disabled]
                  - button "x₂" [disabled]
                  - button "x²" [disabled]
                  - button "A" [disabled]
                - generic: Font
              - generic:
                - generic:
                  - button "Bullets" [disabled]:
                    - img
                  - button "Numbering" [disabled]:
                    - img
                  - button "Align left" [disabled]:
                    - img
                  - button "Center" [disabled]:
                    - img
                  - button "Align right" [disabled]:
                    - img
                  - button "Justify" [disabled]:
                    - img
                - generic: Paragraph
              - generic:
                - button "AaBbCcDd Normal" [disabled]:
                  - generic: AaBbCcDd
                  - text: Normal
                - button "AaBbCcDd No Spacing" [disabled]:
                  - generic: AaBbCcDd
                  - text: No Spacing
                - button "AaBbCcDd Heading 1" [disabled]:
                  - generic: AaBbCcDd
                  - text: Heading 1
                - button "AaBbCcDd Heading 2" [disabled]:
                  - generic: AaBbCcDd
                  - text: Heading 2
                - generic: Styles
              - generic:
                - generic:
                  - button "Find" [disabled]
                  - button "Replace" [disabled]
                  - button "Select" [disabled]
                - generic: Editing
          - generic:
            - generic:
              - status: Loading Wordcraft…
```

# Test source

```ts
  304 |   const stale = await command(page, 'replace', {
  305 |     handle: old.result?.handle,
  306 |     text: 'Wrong replacement',
  307 |   });
  308 |   expect(stale.ok).toBe(false);
  309 |   expect(stale.error).toContain('document changed');
  310 |   const current = await command(page, 'selection');
  311 |   expect(
  312 |     (
  313 |       await command(page, 'replace', {
  314 |         handle: current.result?.handle,
  315 |         text: 'Wordcraft replacement',
  316 |       })
  317 |     ).ok,
  318 |   ).toBe(true);
  319 |   await expect(page.locator('.dl-app-brand img')).toBeVisible();
  320 |   await expect(page.locator('.dl-app-brand')).toHaveText('');
  321 |   await expect(page.locator('.dl-app-topbar-back, .dl-doc-icon')).toHaveCount(0);
  322 |   await expect(page.locator('.dl-app-topbar-status')).toHaveCount(0);
  323 |   await page.getByRole('button', { name: 'Save', exact: true }).click();
  324 |   await expect.poll(data.saves).toBe(1);
  325 |   await expect(page.locator('.dl-app-topbar-status')).toHaveText('saved');
  326 |   const saved = await JSZip.loadAsync(data.bytes());
  327 |   const xml = await saved.file('word/document.xml')?.async('string');
  328 |   expect(xml).toContain('Wordcraft replacement');
  329 |   expect(xml).toMatch(/<w:b(?:\s|\/|>)/);
  330 |   await expect(page.getByLabel('Document editor')).toHaveCount(0);
  331 |   await page.getByRole('link', { name: 'Delayance', exact: true }).click();
  332 |   await expect.poll(data.lock).toBe(null);
  333 | });
  334 | 
  335 | test('real Wordcraft applies an AI rewrite only after preview and acceptance', async ({ page }) => {
  336 |   test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  337 |   const data = await fixture(page);
  338 |   await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
  339 |     timeout: 90000,
  340 |   });
  341 |   expect((await command(page, 'command', { command: 'select.all' })).ok).toBe(true);
  342 |   await page.locator('.dl-ai-composer-pills button').first().click();
  343 |   await page
  344 |     .getByRole('option')
  345 |     .filter({ has: page.locator('.dl-ai-menu-label', { hasText: 'Edit' }) })
  346 |     .click();
  347 |   await page.locator('.dl-ai-composer-input').fill('Rewrite selected text');
  348 |   await page.getByRole('button', { name: 'Send', exact: true }).click();
  349 |   await expect(
  350 |     page.getByText('Preview highlighted in the document.', { exact: false }),
  351 |   ).toBeVisible();
  352 |   expect(data.saves()).toBe(0);
  353 |   const saved = await JSZip.loadAsync(data.bytes());
  354 |   expect(await saved.file('word/document.xml')!.async('string')).toContain('Original text');
  355 |   const controls = await page.evaluate(() => window.wordcraftTestLayout?.preview);
  356 |   expect(controls?.id).toBe('proposal');
  357 |   expect((await command(page, 'command', { command: 'edit.undo' })).ok).toBe(false);
  358 |   await page.screenshot({ path: '../../output/playwright/inline-ai-preview.png' });
  359 |   const box = await page.locator('iframe[title="Wordcraft"]').boundingBox();
  360 |   const accept = controls!.accept;
  361 |   await page.mouse.click(
  362 |     box!.x + accept.x + accept.width / 2,
  363 |     box!.y + accept.y + accept.height / 2,
  364 |   );
  365 |   await expect(page.getByText('Applied to document', { exact: true })).toBeVisible();
  366 |   expect(data.saves()).toBe(1);
  367 | });
  368 | 
  369 | test('rejects an outdated editor before acquiring a WOPI lock', async ({ page }) => {
  370 |   await page.route('**/wordcraft/index.html*', (route) =>
  371 |     route.fulfill({
  372 |       contentType: 'text/html',
  373 |       body: `<script>parent.postMessage(JSON.stringify({MessageId:'App_LoadingStatus',Values:{Status:'Frame_Ready'}}),location.origin)</script>`,
  374 |     }),
  375 |   );
  376 |   const data = await fixture(page);
  377 |   await expect(page.getByRole('alert').filter({ hasText: 'needs rebuilding' })).toBeVisible();
  378 |   expect(data.lock()).toBe(null);
  379 |   await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  380 | });
  381 | 
  382 | test('prefetches during editor startup and rechecks the saved version before opening', async ({
  383 |   page,
  384 | }) => {
  385 |   test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  386 |   let releaseWasm: () => void = () => {};
  387 |   const wasmGate = new Promise<void>((resolve) => {
  388 |     releaseWasm = resolve;
  389 |   });
  390 |   let initialBytes: Buffer | undefined;
  391 |   page.on('requestfinished', async (request) => {
  392 |     if (
  393 |       request.method() === 'GET' &&
  394 |       new URL(request.url()).pathname === `/wopi/files/${documentId}/contents`
  395 |     )
  396 |       initialBytes = await (await request.response())?.body();
  397 |   });
  398 |   await page.route('**/wordcraft/wordcraft_bg.wasm', async (route) => {
  399 |     await wasmGate;
  400 |     await route.fallback();
  401 |   });
  402 |   const opening = fixture(page);
  403 |   try {
> 404 |     await expect.poll(() => initialBytes !== undefined).toBe(true);
      |                                                         ^ Error: expect(received).toBe(expected) // Object.is equality
  405 |     await expect(page.getByText('Loading Wordcraft…', { exact: true })).toBeVisible();
  406 |     const shell = page.getByTestId('editor-loading-shell');
  407 |     await expect(shell).toBeVisible();
  408 |     await expect(shell.getByRole('button', { name: 'Home', exact: true })).toBeDisabled();
  409 |     await expect(shell.getByLabel('Font', { exact: true })).toBeDisabled();
  410 |     await expect(shell.locator('.dl-editor-startup-page')).toBeVisible();
  411 |     await page.screenshot({ path: '../../output/playwright/editor-startup-shell.png' });
  412 |     const updated = await JSZip.loadAsync(initialBytes!);
  413 |     const xml = await updated.file('word/document.xml')!.async('string');
  414 |     updated.file('word/document.xml', xml.replace('Original text', 'Latest saved text'));
  415 |     const bytes = await updated.generateAsync({ type: 'nodebuffer' });
  416 |     await page.route(`${API}/wopi/files/${documentId}*`, (route) => {
  417 |       if (route.request().method() !== 'GET') return route.fallback();
  418 |       return route.fulfill({
  419 |         contentType: 'application/json',
  420 |         body: JSON.stringify({ Version: `2:${createHash('sha256').update(bytes).digest('hex')}` }),
  421 |       });
  422 |     });
  423 |     await page.route(`${API}/wopi/files/${documentId}/contents*`, (route) =>
  424 |       route.fulfill({ contentType: 'application/octet-stream', body: bytes }),
  425 |     );
  426 |   } finally {
  427 |     releaseWasm();
  428 |     await opening;
  429 |   }
  430 |   await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
  431 |     timeout: 90000,
  432 |   });
  433 |   expect((await command(page, 'command', { command: 'select.all' })).ok).toBe(true);
  434 |   expect((await command(page, 'selection')).result?.text).toBe('Latest saved text');
  435 |   await expect(page.getByTestId('editor-loading-shell')).toHaveCount(0);
  436 | });
  437 | 
  438 | test('keeps the ribbon light when the operating system switches to dark mode', async ({ page }) => {
  439 |   test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  440 |   await page.emulateMedia({ colorScheme: 'light' });
  441 |   await fixture(page);
  442 |   await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
  443 |     timeout: 90000,
  444 |   });
  445 |   await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(380);
  446 |   const frame = page.locator('iframe[title="Wordcraft"]');
  447 |   const bounds = (await frame.boundingBox())!;
  448 |   const layout = await page.evaluate(() => window.wordcraftTestLayout!);
  449 |   const clip = { x: bounds.x, y: bounds.y, width: bounds.width, height: layout.top };
  450 |   const toolbarHash = async () =>
  451 |     createHash('sha256')
  452 |       .update(await page.screenshot({ clip }))
  453 |       .digest('hex');
  454 |   await page.screenshot({ path: '../../output/playwright/toolbar-light-system.png' });
  455 |   const light = await toolbarHash();
  456 |   await page.emulateMedia({ colorScheme: 'dark' });
  457 |   await page.screenshot({ path: '../../output/playwright/toolbar-dark-system.png' });
  458 |   await expect.poll(toolbarHash).toBe(light);
  459 |   await page.reload();
  460 |   await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
  461 |     timeout: 90000,
  462 |   });
  463 |   await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(380);
  464 |   await expect.poll(toolbarHash).toBe(light);
  465 |   await page.screenshot({ path: '../../output/playwright/toolbar-dark-system.png' });
  466 | });
  467 | 
  468 | test('real integrated chrome preserves the editor across resizing and layers File/search above panels', async ({
  469 |   page,
  470 | }) => {
  471 |   test.skip(!built, 'Run pnpm wordcraft:build to exercise the real Rust/WASM editor.');
  472 |   const data = await fixture(page);
  473 |   await expect(page.getByText('Loading Wordcraft…', { exact: true })).toHaveCount(0, {
  474 |     timeout: 90000,
  475 |   });
  476 |   await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(380);
  477 |   const original = await page.evaluate(() => window.wordcraftTestLayout!);
  478 |   expect(original.width).toBe(1440);
  479 |   expect(original.center.width).toBe(660);
  480 |   const tools = page.getByRole('complementary', { name: 'Document tools', exact: true });
  481 |   const assistant = page.getByRole('complementary', { name: 'AI assistant', exact: true });
  482 |   const frame = page.locator('iframe[title="Wordcraft"]');
  483 |   const bounds = (await frame.boundingBox())!;
  484 |   expect((await tools.boundingBox())!.y).toBeCloseTo(bounds.y + original.top, 0);
  485 |   expect((await assistant.boundingBox())!.y).toBeCloseTo(bounds.y + original.top, 0);
  486 |   await page.screenshot({ path: path.resolve('../../output/playwright/integrated-workspace.png') });
  487 | 
  488 |   expect((await command(page, 'command', { command: 'select.all' })).ok).toBe(true);
  489 |   const selection = await command(page, 'selection');
  490 |   const lock = data.lock();
  491 |   await page.getByRole('button', { name: 'Tools', exact: true }).click();
  492 |   await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(0);
  493 |   await page.getByRole('button', { name: 'Tools', exact: true }).click();
  494 |   await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(380);
  495 |   const resize = page.getByRole('separator', { name: 'Resize left sidebar' });
  496 |   await resize.hover({ position: { x: 2, y: 100 } });
  497 |   const handle = (await resize.boundingBox())!;
  498 |   await page.mouse.move(handle.x + 2, handle.y + 100);
  499 |   await page.mouse.down();
  500 |   await page.mouse.move(handle.x + 42, handle.y + 100, { steps: 4 });
  501 |   await page.mouse.up();
  502 |   await expect.poll(() => page.evaluate(() => window.wordcraftTestLayout?.center.x)).toBe(420);
  503 |   await page.setViewportSize({ width: 900, height: 900 });
  504 |   await expect(assistant).toHaveCount(0);
```