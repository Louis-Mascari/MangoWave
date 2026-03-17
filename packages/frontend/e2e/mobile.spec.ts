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

    // Open FAB and tap next
    await app.getByLabel(/Open menu/i).click();
    await app.waitForTimeout(500);

    // Try pressing next multiple times to ensure preset changes
    await expect(async () => {
      const nextButton = app.getByLabel(/Next/i).first();
      await nextButton.click();
      await app.waitForTimeout(500);

      // Re-open menu if it closed
      const openMenu = app.getByLabel(/Open menu/i);
      if (await openMenu.isVisible()) {
        await openMenu.click();
        await app.waitForTimeout(500);
      }

      const current = await presetName.textContent();
      expect(current).not.toBe(initial);
    }).toPass({ timeout: 15000 });
  });

  test('radial menu: Presets item opens modal panel', async ({ app }) => {
    await app.getByLabel(/Open menu/i).click();
    await app.waitForTimeout(500);

    // Click the Presets radial item
    const presetsButton = app.getByLabel(/Preset/i).first();
    await presetsButton.click();

    // Should open a modal/dialog with preset browser content
    await expect(app.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('radial menu: Settings item opens modal panel', async ({ app }) => {
    await app.getByLabel(/Open menu/i).click();
    await app.waitForTimeout(500);

    // Click the Settings radial item
    const settingsButton = app.getByLabel(/Setting/i).first();
    await settingsButton.click();

    // Should open a modal/dialog with settings content
    await expect(app.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5000 });
  });
});
