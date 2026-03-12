import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NowPlaying } from '../NowPlaying.tsx';
import type { NowPlayingTrackInfo } from '../NowPlaying.tsx';

const track: NowPlayingTrackInfo = {
  title: 'Test Song',
  artist: 'Test Artist',
  albumName: 'Test Album',
  albumArtUrl: 'https://img.example.com/art.jpg',
};

describe('NowPlaying', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is hidden when disabled and no track', () => {
    const { container } = render(<NowPlaying enabled={false} track={null} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-0');
  });

  it('is hidden when enabled but no track', () => {
    const { container } = render(<NowPlaying enabled={true} track={null} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-0');
  });

  it('renders track info when enabled and track exists', () => {
    const { container, rerender } = render(<NowPlaying enabled={true} track={null} />);

    // Set track — triggers auto-show
    rerender(<NowPlaying enabled={true} track={track} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-100');
    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('Test Album')).toBeInTheDocument();
    expect(screen.getByAltText('Test Album')).toHaveAttribute(
      'src',
      'https://img.example.com/art.jpg',
    );
  });

  it('auto-shows when track changes and enabled', () => {
    const { container, rerender } = render(<NowPlaying enabled={true} track={null} />);

    // Set track — triggers auto-show
    rerender(<NowPlaying enabled={true} track={track} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-100');
  });

  it('auto-show fades after 5s timeout', () => {
    const { container, rerender } = render(<NowPlaying enabled={true} track={null} />);

    rerender(<NowPlaying enabled={true} track={track} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-100');

    // Advance past 5s timeout
    act(() => vi.advanceTimersByTime(5000));
    rerender(<NowPlaying enabled={true} track={track} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-0');
  });

  it('does not auto-show when disabled', () => {
    const { container, rerender } = render(<NowPlaying enabled={false} track={null} />);

    rerender(<NowPlaying enabled={false} track={track} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-0');
  });

  it('displays local track with no artist/album', () => {
    const localTrack: NowPlayingTrackInfo = {
      title: 'my-song.mp3',
      artist: '',
      albumName: '',
      albumArtUrl: null,
    };
    const { rerender } = render(<NowPlaying enabled={true} track={null} />);
    rerender(<NowPlaying enabled={true} track={localTrack} />);
    expect(screen.getByText('my-song.mp3')).toBeInTheDocument();
  });
});
