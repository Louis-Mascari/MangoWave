import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    // CI: Chromium-only. Firefox/WebKit fail on headless CI runners due to missing
    // system-level WebGL 2 + audio backend support. All 5 projects work locally
    // with real GPU drivers — run `npx playwright test` locally for cross-browser.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec/,
    },
    ...(process.env.CI
      ? []
      : [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            testIgnore: /mobile\.spec/,
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            testIgnore: /mobile\.spec/,
          },
        ]),
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec/,
    },
    ...(process.env.CI
      ? []
      : [
          {
            name: 'mobile-safari',
            use: { ...devices['iPhone 14'] },
            testMatch: /mobile\.spec/,
          },
        ]),
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
