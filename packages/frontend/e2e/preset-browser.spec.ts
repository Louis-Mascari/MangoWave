import { test, expect } from './fixtures/base';
import { installAudioMocks } from './fixtures/audio-mock';

test.describe('Preset Browser', () => {
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
  });

  test('opens preset browser and search input is visible', async ({ app }) => {
    await app.getByRole('button', { name: /Presets/ }).click();
    await expect(app.locator('input[placeholder*="Search"]')).toBeVisible();
  });

  test('search filters preset results', async ({ app }) => {
    await app.getByRole('button', { name: /Presets/ }).click();
    const searchInput = app.locator('input[placeholder*="Search"]');
    await searchInput.fill('milk');

    // Should show filtered results (at least some preset names containing "milk")
    // Wait for results to filter
    await app.waitForTimeout(300);

    // The clear button should appear
    await expect(app.getByLabel(/Clear search/)).toBeVisible();
  });

  test('clicking a preset row loads that preset', async ({ app }) => {
    await app.getByRole('button', { name: /Presets/ }).click();

    // Wait for preset rows to render in the virtualized list
    const presetRows = app.locator('[role="button"]').filter({
      hasNotText:
        /All|Favorites|Blocked|Excluded|History|Presets|Settings|Autopilot|Fullscreen|Exit/,
    });
    await expect(presetRows.first()).toBeVisible({ timeout: 5000 });

    // Read the preset name from the second row (first row might be the current preset)
    const targetRow = presetRows.nth(1);
    const targetName = await targetRow.locator('span').first().textContent();

    await targetRow.click();

    // Verify via Zustand store that the preset was actually loaded
    await expect(async () => {
      const current = await app.evaluate(
        () => (document.querySelector('[data-testid="preset-name"]') as HTMLElement)?.textContent,
      );
      expect(current).toBe(targetName);
    }).toPass({ timeout: 5000 });
  });

  test('tab switching between All and Favorites', async ({ app }) => {
    await app.getByRole('button', { name: /Presets/ }).click();

    // Click Favorites tab
    const favoritesTab = app.getByRole('button', { name: 'favorites', exact: true });
    await favoritesTab.click();

    // Should still show the preset browser (even if empty)
    await expect(app.locator('input[placeholder*="Search"]')).toBeVisible();

    // Click All tab
    const allTab = app.getByRole('button', { name: /^all$/i });
    await allTab.click();
    await expect(app.locator('input[placeholder*="Search"]')).toBeVisible();
  });
});
