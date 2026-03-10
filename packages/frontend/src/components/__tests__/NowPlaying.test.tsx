import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NowPlaying } from '../NowPlaying.tsx';
import { useSpotifyStore } from '../../store/useSpotifyStore.ts';

const track = {
  title: 'Test Song',
  artist: 'Test Artist',
  albumName: 'Test Album',
  albumArtUrl: 'https://img.example.com/art.jpg',
  isPlaying: true,
  progressMs: 30000,
  durationMs: 200000,
};

describe('NowPlaying', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSpotifyStore.setState({ nowPlaying: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is hidden when not visible and no auto-show', () => {
    const { container } = render(<NowPlaying visible={false} songInfoDisplay={5} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-0');
  });

  it('is hidden when visible but no track', () => {
    const { container } = render(<NowPlaying visible={true} songInfoDisplay={5} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-0');
  });

  it('renders track info when visible and track exists', () => {
    useSpotifyStore.setState({ nowPlaying: track });

    render(<NowPlaying visible={true} songInfoDisplay={5} />);

    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('Test Album')).toBeInTheDocument();
    expect(screen.getByAltText('Test Album')).toHaveAttribute(
      'src',
      'https://img.example.com/art.jpg',
    );
  });

  it('auto-shows when track changes and songInfoDisplay is a number', () => {
    const { container, rerender } = render(<NowPlaying visible={false} songInfoDisplay={5} />);

    // Set track — triggers auto-show
    useSpotifyStore.setState({ nowPlaying: track });
    rerender(<NowPlaying visible={false} songInfoDisplay={5} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-100');
  });

  it('auto-show fades after timeout', () => {
    const { container, rerender } = render(<NowPlaying visible={false} songInfoDisplay={3} />);

    useSpotifyStore.setState({ nowPlaying: track });
    rerender(<NowPlaying visible={false} songInfoDisplay={3} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-100');

    // Advance past timeout
    act(() => vi.advanceTimersByTime(3000));
    rerender(<NowPlaying visible={false} songInfoDisplay={3} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-0');
  });

  it('auto-show stays visible when songInfoDisplay is always', () => {
    const { container, rerender } = render(<NowPlaying visible={false} songInfoDisplay="always" />);

    useSpotifyStore.setState({ nowPlaying: track });
    rerender(<NowPlaying visible={false} songInfoDisplay="always" />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-100');

    // No timeout — should stay visible
    act(() => vi.advanceTimersByTime(10000));
    rerender(<NowPlaying visible={false} songInfoDisplay="always" />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-100');
  });

  it('does not auto-show when songInfoDisplay is off', () => {
    const { container, rerender } = render(<NowPlaying visible={false} songInfoDisplay="off" />);

    useSpotifyStore.setState({ nowPlaying: track });
    rerender(<NowPlaying visible={false} songInfoDisplay="off" />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-0');
  });

  it('manual toggle still works independently of auto-show', () => {
    useSpotifyStore.setState({ nowPlaying: track });

    const { container } = render(<NowPlaying visible={true} songInfoDisplay="off" />);
    expect((container.firstChild as HTMLElement).className).toContain('opacity-100');
  });
});
