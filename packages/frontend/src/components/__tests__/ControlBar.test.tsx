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
  autopilotEnabled: false,
  onToggleAutopilot: vi.fn(),
  activePanel: 'none' as const,
  onTogglePanel: vi.fn(),
  onToggleShortcuts: vi.fn(),
  isFavorite: false,
  isBlocked: false,
  onToggleFavorite: vi.fn(),
  onToggleBlock: vi.fn(),
};

describe('ControlBar', () => {
  it('renders all control buttons', () => {
    render(<ControlBar {...defaultProps} />);

    expect(screen.getByText('Next Preset')).toBeInTheDocument();
    expect(screen.getByText('Presets')).toBeInTheDocument();
    expect(screen.getByText('EQ')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Autopilot')).toBeInTheDocument();
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

  it('shows EQ panel when activePanel is eq', () => {
    render(<ControlBar {...defaultProps} activePanel="eq" />);
    expect(screen.getByText('Equalizer')).toBeInTheDocument();
  });

  it('shows Performance panel when activePanel is performance', () => {
    render(<ControlBar {...defaultProps} activePanel="performance" />);
    expect(screen.getByText('Frame Rate')).toBeInTheDocument();
  });

  it('calls onTogglePanel when panel button is clicked', async () => {
    const user = userEvent.setup();
    const onTogglePanel = vi.fn();
    render(<ControlBar {...defaultProps} onTogglePanel={onTogglePanel} />);

    await user.click(screen.getByText('EQ'));
    expect(onTogglePanel).toHaveBeenCalledWith('eq');
  });

  it('calls onToggleAutopilot when Autopilot is clicked', async () => {
    const user = userEvent.setup();
    const onToggleAutopilot = vi.fn();
    render(<ControlBar {...defaultProps} onToggleAutopilot={onToggleAutopilot} />);

    await user.click(screen.getByText('Autopilot'));
    expect(onToggleAutopilot).toHaveBeenCalledTimes(1);
  });

  it('highlights Autopilot button when enabled', () => {
    render(<ControlBar {...defaultProps} autopilotEnabled={true} />);
    const btn = screen.getByText('Autopilot');
    expect(btn.className).toContain('bg-orange-500');
  });
});
