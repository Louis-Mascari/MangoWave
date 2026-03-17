import { test as base, type Page } from '@playwright/test';

/**
 * Custom test fixture that:
 * - Clears localStorage before each test (state isolation)
 * - Pre-sets onboardingShown to skip the onboarding overlay
 * - Pre-sets enabledPacks so presets work without opening PresetBrowser first
 *
 * addInitScript runs before any page script, so localStorage operations
 * execute before Zustand stores hydrate from localStorage.
 */
export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.clear();

      // Seed the settings store with fields needed for tests to work.
      // - onboardingShown: skip the onboarding overlay
      // - enabledPacks: all packs enabled (normally initialized by PresetBrowser on first open,
      //   but tests that use keyboard shortcuts or next-preset need them before that)
      // - version must match the current Zustand persist migration version (6)
      const settings = {
        state: {
          onboardingShown: true,
          enabledPacks: ['Minimal', 'Non-Minimal', 'Extra', 'Extra 2', 'MD1'],
        },
        version: 6,
      };
      localStorage.setItem('mangowave-settings', JSON.stringify(settings));
    });

    await use(page);
  },
});

export { expect } from '@playwright/test';
