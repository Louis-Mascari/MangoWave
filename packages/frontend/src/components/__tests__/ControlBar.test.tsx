import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlBar } from '../ControlBar.tsx';

const defaultProps = {
  onNextPreset: vi.fn(),
  onSelectPreset: vi.fn(),
  onStop: vi.fn(),
  onToggleFullscreen: vi.fn(),
  onToggleNowPlaying: vi.fn(),
  showNowPlaying: false,
  presetList: ['Preset A', 'Preset B'],
  currentPreset: 'Preset A',
};

describe('ControlBar', () => {
  it('renders all control buttons', () => {
    render(<ControlBar {...defaultProps} />);

    expect(screen.getByText('Next Preset')).toBeInTheDocument();
    expect(screen.getByText('Presets')).toBeInTheDocument();
    expect(screen.getByText('EQ')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Fullscreen')).toBeInTheDocument();
    expect(screen.getByText('Stop')).toBeInTheDocument();
  });

  it('calls onNextPreset when clicked', async () => {
    const user = userEvent.setup();
    const onNextPreset = vi.fn();
    render(<ControlBar {...defaultProps} onNextPreset={onNextPreset} />);

    await user.click(screen.getByText('Next Preset'));
    expect(onNextPreset).toHaveBeenCalledTimes(1);
  });

  it('calls onStop when clicked', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<ControlBar {...defaultProps} onStop={onStop} />);

    await user.click(screen.getByText('Stop'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('toggles EQ panel on click', async () => {
    const user = userEvent.setup();
    render(<ControlBar {...defaultProps} />);

    expect(screen.queryByText('Equalizer')).not.toBeInTheDocument();

    await user.click(screen.getByText('EQ'));
    expect(screen.getByText('Equalizer')).toBeInTheDocument();

    await user.click(screen.getByText('EQ'));
    expect(screen.queryByText('Equalizer')).not.toBeInTheDocument();
  });

  it('toggles Performance panel on click', async () => {
    const user = userEvent.setup();
    render(<ControlBar {...defaultProps} />);

    expect(screen.queryByText('Frame Rate')).not.toBeInTheDocument();

    await user.click(screen.getByText('Performance'));
    expect(screen.getByText('Frame Rate')).toBeInTheDocument();
  });

  it('toggles Presets panel on click', async () => {
    const user = userEvent.setup();
    render(<ControlBar {...defaultProps} />);

    await user.click(screen.getByText('Presets'));
    expect(screen.getByPlaceholderText('Search presets...')).toBeInTheDocument();
  });
});
