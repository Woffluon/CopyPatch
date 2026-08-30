import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/docs-e2e',
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'pnpm --filter site run build && pnpm --filter site exec astro preview --port 4321 --host 127.0.0.1',
    url: 'http://127.0.0.1:4321/docs',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
