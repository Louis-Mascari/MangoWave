import { test, expect } from './fixtures/base';
import { installAudioMocks } from './fixtures/audio-mock';

test.describe('Visualizer', () => {
  test.beforeEach(async ({ app }) => {
    await app.addInitScript(installAudioMocks());
  });

  test('system audio capture: start → ControlBar visible with preset name', async ({ app }) => {
    await app.goto('/');

    // Open Share Audio and start
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click();

    // Wait for the visualizer to be active — ControlBar (toolbar) should appear
    const toolbar = app.locator('[role="toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 15000 });

    // Preset name should be showing somewhere
    await expect(app.locator('[data-testid="preset-name"]')).toBeVisible({ timeout: 10000 });
  });

  test('autopilot: toggling changes preset after interval', async ({ app }) => {
    // Pre-seed settings with autopilot enabled at a very short interval.
    // This addInitScript runs after the base fixture's (which clears localStorage),
    // so it merges on top of the clean state.
    await app.addInitScript(() => {
      const raw = localStorage.getItem('mangowave-settings');
      const settings = raw ? JSON.parse(raw) : { state: {}, version: 6 };
      settings.state.autopilotEnabled = true;
      settings.state.autopilotInterval = 1;
      localStorage.setItem('mangowave-settings', JSON.stringify(settings));
    });

    await app.goto('/');

    // Start visualizer
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click();

    // Wait for toolbar and preset name
    await expect(app.locator('[role="toolbar"]')).toBeVisible({ timeout: 15000 });
    const presetName = app.locator('[data-testid="preset-name"]');
    await expect(presetName).toBeVisible({ timeout: 10000 });

    const initialPreset = await presetName.textContent();

    // Wait for autopilot to advance (interval is 1s, give buffer for randomness)
    await expect(async () => {
      const current = await presetName.textContent();
      expect(current).not.toBe(initialPreset);
    }).toPass({ timeout: 15000 });
  });
});
