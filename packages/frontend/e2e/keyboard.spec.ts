import { test, expect, clickToolbarButton } from './fixtures/base';
import type { Page } from '@playwright/test';
import { installAudioMocks } from './fixtures/audio-mock';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ app }) => {
    await app.addInitScript(installAudioMocks());
    await app.goto('/');

    // Start visualizer
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click({ force: true });

    // Wait for toolbar and preset to load
    await expect(app.locator('[role="toolbar"]')).toBeVisible({ timeout: 15000 });
    await expect(app.locator('[data-testid="preset-name"]')).toBeVisible({ timeout: 15000 });

    // Clear focus from any button so keyboard shortcuts go to the global handler,
    // not to a focused button (Space on a focused button activates it instead).
    await app.locator('body').click();
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
    // Open preset browser — use clickToolbarButton to reset idle timer
    await clickToolbarButton(app, /Presets/);

    // Wait for search input to be visible before interacting
    const searchInput = app.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
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

  test('Q does not open the queue for system audio (local files only)', async ({ app }) => {
    await app.keyboard.press('q');

    // Open the overlay afterwards to prove the keypress was handled before asserting absence
    await app.keyboard.press('?');
    await expect(app.locator('[role="dialog"][aria-label*="Shortcut" i]')).toBeVisible({
      timeout: 5000,
    });
    await expect(app.getByRole('button', { name: 'Close queue' })).toHaveCount(0);
  });
});

test.describe('Keyboard Shortcuts (mode gating)', () => {
  const startLocalPlayback = async (app: Page) => {
    await app.getByRole('button', { name: /Play Local Files/ }).click();
    await app
      .locator('input[type="file"]')
      .setInputFiles(path.resolve(__dirname, 'fixtures/test-silence.mp3'));
    await expect(app.locator('[role="toolbar"]')).toBeVisible({ timeout: 15000 });
    await expect(app.locator('[data-testid="preset-name"]')).toBeVisible({ timeout: 15000 });
  };

  test.beforeEach(async ({ app }) => {
    await app.goto('/');
  });

  test('Q toggles the queue', async ({ app }) => {
    await startLocalPlayback(app);
    await app.locator('body').click();
    const addFiles = app.getByRole('button', { name: 'Add Files', exact: true });

    await app.keyboard.press('q');
    await expect(addFiles).toBeVisible({ timeout: 5000 });

    await app.keyboard.press('q');
    await expect(addFiles).toHaveCount(0);
  });

  test('A on the start screen does not toggle autopilot', async ({ app }) => {
    await expect(app.locator('[data-testid="start-screen"]')).toBeVisible();
    const readAutopilot = () =>
      app.evaluate(
        () => JSON.parse(localStorage.getItem('mangowave-settings') ?? '{}').state?.autopilot,
      );

    const before = await readAutopilot();
    await app.keyboard.press('a');
    expect(await readAutopilot()).toEqual(before);
  });
});
