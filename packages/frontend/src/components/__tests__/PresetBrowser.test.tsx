import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresetBrowser } from '../PresetBrowser.tsx';
import { usePresetBrowserStore } from '../../store/usePresetBrowserStore.ts';

const PRESETS = ['Alpha Wave', 'Beta Pulse', 'Gamma Storm'];
const PACK_MAP = new Map([
  ['Alpha Wave', 'Reactive'],
  ['Beta Pulse', 'Reactive'],
  ['Gamma Storm', 'Psychedelic'],
]);

describe('PresetBrowser', () => {
  beforeEach(() => {
    // Reset persistent browser store between tests
    const store = usePresetBrowserStore.getState();
    store.setFilter('all');
    store.setSearch('');
    store.setScrollTop(0);
    for (const pack of store.collapsedPacks) {
      store.toggleCollapsePack(pack);
    }
  });
  it('renders filter tabs', () => {
    render(
      <PresetBrowser
        presetList={PRESETS}
        presetPackMap={PACK_MAP}
        currentPreset="Alpha Wave"
        onSelectPreset={vi.fn()}
        onNextPreset={vi.fn()}
      />,
    );

    expect(screen.getByText('all')).toBeInTheDocument();
    expect(screen.getByText('favorites')).toBeInTheDocument();
    expect(screen.getByText('blocked')).toBeInTheDocument();
    expect(screen.getByText('history')).toBeInTheDocument();
    expect(screen.getByText('import')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(
      <PresetBrowser
        presetList={PRESETS}
        presetPackMap={PACK_MAP}
        currentPreset=""
        onSelectPreset={vi.fn()}
        onNextPreset={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText('Search presets...')).toBeInTheDocument();
  });

  it('shows presets in search results and calls onSelectPreset', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PresetBrowser
        presetList={PRESETS}
        presetPackMap={PACK_MAP}
        currentPreset=""
        onSelectPreset={onSelect}
        onNextPreset={vi.fn()}
      />,
    );

    // Search triggers flat list (no virtualization)
    await user.type(screen.getByPlaceholderText('Search presets...'), 'Beta');
    expect(screen.getByText('Beta Pulse')).toBeInTheDocument();

    await user.click(screen.getByText('Beta Pulse'));
    expect(onSelect).toHaveBeenCalledWith('Beta Pulse');
  });

  it('filters presets by search', async () => {
    const user = userEvent.setup();
    render(
      <PresetBrowser
        presetList={PRESETS}
        presetPackMap={PACK_MAP}
        currentPreset=""
        onSelectPreset={vi.fn()}
        onNextPreset={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText('Search presets...'), 'gamma');
    expect(screen.getByText('Gamma Storm')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Wave')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta Pulse')).not.toBeInTheDocument();
  });

  it('shows empty state when no presets match', async () => {
    const user = userEvent.setup();
    render(
      <PresetBrowser
        presetList={PRESETS}
        presetPackMap={PACK_MAP}
        currentPreset=""
        onSelectPreset={vi.fn()}
        onNextPreset={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText('Search presets...'), 'zzzzz');
    expect(screen.getByText('No presets found')).toBeInTheDocument();
  });

  it('shows pack filter chips in all tab', () => {
    render(
      <PresetBrowser
        presetList={PRESETS}
        presetPackMap={PACK_MAP}
        currentPreset=""
        onSelectPreset={vi.fn()}
        onNextPreset={vi.fn()}
      />,
    );

    // Pack filter buttons come from PACK_ORDER (all 5 thematic packs shown)
    expect(screen.getByText('Reactive')).toBeInTheDocument();
    expect(screen.getByText('Psychedelic')).toBeInTheDocument();
  });

  it('shows import tab with buttons and empty state', async () => {
    const user = userEvent.setup();
    render(
      <PresetBrowser
        presetList={PRESETS}
        presetPackMap={PACK_MAP}
        currentPreset=""
        onSelectPreset={vi.fn()}
        onNextPreset={vi.fn()}
      />,
    );

    await user.click(screen.getByText('import'));
    // Presets sub-tab is selected by default
    expect(screen.getByText('Import .milk')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No imported presets. Use "Import .milk" to add community MilkDrop presets.',
      ),
    ).toBeInTheDocument();
    // Import Textures button is in the textures sub-tab (not visible by default)
    expect(screen.queryByText('Import Textures')).not.toBeInTheDocument();
    // Switch to textures sub-tab
    await user.click(screen.getByText(/Imported Textures/));
    expect(screen.getByText('Import Textures')).toBeInTheDocument();
    // Search bar should be hidden on import tab
    expect(screen.queryByPlaceholderText('Search presets...')).not.toBeInTheDocument();
  });

  it('shows history tab', async () => {
    const user = userEvent.setup();
    render(
      <PresetBrowser
        presetList={PRESETS}
        presetPackMap={PACK_MAP}
        currentPreset=""
        onSelectPreset={vi.fn()}
        onNextPreset={vi.fn()}
      />,
    );

    await user.click(screen.getByText('history'));
    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });
});
