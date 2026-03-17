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

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
