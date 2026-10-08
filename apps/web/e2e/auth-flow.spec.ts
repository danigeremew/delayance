import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';

test.describe('Dedicated authentication pages', () => {
  test('opens login from the root when there is no session', async ({ page }) => {
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    );
    await page.route(`${API}/auth/refresh`, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    );
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('AI document workspace')).toHaveCount(0);
  });
  test('opens projects from the root after refreshing a valid session', async ({ page }) => {
    const user = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'writer@example.test',
      name: 'Ava Writer',
    };
    await page.route(`${API}/auth/me`, (route) => {
      if (route.request().headers().authorization === 'Bearer refreshed-access-token')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(user),
        });
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    });
    await page.route(`${API}/auth/refresh`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'refreshed-access-token', expiresIn: 300, user }),
      }),
    );
    await page.route(`${API}/projects`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects$/, { timeout: 15_000 });
    await expect(page.getByText('AI document workspace')).toHaveCount(0);
  });
  test('redirects an unauthenticated user to login', async ({ page }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login/);
  });
  test('waits for session restoration before loading the dashboard projects', async ({ page }) => {
    const user = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'writer@example.test',
      name: 'Ava Writer',
    };
    let releaseRefresh: () => void = () => {};
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let projectRequests = 0;
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({
        status: route.request().headers().authorization === 'Bearer restored-token' ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );
    await page.route(`${API}/auth/refresh`, async (route) => {
      await refreshGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'restored-token' }),
      });
    });
    await page.route(`${API}/projects`, (route) => {
      projectRequests += 1;
      expect(route.request().headers().authorization).toBe('Bearer restored-token');
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.goto('/projects');
    await expect(page.getByRole('status')).toHaveText('Loading your workspace…');
    expect(projectRequests).toBe(0);
    releaseRefresh();
    await expect(page.getByRole('heading', { name: 'No projects yet', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
    await expect(page.locator('.dl-dashboard-error')).toHaveCount(0);
    expect(projectRequests).toBeGreaterThan(0);
  });
  test('shows the shared branded design and submits login credentials to the API', async ({
    page,
  }) => {
    let submitted = false;
    await page.route(`${API}/auth/login`, async (route) => {
      const body = route.request().postDataJSON() as { email: string; password: string };
      expect(body).toEqual({ email: 'writer@example.test', password: 'Example-1234!' });
      submitted = true;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Document Workspace' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Email' }).fill('writer@example.test');
    await page.getByRole('textbox', { name: 'Password' }).fill('Example-1234!');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('.auth-message[role=alert]')).toHaveText('Invalid email or password');
    expect(submitted).toBe(true);
  });
  test('validates signup confirmation and posts the complete account form', async ({ page }) => {
    let submitted = false;
    await page.route(`${API}/auth/register`, async (route) => {
      const body = route.request().postDataJSON() as Record<string, string>;
      expect(body).toEqual({
        email: 'writer@example.test',
        firstName: 'Ava',
        lastName: 'Writer',
        password: 'Example-1234!',
        confirmPassword: 'Example-1234!',
      });
      submitted = true;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'An account with this email already exists' }),
      });
    });
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Document Workspace' })).toBeVisible();
    await page.getByRole('textbox', { name: 'First name' }).fill('Ava');
    await page.getByRole('textbox', { name: 'Last name' }).fill('Writer');
    await page.getByRole('textbox', { name: 'Email' }).fill('writer@example.test');
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('Example-1234!');
    await page.getByRole('textbox', { name: 'Confirm password' }).fill('different');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.auth-message[role=alert]')).toHaveText('Passwords do not match');
    expect(submitted).toBe(false);
    await page.getByRole('textbox', { name: 'Confirm password' }).fill('Example-1234!');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.auth-message[role=alert]')).toContainText('already exists');
    expect(submitted).toBe(true);
  });
  test('requests recovery and submits a fragment token from the reset page', async ({ page }) => {
    await page.route(`${API}/auth/forgot-password`, async (route) => {
      expect((route.request().postDataJSON() as { email: string }).email).toBe(
        'writer@example.test',
      );
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'If an account exists, a reset link will be sent.' }),
      });
    });
    await page.route(`${API}/auth/reset-password`, async (route) => {
      const body = route.request().postDataJSON() as { token: string; password: string };
      expect(body.token).toBe('test-token');
      expect(body.password).toBe('New-Example-1234!');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Password updated.' }),
      });
    });
    await page.goto('/forgot-password');
    await page.getByRole('textbox', { name: 'Email' }).fill('writer@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If an account exists');
    await page.goto('/reset-password#token=test-token');
    await expect(page).not.toHaveURL(/token=/);
    await page.getByRole('textbox', { name: 'New password' }).fill('New-Example-1234!');
    await page.getByRole('textbox', { name: 'Confirm password' }).fill('New-Example-1234!');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('status')).toContainText('Password updated');
  });
  test('establishes an in-memory session after a successful API response', async ({ page }) => {
    const user = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'writer@example.test',
      name: 'Ava Writer',
    };
    await page.route(`${API}/auth/login`, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'test-access-token', expiresIn: 300, user }),
      });
    });
    await page.route(`${API}/projects`, async (route) => {
      expect(route.request().headers().authorization).toBe('Bearer test-access-token');
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill('writer@example.test');
    await page.getByRole('textbox', { name: 'Password' }).fill('Example-1234!');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/projects/);
  });
  test('keeps the form usable on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Document Workspace' })).toBeHidden();
  });
});
