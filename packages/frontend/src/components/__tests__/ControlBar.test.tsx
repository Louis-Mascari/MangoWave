import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlBar } from '../ControlBar.tsx';
import type { PlaybackAdapter } from '../PlaybackControls.tsx';

const noneAdapter: PlaybackAdapter = {
  source: 'none',
  isPlaying: false,
  canControl: false,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
};

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
  isFavorite: false,
  isBlocked: false,
  onToggleFavorite: vi.fn(),
  onToggleBlock: vi.fn(),
  playbackAdapter: noneAdapter,
};

describe('ControlBar', () => {
  it('renders all control buttons', () => {
    render(<ControlBar {...defaultProps} />);

    expect(screen.getByText('Next Preset')).toBeInTheDocument();
    expect(screen.getByText('Presets')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
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

  it('shows Settings panel with Equalizer tab when activePanel is settings', () => {
    render(<ControlBar {...defaultProps} activePanel="settings" />);
    expect(screen.getByText('Pre-Amp')).toBeInTheDocument();
  });

  it('calls onTogglePanel with settings when Settings button is clicked', async () => {
    const user = userEvent.setup();
    const onTogglePanel = vi.fn();
    render(<ControlBar {...defaultProps} onTogglePanel={onTogglePanel} />);

    await user.click(screen.getByText('Settings'));
    expect(onTogglePanel).toHaveBeenCalledWith('settings');
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

  it('opens popup when Connect Spotify is clicked', async () => {
    const user = userEvent.setup();
    const mockPopup = { closed: false };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockPopup as Window);

    render(<ControlBar {...defaultProps} />);
    await user.click(screen.getByText('Connect Spotify'));

    expect(openSpy).toHaveBeenCalledWith(
      expect.any(String),
      'spotify-auth',
      'popup,width=500,height=700',
    );
    openSpy.mockRestore();
  });

  it('falls back to confirm dialog when popup is blocked', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<ControlBar {...defaultProps} />);
    await user.click(screen.getByText('Connect Spotify'));

    expect(confirmSpy).toHaveBeenCalled();
    openSpy.mockRestore();
    confirmSpy.mockRestore();
  });
});
