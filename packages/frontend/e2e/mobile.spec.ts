import { type Page, type Locator } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { installAudioMocks } from './fixtures/audio-mock';

// Mobile viewport, user agent, and touch are set by the mobile-chrome / mobile-safari
// projects in playwright.config.ts (Pixel 7 / iPhone 14 device profiles).

/** Dispatch click on the overlay to reveal controls, then wait for justRevealed guard. */
async function revealControls(app: Page) {
  await app.locator('div[role="presentation"]').dispatchEvent('click');
  await app.waitForTimeout(500);
}

/** Get a locator scoped to the mobile control circle. */
function mobileButton(app: Page, label: string): Locator {
  return app.locator('[data-testid="mobile-circle"]').getByLabel(label, { exact: true });
}

/** Check that mobile controls are visible (opacity-100 on container). */
function expectControlsVisible(app: Page, timeout = 15000) {
  return expect(app.locator('[data-testid="mobile-circle"]')).toHaveClass(/opacity-100/, {
    timeout,
  });
}

/** Check that mobile controls are hidden (opacity-0 on container). */
function expectControlsHidden(app: Page, timeout = 10000) {
  return expect(app.locator('[data-testid="mobile-circle"]')).toHaveClass(/opacity-0/, {
    timeout,
  });
}

test.describe('Mobile UI', () => {
  test.beforeEach(async ({ app }) => {
    await app.addInitScript(installAudioMocks());
    await app.goto('/');

    await app.getByRole('button', { name: /Use Microphone/ }).click();
    await app.getByRole('button', { name: /Start Microphone/ }).click();

    // Wait for visualizer canvas + controls to appear.
    // Controls become visible after launch animation (~2.5s) calls resumeIdle.
    await app.waitForSelector('canvas', { timeout: 15000 });
    await expectControlsVisible(app);
  });

  test('controls are visible after launch', async ({ app }) => {
    // Re-reveal to ensure fresh idle timer — beforeEach may have consumed it
    await revealControls(app);
    await expect(mobileButton(app, 'Presets')).toBeVisible();
    await expect(mobileButton(app, 'Settings')).toBeVisible();
    await expect(mobileButton(app, 'Next')).toBeVisible();
  });

  test('controls hide after idle timeout', async ({ app }) => {
    // Re-reveal to reset the 5s idle timer with a known start time —
    // beforeEach may have consumed part of the timer already.
    await revealControls(app);
    await expectControlsVisible(app, 3000);
    // Idle timer is 5s — controls should fade out
    await expectControlsHidden(app);
  });

  test('tap hides visible controls', async ({ app }) => {
    // Tap the overlay to trigger forceIdle → controls fade out
    await app.locator('div[role="presentation"]').dispatchEvent('click');
    await expectControlsHidden(app, 3000);
  });

  test('next preset triggers action', async ({ app }) => {
    const presetName = app.locator('[data-testid="preset-name"]');
    await expect(presetName).toBeVisible({ timeout: 10000 });
    const initial = await presetName.textContent();

    await expect(async () => {
      // Re-reveal if controls have auto-hidden
      const isHidden = await app
        .locator('[data-testid="mobile-circle"]')
        .evaluate((el) => el.classList.contains('opacity-0'));
      if (isHidden) await revealControls(app);

      await mobileButton(app, 'Next').dispatchEvent('click');
      await expect(presetName).not.toHaveText(initial ?? '', { timeout: 2000 });
    }).toPass({ timeout: 20000 });
  });

  test('Presets button opens modal panel', async ({ app }) => {
    // Re-reveal in case idle timer fired during beforeEach
    await revealControls(app);
    await mobileButton(app, 'Presets').dispatchEvent('click');
    await expect(app.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('Settings button opens modal panel', async ({ app }) => {
    // Re-reveal in case idle timer fired during beforeEach
    await revealControls(app);
    await mobileButton(app, 'Settings').dispatchEvent('click');
    await expect(app.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5000 });
  });
});
