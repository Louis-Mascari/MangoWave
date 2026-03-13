import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlBar } from '../ControlBar.tsx';

const defaultProps = {
  onNextPreset: vi.fn(),
  onPreviousPreset: vi.fn(),
  canGoBack: false,
  onSelectPreset: vi.fn(),
  onStop: vi.fn(),
  onToggleFullscreen: vi.fn(),
  isFullscreen: false,
  presetList: ['Preset A', 'Preset B'],
  presetPackMap: new Map([
    ['Preset A', 'Base'],
    ['Preset B', 'Base'],
  ]),
  currentPreset: 'Preset A',
  autopilotEnabled: false,
  onToggleAutopilot: vi.fn(),
  activePanel: 'none' as const,
  onTogglePanel: vi.fn(),
  isFavorite: false,
  isBlocked: false,
  onToggleFavorite: vi.fn(),
  onToggleBlock: vi.fn(),
  isIdle: false,
  forceIdle: vi.fn(),
};

describe('ControlBar', () => {
  it('renders all control buttons', () => {
    render(<ControlBar {...defaultProps} />);

    expect(screen.getByText('Presets')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Autopilot')).toBeInTheDocument();
    expect(screen.getByText('Fullscreen')).toBeInTheDocument();
    expect(screen.getByText('Exit')).toBeInTheDocument();
  });

  it('renders previous and next preset icon buttons', () => {
    render(<ControlBar {...defaultProps} />);

    expect(screen.getByLabelText('Previous preset')).toBeInTheDocument();
    expect(screen.getByLabelText('Next preset')).toBeInTheDocument();
  });

  it('disables previous preset button when canGoBack is false', () => {
    render(<ControlBar {...defaultProps} canGoBack={false} />);
    expect(screen.getByLabelText('Previous preset')).toBeDisabled();
  });

  it('enables previous preset button when canGoBack is true', () => {
    render(<ControlBar {...defaultProps} canGoBack={true} />);
    expect(screen.getByLabelText('Previous preset')).toBeEnabled();
  });

  it('calls onPreviousPreset when previous button clicked', async () => {
    const user = userEvent.setup();
    const onPreviousPreset = vi.fn();
    render(<ControlBar {...defaultProps} canGoBack={true} onPreviousPreset={onPreviousPreset} />);

    await user.click(screen.getByLabelText('Previous preset'));
    expect(onPreviousPreset).toHaveBeenCalledTimes(1);
  });

  it('calls onNextPreset when next preset button clicked', async () => {
    const user = userEvent.setup();
    const onNextPreset = vi.fn();
    render(<ControlBar {...defaultProps} onNextPreset={onNextPreset} />);

    await user.click(screen.getByLabelText('Next preset'));
    expect(onNextPreset).toHaveBeenCalledTimes(1);
  });

  it('calls onStop when clicked', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<ControlBar {...defaultProps} onStop={onStop} />);

    await user.click(screen.getByText('Exit'));
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

  it('highlights Fullscreen button when fullscreen is active', () => {
    render(<ControlBar {...defaultProps} isFullscreen={true} />);
    const btn = screen.getByText('Fullscreen');
    expect(btn.className).toContain('bg-orange-500');
  });
});
