import { test, expect } from './fixtures/base';
import { installAudioMocks } from './fixtures/audio-mock';

// Mobile viewport, user agent, and touch are set by the mobile-chrome / mobile-safari
// projects in playwright.config.ts (Pixel 7 / iPhone 14 device profiles).

test.describe('Mobile UI', () => {
  test.beforeEach(async ({ app }) => {
    await app.addInitScript(installAudioMocks());
    await app.goto('/');

    // On mobile, start screen shows differently — start via microphone (simpler flow)
    await app.getByRole('button', { name: /Use Microphone/ }).click();
    await app.getByRole('button', { name: /Start Microphone/ }).click();

    // Wait for FAB to appear (the mobile control bar)
    await expect(app.getByLabel(/Open menu/i)).toBeVisible({ timeout: 15000 });
  });

  test('FAB button is visible', async ({ app }) => {
    await expect(app.getByLabel(/Open menu/i)).toBeVisible();
  });

  test('clicking FAB opens radial menu with items', async ({ app }) => {
    await app.getByLabel(/Open menu/i).click();

    // Should show Close menu now
    await expect(app.getByLabel(/Close menu/i)).toBeVisible();

    // Wait for radial items to animate in
    await app.waitForTimeout(500);

    // Check that multiple radial action buttons are visible
    // The radial menu has items like Next, Settings, Presets, etc.
    const buttons = app.locator('button').filter({ hasText: /.+/ });
    const count = await buttons.count();
    expect(count).toBeGreaterThan(3);
  });

  test('radial menu: next preset triggers action', async ({ app }) => {
    const presetName = app.locator('[data-testid="preset-name"]');
    await expect(presetName).toBeVisible({ timeout: 10000 });
    const initial = await presetName.textContent();

    // Try pressing next via radial menu — retry because random preset might pick the same one
    await expect(async () => {
      // Reset idle timer so FAB is visible, then force-click the FAB —
      // the fullscreen WebGL canvas intercepts pointer events in headless Chrome hit-testing
      // even though the FAB has a higher z-index.
      await app.locator('canvas').tap({ position: { x: 10, y: 10 } });
      await app.waitForTimeout(200);

      // Open FAB if not already open
      const openMenu = app.getByLabel(/Open menu/i);
      if (await openMenu.isVisible()) {
        await openMenu.click({ force: true });
        await app.waitForTimeout(400);
      }

      await app.getByLabel('Next', { exact: true }).click({ force: true });

      // Wait for the preset name to actually update rather than a fixed timeout —
      // on slow CI runners 300ms was not always enough for the transition to commit
      await expect(presetName).not.toHaveText(initial ?? '', { timeout: 2000 });
    }).toPass({ timeout: 20000 });
  });

  test('radial menu: Presets item opens modal panel', async ({ app }) => {
    // Reset idle timer so FAB is visible, then force-click — the fullscreen WebGL canvas
    // intercepts pointer events in headless Chrome hit-testing despite the FAB's higher z-index.
    await app.locator('canvas').tap({ position: { x: 10, y: 10 } });
    await app.waitForTimeout(200);
    await app.getByLabel(/Open menu/i).click({ force: true });
    await app.waitForTimeout(500);

    // Click the Presets radial item — use exact match to avoid hitting other "preset" elements
    await app.getByLabel('Presets', { exact: true }).click({ force: true });

    // Should open a modal/dialog with preset browser content
    await expect(app.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('radial menu: Settings item opens modal panel', async ({ app }) => {
    // Reset idle timer so FAB is visible, then force-click — the fullscreen WebGL canvas
    // intercepts pointer events in headless Chrome hit-testing despite the FAB's higher z-index.
    await app.locator('canvas').tap({ position: { x: 10, y: 10 } });
    await app.waitForTimeout(200);
    await app.getByLabel(/Open menu/i).click({ force: true });
    await app.waitForTimeout(500);

    // Click the Settings radial item
    const settingsButton = app.getByLabel(/Setting/i).first();
    await settingsButton.click({ force: true });

    // Should open a modal/dialog with settings content
    await expect(app.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5000 });
  });
});
