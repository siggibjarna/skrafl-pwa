import { defineConfig, devices } from '@playwright/test';

const iPhone = devices['iPhone 16 Pro'];
if (!iPhone) throw new Error('The Playwright iPhone 16 Pro device profile is unavailable.');

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 2,
  reporter: 'list',
  use: {
    ...iPhone,
    browserName: 'webkit',
    viewport: { ...iPhone.viewport, height: 874 },
    baseURL: 'http://127.0.0.1:43921/skrafl-pwa/',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 43921 --strictPort',
    url: 'http://127.0.0.1:43921/skrafl-pwa/',
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
