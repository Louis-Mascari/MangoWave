import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NowPlaying } from '../NowPlaying.tsx';
import { useSpotifyStore } from '../../store/useSpotifyStore.ts';

// Mock the useNowPlaying hook since it does network calls
vi.mock('../../hooks/useNowPlaying.ts', () => ({
  useNowPlaying: vi.fn(),
}));

describe('NowPlaying', () => {
  beforeEach(() => {
    useSpotifyStore.setState({ nowPlaying: null });
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<NowPlaying visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when visible but no track', () => {
    const { container } = render(<NowPlaying visible={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders track info when visible and track exists', () => {
    useSpotifyStore.setState({
      nowPlaying: {
        title: 'Test Song',
        artist: 'Test Artist',
        albumName: 'Test Album',
        albumArtUrl: 'https://img.example.com/art.jpg',
        isPlaying: true,
        progressMs: 30000,
        durationMs: 200000,
      },
    });

    render(<NowPlaying visible={true} />);

    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('Test Album')).toBeInTheDocument();
    expect(screen.getByAltText('Test Album')).toHaveAttribute(
      'src',
      'https://img.example.com/art.jpg',
    );
  });
});
