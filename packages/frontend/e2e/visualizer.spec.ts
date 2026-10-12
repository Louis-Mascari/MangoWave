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
    await app.getByRole('button', { name: /Start Visualizer/ }).click({ force: true });

    // Wait for the visualizer to be active — ControlBar (toolbar) should appear
    const toolbar = app.locator('[role="toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 15000 });

    // Preset name should be showing somewhere
    await expect(app.locator('[data-testid="preset-name"]')).toBeVisible({ timeout: 10000 });
  });

  test('microphone capture: start → ControlBar visible with preset name', async ({ app }) => {
    await app.goto('/');

    // Open Microphone modal and start
    await app.getByRole('button', { name: /Use Microphone/ }).click();
    await app.getByRole('button', { name: /Start Microphone/ }).click();

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
      const settings = raw ? JSON.parse(raw) : { state: {}, version: 16 };
      settings.state.autopilot = {
        enabled: true,
        interval: 1,
        mode: 'all',
        favoriteWeight: 2,
      };
      localStorage.setItem('mangowave-settings', JSON.stringify(settings));
    });

    await app.goto('/');

    // Start visualizer
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click({ force: true });

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

  // The visualizer is its own chunk. Matches the built file and the dev-server module.
  const VISUALIZER_CHUNK =
    /\/(assets\/Visualizer-[^/]+\.js|src\/components\/Visualizer\.tsx)(\?.*)?$/;

  test('pressing Start before the visualizer has downloaded shows a loading state', async ({
    app,
  }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await app.route(VISUALIZER_CHUNK, async (route) => {
      await held;
      await route.continue();
    });
    await app.goto('/');

    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click({ force: true });

    await expect(app.getByText('Loading visualizer…')).toBeVisible({ timeout: 10000 });
    await expect(app.locator('[role="toolbar"]')).toHaveCount(0);

    release();
    await expect(app.locator('[role="toolbar"]')).toBeVisible({ timeout: 15000 });
    await expect(app.getByText('Loading visualizer…')).toHaveCount(0);
  });

  test('a session waiting on the visualizer ends with an explanation if the download fails', async ({
    app,
  }) => {
    let fail = () => {};
    const held = new Promise<void>((resolve) => {
      fail = resolve;
    });
    await app.route(VISUALIZER_CHUNK, async (route) => {
      await held;
      await route.abort();
    });
    await app.goto('/');

    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click({ force: true });
    await expect(app.getByText('Loading visualizer…')).toBeVisible({ timeout: 10000 });

    fail();
    await expect(app.locator('[data-testid="start-screen"]')).toBeVisible({ timeout: 10000 });
    await expect(app.getByText(/could not finish loading/).first()).toBeVisible();
  });

  test('a stalled visualizer download can be cancelled', async ({ app }) => {
    await app.route(VISUALIZER_CHUNK, () => {
      // Never answered
    });
    await app.goto('/');

    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click({ force: true });
    await expect(app.getByText('Loading visualizer…')).toBeVisible({ timeout: 10000 });

    await app.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(app.locator('[data-testid="start-screen"]')).toBeVisible({ timeout: 10000 });
  });

  test('a visualizer that cannot be downloaded is reported and no session starts', async ({
    app,
  }) => {
    await app.route(VISUALIZER_CHUNK, (route) => route.abort());
    await app.goto('/');

    const message = app.getByText(/could not finish loading/);
    await expect(message).toBeVisible({ timeout: 10000 });

    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click({ force: true });

    // Back on the start screen with the explanation still there, not a blank session
    await expect(app.locator('[data-testid="start-screen"]')).toBeVisible({ timeout: 10000 });
    await expect(app.locator('[role="toolbar"]')).toHaveCount(0);
    await expect(message.first()).toBeVisible();
  });
});
