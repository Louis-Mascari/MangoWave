import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaybackControls } from '../PlaybackControls.tsx';
import { useSpotifyStore } from '../../store/useSpotifyStore.ts';

vi.mock('../../services/spotifyApi.ts', () => ({
  controlPlayback: vi.fn(),
  refreshToken: vi.fn(),
  PremiumRequiredError: class extends Error {
    constructor() {
      super('Premium required');
      this.name = 'PremiumRequiredError';
    }
  },
  TokenExpiredError: class extends Error {
    constructor() {
      super('Token expired');
      this.name = 'TokenExpiredError';
    }
  },
}));

import { controlPlayback } from '../../services/spotifyApi.ts';

describe('PlaybackControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSpotifyStore.setState({
      accessToken: null,
      sessionId: null,
      nowPlaying: null,
      premiumError: false,
    });
  });

  it('renders disabled buttons when not connected', () => {
    render(<PlaybackControls />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('renders enabled buttons when connected', () => {
    useSpotifyStore.setState({ accessToken: 'at_123', sessionId: 'sess_abc' });
    render(<PlaybackControls />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeEnabled());
  });

  it('calls controlPlayback with "next" when next is clicked', async () => {
    const user = userEvent.setup();
    useSpotifyStore.setState({ accessToken: 'at_123', sessionId: 'sess_abc' });
    vi.mocked(controlPlayback).mockResolvedValue(undefined);

    render(<PlaybackControls />);
    await user.click(screen.getByLabelText('Next track'));

    expect(controlPlayback).toHaveBeenCalledWith('at_123', 'next');
  });

  it('shows play button when nothing is playing', () => {
    useSpotifyStore.setState({ accessToken: 'at_123', sessionId: 'sess_abc', nowPlaying: null });
    render(<PlaybackControls />);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('shows pause button when track is playing', () => {
    useSpotifyStore.setState({
      accessToken: 'at_123',
      sessionId: 'sess_abc',
      nowPlaying: {
        title: 'Song',
        artist: 'Artist',
        albumName: 'Album',
        albumArtUrl: null,
        isPlaying: true,
        progressMs: 0,
        durationMs: 300000,
      },
    });
    render(<PlaybackControls />);
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });

  it('disables buttons when premiumError is true', () => {
    useSpotifyStore.setState({ accessToken: 'at_123', sessionId: 'sess_abc', premiumError: true });
    render(<PlaybackControls />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });
});
