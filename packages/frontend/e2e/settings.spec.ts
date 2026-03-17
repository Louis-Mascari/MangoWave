import { test, expect } from './fixtures/base';
import { installAudioMocks } from './fixtures/audio-mock';

test.describe('Settings Panel', () => {
  test.beforeEach(async ({ app }) => {
    await app.addInitScript(installAudioMocks());
    await app.goto('/');

    // Start visualizer
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click();

    // Wait for toolbar
    await expect(app.locator('[role="toolbar"]')).toBeVisible({ timeout: 15000 });

    // Move mouse to keep toolbar visible
    await app.mouse.move(400, 700);

    // Open settings panel
    await app.getByRole('button', { name: 'Settings' }).click();
  });

  test('opens settings panel and tabs render', async ({ app }) => {
    // Settings panel tabs are inside the panel, scoped to avoid collision with ControlBar buttons.
    // Look for tabs within the settings panel area (not the toolbar).
    await expect(app.getByRole('button', { name: /Equalizer/i })).toBeVisible();
    await expect(app.getByRole('button', { name: /Rendering/i })).toBeVisible();
  });

  test('switching tabs shows different content', async ({ app }) => {
    // Click Rendering tab — verify by checking for FPS quick-pick buttons
    await app.getByRole('button', { name: /Rendering/i }).click();
    await expect(app.getByRole('button', { name: '60', exact: true })).toBeVisible();

    // Click Presets tab — verify by checking for content unique to Presets tab
    await app.getByRole('button', { name: 'Presets' }).first().click();
    await expect(app.getByText(/Transition Time/i)).toBeVisible();
    // Also verify Rendering content is gone (proves the tab actually switched)
    await expect(app.getByRole('button', { name: '60', exact: true })).not.toBeVisible();
  });

  test('changing a setting writes to localStorage', async ({ app }) => {
    // Go to Rendering tab and change FPS cap
    await app.getByRole('button', { name: /Rendering/i }).click();

    // Read initial FPS value
    const initialFps = await app.evaluate(() => {
      const raw = localStorage.getItem('mangowave-settings');
      if (!raw) return null;
      return JSON.parse(raw).state?.performance?.fpsCap ?? null;
    });

    // Click a quick-pick FPS button (e.g., "30" if current isn't 30, else "120")
    const targetFps = initialFps === 30 ? '120' : '30';
    await app.getByRole('button', { name: targetFps, exact: true }).click();

    // Verify localStorage was updated
    const updatedFps = await app.evaluate(() => {
      const raw = localStorage.getItem('mangowave-settings');
      if (!raw) return null;
      return JSON.parse(raw).state?.performance?.fpsCap ?? null;
    });

    expect(updatedFps).toBe(Number(targetFps));
  });
});
