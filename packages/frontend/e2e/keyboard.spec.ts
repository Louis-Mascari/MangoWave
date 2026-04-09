import { test, expect } from './fixtures/base';
import { installAudioMocks } from './fixtures/audio-mock';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ app }) => {
    await app.addInitScript(installAudioMocks());
    await app.goto('/');

    // Start visualizer
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click({ force: true });

    // Wait for toolbar and preset to load
    await expect(app.locator('[role="toolbar"]')).toBeVisible({ timeout: 15000 });
    await expect(app.locator('[data-testid="preset-name"]')).toBeVisible({ timeout: 10000 });
  });

  test('? opens ShortcutOverlay, Escape closes it', async ({ app }) => {
    await app.keyboard.press('?');

    const overlay = app.locator('[role="dialog"][aria-label*="Shortcut" i]');
    await expect(overlay).toBeVisible({ timeout: 5000 });

    await app.keyboard.press('Escape');
    await expect(overlay).not.toBeVisible();
  });

  test('H also opens ShortcutOverlay', async ({ app }) => {
    await app.keyboard.press('h');

    const overlay = app.locator('[role="dialog"][aria-label*="Shortcut" i]');
    await expect(overlay).toBeVisible({ timeout: 5000 });
  });

  test('Space triggers next preset', async ({ app }) => {
    const presetName = app.locator('[data-testid="preset-name"]');
    const initial = await presetName.textContent();

    // Press space multiple times — presets are random, one press might pick the same one.
    // 15s timeout: preset loading (WASM init for 832 presets) can be slow on CI.
    await expect(async () => {
      await app.keyboard.press('Space');
      await app.waitForTimeout(500);
      const current = await presetName.textContent();
      expect(current).not.toBe(initial);
    }).toPass({ timeout: 15000 });
  });

  test('N triggers next preset', async ({ app }) => {
    const presetName = app.locator('[data-testid="preset-name"]');
    const initial = await presetName.textContent();

    await expect(async () => {
      await app.keyboard.press('n');
      await app.waitForTimeout(500);
      const current = await presetName.textContent();
      expect(current).not.toBe(initial);
    }).toPass({ timeout: 15000 });
  });

  test('A toggles autopilot (toast appears)', async ({ app }) => {
    await expect(async () => {
      await app.keyboard.press('a');
      const toastContent = app.locator('[role="status"] > div');
      await expect(toastContent).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 10000 });
  });

  test('S toggles favorite (toast appears)', async ({ app }) => {
    await expect(async () => {
      await app.keyboard.press('s');
      const toastContent = app.locator('[role="status"] > div');
      await expect(toastContent).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 10000 });
  });

  test('shortcuts are suppressed when focused in search input', async ({ app }) => {
    // Open preset browser
    await app.mouse.move(400, 700);
    await app.getByRole('button', { name: /Presets/ }).click({ force: true });

    // Focus the search input
    const searchInput = app.locator('input[placeholder*="Search"]');
    await searchInput.click();
    await searchInput.fill('');

    // Type "n" — should type in search input, NOT trigger next preset
    await app.keyboard.type('n');
    await expect(searchInput).toHaveValue('n');

    // Type "?" — should type in search input, NOT open shortcuts overlay
    await app.keyboard.type('?');
    await expect(searchInput).toHaveValue('n?');
    await expect(app.locator('[role="dialog"][aria-label*="Shortcut" i]')).not.toBeVisible();
  });
});
