import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';

test('creates a project without AI setup', async ({ page }) => {
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'writer@example.test',
    name: 'Ava Writer',
  };
  await page.route(`${API}/auth/refresh`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'test-token', expiresIn: 300, user }),
    }),
  );
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    }),
  );
  await page.route(`${API}/projects`, (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({
        name: 'Gemini project',
        description: 'A brief',
      });
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Gemini project',
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route(`${API}/projects/00000000-0000-4000-8000-000000000002**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/projects/00000000-0000-4000-8000-000000000002') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ name: 'Gemini project', role: 'owner' }),
      });
    }
    if (path.endsWith('/office/session')) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Editor not needed for this project creation test' }),
      });
    }
    const body = path.endsWith('/documents')
      ? route.request().method() === 'POST'
        ? { id: '00000000-0000-4000-8000-000000000003', title: 'Untitled document' }
        : []
      : path.endsWith('/documents/00000000-0000-4000-8000-000000000003')
        ? { title: 'Untitled document' }
        : path.endsWith('/ai-settings')
          ? { provider: 'gemini', model: 'gemini-3.8-flash', policy: 'any', hasApiKey: false }
          : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Create new project' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create project' })).toBeVisible();
  await expect(page.getByText('AI setup')).toHaveCount(0);
  await expect(page.getByText('Ollama')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Project name' }).fill('Gemini project');
  await page.getByRole('textbox', { name: 'Description (optional)' }).fill('A brief');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/00000000-0000-4000-8000-000000000002$/);
  await expect(page.getByText('No documents in this project yet.')).toBeVisible();
  await page.getByRole('button', { name: '+ New Doc', exact: true }).click();
  await expect(page).toHaveURL(
    /\/projects\/00000000-0000-4000-8000-000000000002\/documents\/00000000-0000-4000-8000-000000000003$/,
  );
  await expect(page.getByRole('heading', { name: 'Gemini project', exact: true })).toBeVisible();
});
