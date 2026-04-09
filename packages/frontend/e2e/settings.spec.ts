import { test, expect } from './fixtures/base';
import { installAudioMocks } from './fixtures/audio-mock';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

test.describe('Settings Panel', () => {
  test.beforeEach(async ({ app }) => {
    await app.addInitScript(installAudioMocks());
    await app.goto('/');

    // Start visualizer
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click({ force: true });

    // Wait for toolbar
    await expect(app.locator('[role="toolbar"]')).toBeVisible({ timeout: 15000 });

    // Move mouse to keep toolbar visible
    await app.mouse.move(400, 700);

    // Open settings panel
    await app.getByRole('button', { name: 'Settings' }).click({ force: true });
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

  test('EQ tab renders sliders and pre-amp', async ({ app }) => {
    await app.getByRole('button', { name: /Equalizer/i }).click();

    // Pre-amp slider should be visible
    const preAmpSlider = app.locator('input[type="range"]').first();
    await expect(preAmpSlider).toBeVisible();

    // Should have multiple EQ band sliders (10 bands + 1 pre-amp = 11 total)
    const sliders = app.locator('input[type="range"]');
    await expect(sliders).toHaveCount(11);
  });

  test('EQ pre-amp change persists to localStorage', async ({ app }) => {
    await app.getByRole('button', { name: /Equalizer/i }).click();

    // The pre-amp slider is the horizontal one at the top (min=0, max=3, step=0.1)
    const preAmpSlider = app.locator('input[type="range"][min="0"][max="3"]');
    await expect(preAmpSlider).toBeVisible();

    // Change pre-amp value via fill (set to 2.0)
    await preAmpSlider.fill('2');

    // Verify localStorage updated
    const preAmp = await app.evaluate(() => {
      const raw = localStorage.getItem('mangowave-settings');
      if (!raw) return null;
      return JSON.parse(raw).state?.eq?.preAmpGain ?? null;
    });
    expect(preAmp).toBe(2);
  });

  test('EQ reset button resets all bands', async ({ app }) => {
    await app.getByRole('button', { name: /Equalizer/i }).click();

    // Change pre-amp away from default
    const preAmpSlider = app.locator('input[type="range"][min="0"][max="3"]');
    await preAmpSlider.fill('2.5');

    // Click reset
    await app.getByRole('button', { name: 'Reset', exact: true }).click();

    // Pre-amp should be back to default (1.5)
    const preAmp = await app.evaluate(() => {
      const raw = localStorage.getItem('mangowave-settings');
      if (!raw) return null;
      return JSON.parse(raw).state?.eq?.preAmpGain ?? null;
    });
    expect(preAmp).toBe(1.5);
  });

  test('export settings triggers download with valid JSON', async ({ app }) => {
    await app.getByRole('button', { name: /Data/i }).click();

    // Click export and capture download
    const downloadPromise = app.waitForEvent('download');
    await app.getByRole('button', { name: /Export Settings/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('mangowave-settings.json');

    // Read and validate the downloaded file
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const content = JSON.parse(fs.readFileSync(downloadPath!, 'utf-8'));
    expect(content._meta).toBeDefined();
    expect(content._meta.source).toBe('mangowave');
  });

  test('import settings file applies changes', async ({ app }) => {
    await app.getByRole('button', { name: /Data/i }).click();

    // Create a valid settings export file with a known FPS value.
    // Top-level keys must match store field names (e.g. "performance", not "rendering").
    const settingsFile = {
      _meta: { version: 1, exportedAt: new Date().toISOString(), source: 'mangowave' },
      performance: { fpsCap: 30, resolutionScale: 0.5 },
    };
    const tmpPath = path.join(os.tmpdir(), 'test-import-settings.json');
    fs.writeFileSync(tmpPath, JSON.stringify(settingsFile));

    // Trigger import via hidden file input
    const fileInput = app.locator('input[type="file"][accept=".json"]');
    await fileInput.setInputFiles(tmpPath);

    // Category checkboxes should appear — click Apply
    await expect(app.getByRole('button', { name: /Apply/i })).toBeVisible({ timeout: 5000 });
    await app.getByRole('button', { name: /Apply/i }).click();

    // Verify the imported FPS cap was applied to localStorage
    const fps = await app.evaluate(() => {
      const raw = localStorage.getItem('mangowave-settings');
      if (!raw) return null;
      return JSON.parse(raw).state?.performance?.fpsCap ?? null;
    });
    expect(fps).toBe(30);

    // Clean up
    fs.unlinkSync(tmpPath);
  });
});
