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
      // - version must match the current Zustand persist migration version (8)
      const settings = {
        state: {
          onboardingShown: true,
          enabledPacks: ['Minimal', 'Non-Minimal', 'Extra', 'Extra 2', 'MD1'],
          presetNameDisplay: 'always',
          customPacks: [],
          activeCustomPackId: null,
          // Disable auto quality in tests — on CI headless runners, the quality
          // monitor detects low FPS and steps down, resizing the canvas mid-test.
          // Canvas resizes cause it to intercept pointer events on toolbar buttons.
          // Must include ALL performance fields — Zustand persist shallow-merges the
          // top-level state, so a partial performance object would lose defaults
          // (resolutionScale=undefined → canvas 0×0).
          performance: {
            fpsCap: 60,
            resolutionScale: 1.0,
            meshWidth: 48,
            meshHeight: 36,
            textureRatio: 1.0,
            fxaa: false,
            autoQuality: false,
          },
        },
        version: 8,
      };
      localStorage.setItem('mangowave-settings', JSON.stringify(settings));
    });

    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Click a toolbar button reliably. The toolbar gets CSS `pointer-events-none`
 * when the idle timer fires, which prevents clicks from reaching buttons even
 * with Playwright's `force: true` (the browser's hit-testing respects CSS
 * pointer-events and routes the click to the canvas underneath).
 *
 * This helper moves the mouse to trigger the idle timer reset, waits for
 * React to re-render the toolbar without `pointer-events-none`, then clicks.
 */
export async function clickToolbarButton(app: Page, name: RegExp | string): Promise<void> {
  // Move mouse to toolbar area to reset the idle timer
  await app.mouse.move(400, 700);
  // Wait for toolbar wrapper to become interactive (React re-render removes
  // pointer-events-none after the idle timer reset from the mouse move above)
  await app
    .locator('[role="toolbar"]')
    .locator('..')
    .evaluate((el) => {
      return new Promise<void>((resolve) => {
        const check = () => {
          if (!el.classList.contains('pointer-events-none')) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });
    });
  await app.getByRole('button', { name }).click();
}
