import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders error when provided', () => {
    render(<StartScreen {...defaultProps} error="Something went wrong" />);
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

  it('shows mobile callout in jsdom (no getDisplayMedia, touch heuristic)', () => {
    // In jsdom, getDisplayMedia is unavailable so isMobileDevice is true
    render(<StartScreen {...defaultProps} />);
    expect(screen.getByText(/laptop or desktop/i)).toBeInTheDocument();
  });

  it('hides Share Audio card in jsdom (mobile-like environment)', () => {
    render(<StartScreen {...defaultProps} />);
    expect(screen.queryByText('Share Audio')).not.toBeInTheDocument();
  });
});
