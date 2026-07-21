import { defineConfig, devices } from '@playwright/test';

const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: WEB,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  metadata: { apiUrl: API },
});
