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
 * Click a toolbar button reliably. On CI, the fullscreen canvas intercepts
 * pointer events even when the toolbar is interactive (canvas is geometrically
 * on top). Using `dispatchEvent('click')` bypasses browser hit-testing entirely
 * — the event fires directly on the button element.
 *
 * Before dispatching, we move the mouse to reset the idle timer and wait for
 * the toolbar wrapper to drop `pointer-events-none` (so the button is actually
 * wired up to handle the click in React's event system).
 */
export async function clickToolbarButton(app: Page, name: RegExp | string): Promise<void> {
  // Move mouse to toolbar area to reset the idle timer
  await app.mouse.move(400, 700);
  // Wait for toolbar wrapper to become interactive (React re-render removes
  // pointer-events-none after the idle timer reset from the mouse move above).
  // Timeout after 10s to avoid hanging the full test timeout.
  await app
    .locator('[role="toolbar"]')
    .locator('..')
    .evaluate((el) => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('toolbar still has pointer-events-none')),
          10000,
        );
        const check = () => {
          if (!el.classList.contains('pointer-events-none')) {
            clearTimeout(timeout);
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });
    });
  // Use dispatchEvent to bypass canvas hit-test interception on CI
  await app.getByRole('button', { name }).dispatchEvent('click');
}
