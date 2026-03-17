import { test, expect } from './fixtures/base';
import {
  installAudioMocks,
  installAudioDeniedMock,
  installWebGL2UnsupportedMock,
  installWebGL2StubbedMock,
} from './fixtures/audio-mock';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const needsWebGL2Stub = (projectName: string) =>
  projectName === 'firefox' || projectName === 'webkit';

test.describe('StartScreen', () => {
  test.beforeEach(async ({ app }, testInfo) => {
    if (needsWebGL2Stub(testInfo.project.name)) {
      await app.addInitScript(installWebGL2StubbedMock());
    }
    await app.goto('/');
  });

  test('renders title, epilepsy warning, and source cards', async ({ app }) => {
    await expect(app.locator('[data-testid="start-screen"]')).toBeVisible();
    await expect(app.getByText('Photosensitivity Warning')).toBeVisible();
    await expect(app.getByRole('button', { name: /Share Audio/ })).toBeVisible();
    await expect(app.getByRole('button', { name: /Play Local Files/ })).toBeVisible();
    await expect(app.getByRole('button', { name: /Use Microphone/ })).toBeVisible();
  });

  test('Share Audio card opens modal', async ({ app }) => {
    await app.getByRole('button', { name: /Share Audio/ }).click();
    const dialog = app.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Start Visualizer/ })).toBeVisible();
  });

  test('Local Files card opens modal', async ({ app }) => {
    await app.getByRole('button', { name: /Play Local Files/ }).click();
    const dialog = app.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Choose Files/ })).toBeVisible();
  });

  test('Microphone card opens modal', async ({ app }) => {
    await app.getByRole('button', { name: /Use Microphone/ }).click();
    const dialog = app.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Start Microphone/ })).toBeVisible();
  });

  test('Escape closes modal', async ({ app }) => {
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await expect(app.locator('[role="dialog"]')).toBeVisible();
    await app.keyboard.press('Escape');
    await expect(app.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('backdrop click closes modal', async ({ app }) => {
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await expect(app.locator('[role="dialog"]')).toBeVisible();
    // The backdrop is the outer fixed div that contains the dialog.
    // Clicking it (not the dialog itself) triggers onClose via e.target === e.currentTarget.
    // Click the top-left corner of the viewport to hit the backdrop overlay.
    await app.click('body', { position: { x: 10, y: 10 } });
    await expect(app.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('local file loading transitions to visualizer', async ({ app }, testInfo) => {
    test.skip(
      needsWebGL2Stub(testInfo.project.name),
      'Requires real WebGL 2 for butterchurn init after file load',
    );
    await app.getByRole('button', { name: /Play Local Files/ }).click();

    // Set files on the hidden input
    const fileInput = app.locator('input[type="file"]');
    await fileInput.setInputFiles(path.resolve(__dirname, 'fixtures/test-silence.mp3'));

    // Should transition away from start screen
    await expect(app.locator('[data-testid="start-screen"]')).not.toBeVisible({
      timeout: 10000,
    });
  });

  test('language picker is present', async ({ app }) => {
    // The language picker is a select or set of buttons in the footer
    await expect(app.locator('select, [role="listbox"]').first()).toBeVisible();
  });

  test('Share Audio Start Visualizer button is disabled on non-Chromium', async ({
    app,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'chromium' || testInfo.project.name === 'mobile-chrome',
      'Only relevant on non-Chromium browsers',
    );
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await expect(app.getByRole('button', { name: /Start Visualizer/ })).toBeDisabled();
  });
});

test.describe('StartScreen — onboarding', () => {
  test('onboarding overlay appears after first launch and can be dismissed', async ({
    app,
  }, testInfo) => {
    test.skip(
      needsWebGL2Stub(testInfo.project.name),
      'Requires real WebGL 2 — butterchurn crash with stub races the onboarding overlay',
    );
    // Install audio mocks so we can start the visualizer
    await app.addInitScript(installAudioMocks());
    // Remove onboardingShown so the overlay displays
    await app.addInitScript(() => {
      const raw = localStorage.getItem('mangowave-settings');
      if (raw) {
        const settings = JSON.parse(raw);
        delete settings.state.onboardingShown;
        localStorage.setItem('mangowave-settings', JSON.stringify(settings));
      }
    });
    await app.goto('/');

    // Start via microphone (works on all browsers, no getDisplayMedia needed)
    await app.getByRole('button', { name: /Use Microphone/ }).click();
    await app.getByRole('button', { name: /Start Microphone/ }).click();

    // Onboarding dialog should appear after launch
    const dialog = app.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Should have navigation buttons
    await expect(dialog.getByRole('button', { name: /Skip/i })).toBeVisible();

    // Dismiss via Skip
    await dialog.getByRole('button', { name: /Skip/i }).click();

    // Dialog should close (with fade animation, give it time)
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('StartScreen — i18n', () => {
  test('changing language translates the UI', async ({ app }, testInfo) => {
    if (needsWebGL2Stub(testInfo.project.name)) {
      await app.addInitScript(installWebGL2StubbedMock());
    }
    await app.goto('/');

    // Verify English text is present
    await expect(app.getByText('Choose your audio source')).toBeVisible();

    // Change language to Spanish via the picker
    await app.locator('select').selectOption('es');

    // Verify Spanish translation appeared
    await expect(app.getByText('Elige tu fuente de audio')).toBeVisible();

    // Language should persist in localStorage
    const lang = await app.evaluate(() => localStorage.getItem('mangowave-language'));
    expect(lang).toBe('es');
  });
});

test.describe('StartScreen — error states', () => {
  // These tests use the app fixture (which clears localStorage + skips onboarding)
  // and add additional mocks via addInitScript before navigating.

  test('WebGL unsupported shows error', async ({ app }) => {
    await app.addInitScript(installWebGL2UnsupportedMock());
    await app.goto('/');

    // Should show an error heading about WebGL
    await expect(app.getByRole('heading', { name: /WebGL/i })).toBeVisible({ timeout: 10000 });
  });

  test('audio capture denied shows error message', async ({ app }, testInfo) => {
    test.skip(
      needsWebGL2Stub(testInfo.project.name),
      'getDisplayMedia is Chromium-only — skip on Firefox/WebKit',
    );
    await app.addInitScript(installAudioDeniedMock());
    await app.goto('/');

    // Open Share Audio modal and try to start
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click();

    // Should show an error message about permission denied
    await expect(app.getByText(/denied|blocked|allow|permission/i).first()).toBeVisible({
      timeout: 10000,
    });
  });
});
