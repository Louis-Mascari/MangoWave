import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  timeout: process.env.CI ? 60_000 : 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec/,
    },
    // CI: Firefox/WebKit run start-screen tests only (no WebGL 2 on headless runners).
    // Locally all 5 projects run the full suite with real GPU drivers.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      ...(process.env.CI ? { testMatch: /start-screen\.spec/ } : { testIgnore: /mobile\.spec/ }),
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      ...(process.env.CI ? { testMatch: /start-screen\.spec/ } : { testIgnore: /mobile\.spec/ }),
    },
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

  // CI tests the production bundle: the dev server transforms modules on first request,
  // which under two workers on a shared runner made unrelated tests time out at random.
  // It also means CI exercises the code that actually ships.
  webServer: process.env.CI
    ? {
        command: 'npx vite build && npx vite preview --port 5173 --strictPort',
        url: 'http://localhost:5173',
        reuseExistingServer: false,
        timeout: 180_000,
      }
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
      },
});
