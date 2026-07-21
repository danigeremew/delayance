import { test, expect } from '@playwright/test';

test.describe('UI smoke', () => {
  test('login page renders', async ({ page }) => {
    test.skip(
      process.env.PLAYWRIGHT_SKIP_UI === '1',
      'UI smoke skipped when PLAYWRIGHT_SKIP_UI=1',
    );
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in|login|delayance/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
