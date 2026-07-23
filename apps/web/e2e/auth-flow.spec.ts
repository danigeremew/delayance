import { test, expect } from '@playwright/test';

test.describe('Authentication and User Account Flow', () => {
  test('redirects unauthenticated user from protected route to login', async ({ page }) => {
    test.skip(
      process.env.PLAYWRIGHT_SKIP_UI === '1',
      'UI smoke skipped when PLAYWRIGHT_SKIP_UI=1',
    );
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login/);
  });

  test('registers account, updates profile, and signs out', async ({ page }) => {
    test.skip(
      process.env.PLAYWRIGHT_SKIP_UI === '1',
      'UI smoke skipped when PLAYWRIGHT_SKIP_UI=1',
    );

    const testEmail = `auth_e2e_${Date.now()}@example.com`;
    const testName = 'E2E Test User';

    // 1. Go to register
    await page.goto('/register');
    await page.getByLabel(/full name|name/i).fill(testName);
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /create account/i }).click();

    // 2. Expect redirect to projects page
    await expect(page).toHaveURL(/\/projects/, { timeout: 15_000 });

    // 3. Navigate to account settings page
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: /account settings/i })).toBeVisible({
      timeout: 10_000,
    });

    // 4. Update name
    const updatedName = 'E2E User Updated';
    await page.getByLabel(/full name/i).fill(updatedName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible();

    // 5. Sign out
    await page.getByRole('button', { name: /sign out of account/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
