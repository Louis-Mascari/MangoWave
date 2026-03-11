import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresetBrowser } from '../PresetBrowser.tsx';

const PRESETS = ['Alpha Wave', 'Beta Pulse', 'Gamma Storm'];
const PACK_MAP = new Map([
  ['Alpha Wave', 'Base'],
  ['Beta Pulse', 'Base'],
  ['Gamma Storm', 'Extra'],
]);

describe('PresetBrowser', () => {
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
    expect(screen.getByText('packs')).toBeInTheDocument();
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

    // Pack filter buttons should be visible
    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.getByText('Extra')).toBeInTheDocument();
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

  it('shows packs tab with create controls', async () => {
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

    await user.click(screen.getByText('packs'));
    expect(screen.getByPlaceholderText('New pack name...')).toBeInTheDocument();
    expect(screen.getByText('Import Pack')).toBeInTheDocument();
  });
});
