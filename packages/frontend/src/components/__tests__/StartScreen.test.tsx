import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StartScreen } from '../StartScreen.tsx';
import { useSpotifyStore } from '../../store/useSpotifyStore.ts';

const defaultProps = {
  onStart: vi.fn(),
  onLocalFiles: vi.fn(),
  onMicCapture: vi.fn(),
  error: null as string | null,
};

describe('StartScreen', () => {
  beforeEach(() => {
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

  it('hides Start Visualizer when getDisplayMedia unavailable (mobile)', () => {
    // In jsdom, getDisplayMedia is not available
    render(<StartScreen {...defaultProps} />);
    expect(screen.queryByText('Start Visualizer')).not.toBeInTheDocument();
  });

  it('renders error when provided', () => {
    render(<StartScreen {...defaultProps} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('does not render error when null', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('hides audio sharing instructions when getDisplayMedia unavailable', () => {
    render(<StartScreen {...defaultProps} />);
    // In jsdom, getDisplayMedia is not available, so instructions are hidden
    expect(screen.queryByText('How it works')).not.toBeInTheDocument();
  });

  it('renders Connect Spotify button when not connected', () => {
    useSpotifyStore.setState({ sessionId: null, isSpotifyUnlocked: true });
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('Connect Spotify')).toBeInTheDocument();
  });

  it('shows connected state when Spotify sessionId exists', () => {
    useSpotifyStore.setState({
      sessionId: 'test-session',
      isSpotifyUnlocked: true,
      user: { displayName: 'Test User', id: '123', imageUrl: null, product: null },
    });
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('Connected as Test User')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
    useSpotifyStore.setState({ sessionId: null, user: null });
  });

  it('renders Play Local Files button', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('Play Local Files')).toBeInTheDocument();
  });

  it('renders Use Microphone button', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('Use Microphone')).toBeInTheDocument();
  });

  it('renders BYOC toggle when Spotify not connected', () => {
    useSpotifyStore.setState({ isSpotifyUnlocked: true });
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText('Use your own Spotify credentials')).toBeInTheDocument();
  });
});
