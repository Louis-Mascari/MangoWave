import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartScreen } from '../StartScreen.tsx';
import { useSpotifyStore } from '../../store/useSpotifyStore.ts';
import { AudioEngine } from '../../engine/AudioEngine.ts';

vi.mock('../../engine/AudioEngine.ts', () => ({
  AudioEngine: {
    getAudioInputs: vi.fn().mockResolvedValue([]),
  },
}));

const defaultProps = {
  onStart: vi.fn(),
  onLocalFiles: vi.fn(),
  onMicCapture: vi.fn(),
  error: null as string | null,
  onClearError: vi.fn(),
};

describe('StartScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSpotifyStore.setState({
      sessionId: null,
      accessToken: null,
      user: null,
      isSpotifyUnlocked: false,
      byocClientId: null,
    });
  });

  it('renders epilepsy warning', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('Photosensitivity Warning')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('MangoWave')).toBeInTheDocument();
  });

  it('renders error when provided', () => {
    render(<StartScreen {...defaultProps} error="No audio was included" />);
    expect(screen.getByText('No audio was included')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('does not render error when null', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('renders Play Local Files card', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('Play Local Files')).toBeInTheDocument();
  });

  it('renders Use Microphone card', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('Use Microphone')).toBeInTheDocument();
  });

  it('opens local files modal on card click', async () => {
    const user = userEvent.setup();
    render(<StartScreen {...defaultProps} />);
    await user.click(screen.getByText('Play Local Files'));
    expect(screen.getByText('Choose Files')).toBeInTheDocument();
  });

  it('opens microphone modal on card click', async () => {
    const user = userEvent.setup();
    render(<StartScreen {...defaultProps} />);
    await user.click(screen.getByText('Use Microphone'));
    expect(screen.getByText('Start Microphone')).toBeInTheDocument();
  });

  it('closes modal on Escape key', async () => {
    const user = userEvent.setup();
    render(<StartScreen {...defaultProps} />);
    await user.click(screen.getByText('Play Local Files'));
    expect(screen.getByText('Choose Files')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Choose Files')).not.toBeInTheDocument();
  });

  it('closes modal on close button click', async () => {
    const user = userEvent.setup();
    render(<StartScreen {...defaultProps} />);
    await user.click(screen.getByText('Use Microphone'));
    expect(screen.getByText('Start Microphone')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Close'));
    expect(screen.queryByText('Start Microphone')).not.toBeInTheDocument();
  });

  it('shows disabled Share Audio card with compat hint in jsdom (mobile-like environment)', () => {
    // In jsdom, getDisplayMedia is unavailable so isMobileDevice is true
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('Share Audio')).toBeInTheDocument();
    const shareAudioBtn = screen.getByText('Share Audio').closest('button');
    expect(shareAudioBtn).toBeDisabled();
  });

  it('allows selecting a specific device in advanced tab', async () => {
    const devices = [
      { deviceId: 'default', label: 'Default Mic', kind: 'audioinput' },
      { deviceId: 'dev1', label: 'Virtual Cable', kind: 'audioinput' },
    ];
    vi.mocked(AudioEngine.getAudioInputs).mockResolvedValue(devices as MediaDeviceInfo[]);

    const user = userEvent.setup();
    render(<StartScreen {...defaultProps} />);

    await user.click(screen.getByText('Use Microphone'));

    // Switch to advanced tab
    await user.click(screen.getByText('Advanced'));

    // Find and click the specific device button
    const deviceBtn = await screen.findByText('Virtual Cable');
    await user.click(deviceBtn);

    await user.click(screen.getByText('Start Microphone'));
    expect(defaultProps.onMicCapture).toHaveBeenCalledWith('dev1');
  });

  it('allows requesting microphone permission to reveal device labels', async () => {
    const devicesHidden = [{ deviceId: 'dev1', label: '', kind: 'audioinput' }];
    const devicesRevealed = [{ deviceId: 'dev1', label: 'Real Microphone', kind: 'audioinput' }];

    // Start with hidden labels
    vi.mocked(AudioEngine.getAudioInputs).mockResolvedValue(devicesHidden as MediaDeviceInfo[]);

    // Mock getUserMedia for the permission request
    const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        ...navigator.mediaDevices,
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    const user = userEvent.setup();
    render(<StartScreen {...defaultProps} />);

    await user.click(screen.getByText('Use Microphone'));

    // Switch to advanced tab
    await user.click(screen.getByText('Advanced'));

    // Wait for the hidden labels warning to appear
    expect(await screen.findByText(/Device names are hidden/)).toBeInTheDocument();

    // Setup revealed labels for the next fetch
    vi.mocked(AudioEngine.getAudioInputs).mockResolvedValue(devicesRevealed as MediaDeviceInfo[]);

    const grantBtn = screen.getByText('Grant Mic Permissions');
    await user.click(grantBtn);

    // Verify the name is revealed
    expect(await screen.findByText('Real Microphone')).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('renders mobile tip in microphone modal when in mobile-like environment', async () => {
    // In jsdom, getDisplayMedia is unavailable so isMobileDevice is true
    const user = userEvent.setup();
    render(<StartScreen {...defaultProps} />);

    await user.click(screen.getByText('Use Microphone'));

    expect(screen.getByText('Capturing other apps')).toBeInTheDocument();
    expect(
      screen.getByText(
        'To visualize music from other apps on this device, you can play it through the speakers for the microphone to capture. Note: Environmental noise and acoustic latency may reduce reactivity. This workaround is only effective when headphones are disconnected.',
      ),
    ).toBeInTheDocument();
  });
});
