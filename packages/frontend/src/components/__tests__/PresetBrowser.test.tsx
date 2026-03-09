import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresetBrowser } from '../PresetBrowser.tsx';

const PRESETS = ['Alpha Wave', 'Beta Pulse', 'Gamma Storm'];

describe('PresetBrowser', () => {
  it('renders preset list', () => {
    render(
      <PresetBrowser
        presetList={PRESETS}
        currentPreset="Alpha Wave"
        onSelectPreset={vi.fn()}
        onNextPreset={vi.fn()}
      />,
    );

    expect(screen.getByText('Alpha Wave')).toBeInTheDocument();
    expect(screen.getByText('Beta Pulse')).toBeInTheDocument();
    expect(screen.getByText('Gamma Storm')).toBeInTheDocument();
  });

  it('calls onSelectPreset when a preset is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PresetBrowser
        presetList={PRESETS}
        currentPreset=""
        onSelectPreset={onSelect}
        onNextPreset={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Beta Pulse'));
    expect(onSelect).toHaveBeenCalledWith('Beta Pulse');
  });

  it('filters presets by search', async () => {
    const user = userEvent.setup();
    render(
      <PresetBrowser
        presetList={PRESETS}
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
        currentPreset=""
        onSelectPreset={vi.fn()}
        onNextPreset={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText('Search presets...'), 'zzzzz');
    expect(screen.getByText('No presets found')).toBeInTheDocument();
  });
});
