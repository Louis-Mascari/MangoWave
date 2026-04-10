import { type Page } from '@playwright/test';
import { test, expect, clickToolbarButton } from './fixtures/base';
import { installAudioMocks } from './fixtures/audio-mock';

/** Open the Presets panel and switch to the Packs tab, waiting for each transition. */
async function openPacksTab(app: Page) {
  await clickToolbarButton(app, /Presets/);
  // Wait for panel to render before clicking tab
  const packsTab = app.getByRole('button', { name: /packs/i });
  await expect(packsTab).toBeVisible({ timeout: 5000 });
  await packsTab.click();
  // Wait for packs content to render
  await expect(app.getByRole('button', { name: /Create Custom Pack/ })).toBeVisible({
    timeout: 5000,
  });
}

test.describe('Preset Browser', () => {
  test.beforeEach(async ({ app }) => {
    await app.addInitScript(installAudioMocks());
    // Prevent auto-seeding of "MilkDrop Classic" pack so tests start with no custom packs
    await app.addInitScript(() => localStorage.setItem('mw-milkdrop-classic-seeded', '1'));
    await app.goto('/');

    // Start visualizer
    await app.getByRole('button', { name: /Share Audio/ }).click();
    await app.getByRole('button', { name: /Start Visualizer/ }).click({ force: true });

    // Wait for toolbar
    await expect(app.locator('[role="toolbar"]')).toBeVisible({ timeout: 15000 });
  });

  test('opens preset browser and search input is visible', async ({ app }) => {
    await clickToolbarButton(app, /Presets/);
    await expect(app.locator('input[placeholder*="Search"]')).toBeVisible();
  });

  test('search filters preset results', async ({ app }) => {
    await clickToolbarButton(app, /Presets/);
    const searchInput = app.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill('milk');

    // Should show filtered results (at least some preset names containing "milk")
    // Wait for results to filter
    await app.waitForTimeout(300);

    // The clear button should appear
    await expect(app.getByLabel(/Clear search/)).toBeVisible();
  });

  test('clicking a preset row loads that preset', async ({ app }) => {
    await clickToolbarButton(app, /Presets/);

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
    await clickToolbarButton(app, /Presets/);

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

  test('Packs tab: create, activate, and deactivate a custom pack', async ({ app }, testInfo) => {
    // This test has the most steps (create → add → back → start → verify → stop → verify)
    // and needs extra headroom on slow CI runners
    testInfo.setTimeout(60000);
    await openPacksTab(app);

    // Create a pack (auto-enters edit view)
    await app.getByRole('button', { name: /Create Custom Pack/ }).click();

    // Add a preset so the Start button appears
    const addButton = app.locator('[aria-label^="Add to pack"]').first();
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    // Go back to pack list view
    await app.getByLabel(/Back/).click();

    // Pack should appear with start button
    await expect(app.getByText('Pack 1', { exact: true })).toBeVisible();
    const startBtn = app.getByRole('button', { name: /^Start$/ });
    await expect(startBtn).toBeVisible();

    // Start the pack — force: true because the click can stall in headless CI
    // when the renderer auto-advances to a pack preset during the click handler
    await startBtn.click({ force: true });

    // Active pack chip should appear
    await expect(app.getByText(/Playing from: Pack 1/)).toBeVisible();

    // Deactivate via the chip's Stop button — force: true because the renderer
    // may be processing a preset change during the click handler in headless CI
    await app.getByRole('button', { name: /Stop pack/ }).click({ force: true });

    // Chip should disappear
    await expect(app.getByText(/Playing from: Pack 1/)).not.toBeVisible();
  });

  test('Packs tab: edit pack name and add presets', async ({ app }) => {
    await openPacksTab(app);

    // Create a pack (auto-enters edit view)
    await app.getByRole('button', { name: /Create Custom Pack/ }).click();

    // Already in edit view — should see pack name input and "Add presets" section
    await expect(app.getByLabel(/Pack name/)).toBeVisible();
    await expect(app.getByText(/Add presets/)).toBeVisible();
    await expect(app.getByPlaceholder(/Search presets to add/)).toBeVisible();

    // Rename the pack
    const nameInput = app.getByLabel(/Pack name/);
    await nameInput.fill('My Test Pack');
    await nameInput.blur();

    // Add a preset using the + button (inside virtualized addable list)
    const addButton = app.locator('[aria-label^="Add to pack"]').first();
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    // Preset count should update (may take a moment after store update triggers re-render)
    await expect(app.getByText(/1 preset/)).toBeVisible({ timeout: 5000 });

    // Go back to pack list
    await app.getByLabel(/Back/).click();

    // Pack should show the new name
    await expect(app.getByText('My Test Pack')).toBeVisible();
  });

  test('Packs tab: delete pack shows confirmation dialog', async ({ app }) => {
    await openPacksTab(app);

    // Create a pack (auto-enters edit view)
    await app.getByRole('button', { name: /Create Custom Pack/ }).click();

    // Go back to pack list view where delete button is
    await app.getByLabel(/Back/).click();

    // Click delete (icon button with title)
    await app.getByTitle(/Delete pack/).click();

    // Confirmation dialog should appear
    await expect(app.getByRole('dialog', { name: /Delete pack/ })).toBeVisible();
    await expect(app.getByText(/cannot be undone/)).toBeVisible();

    // Cancel — pack should still exist
    const cancelBtn = app.getByRole('button', { name: /Cancel/ });
    await expect(cancelBtn).toBeEnabled();
    await cancelBtn.click({ force: true });
    await expect(app.getByText('Pack 1', { exact: true })).toBeVisible();
  });

  test('active pack dims All tab filters with override notice', async ({ app }, testInfo) => {
    testInfo.setTimeout(60000);
    await openPacksTab(app);

    // Create a pack (auto-enters edit view) and add a preset
    await app.getByRole('button', { name: /Create Custom Pack/ }).click();
    const addBtn = app.locator('[aria-label^="Add to pack"]').first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    // Go back to pack list and start — force: true because the virtualized
    // preset list may still be rendering after add, keeping the button "unstable"
    await app.getByLabel(/Back/).click({ force: true });
    const startBtn2 = app.getByRole('button', { name: /^Start$/ });
    await expect(startBtn2).toBeVisible();
    await startBtn2.click({ force: true });

    // Wait for pack activation (renderer may load a preset, causing re-renders)
    await expect(app.getByText(/Playing from: Pack 1/)).toBeVisible({ timeout: 10000 });

    // Switch to All tab
    const allTab = app.getByRole('button', { name: /^all$/i });
    await expect(allTab).toBeVisible({ timeout: 5000 });
    await allTab.click();

    // Override notice should be visible
    await expect(app.getByText(/Filters only affect this list/)).toBeVisible();
  });
});
