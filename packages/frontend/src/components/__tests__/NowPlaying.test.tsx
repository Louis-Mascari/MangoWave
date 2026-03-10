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

  it('is hidden when not visible and no auto-show', () => {
    const { container } = render(<NowPlaying visible={false} songInfoDisplay={5} track={null} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-0');
  });

  it('is hidden when visible but no track', () => {
    const { container } = render(<NowPlaying visible={true} songInfoDisplay={5} track={null} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-0');
  });

  it('renders track info when visible and track exists', () => {
    render(<NowPlaying visible={true} songInfoDisplay={5} track={track} />);

    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('Test Album')).toBeInTheDocument();
    expect(screen.getByAltText('Test Album')).toHaveAttribute(
      'src',
      'https://img.example.com/art.jpg',
    );
  });

  it('auto-shows when track changes and songInfoDisplay is a number', () => {
    const { container, rerender } = render(
      <NowPlaying visible={false} songInfoDisplay={5} track={null} />,
    );

    // Set track — triggers auto-show
    rerender(<NowPlaying visible={false} songInfoDisplay={5} track={track} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('opacity-100');
  });

  it('auto-show fades after timeout', () => {
    const { container, rerender } = render(
      <NowPlaying visible={false} songInfoDisplay={3} track={null} />,
    );

    rerender(<NowPlaying visible={false} songInfoDisplay={3} track={track} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-100');

    // Advance past timeout
    act(() => vi.advanceTimersByTime(3000));
    rerender(<NowPlaying visible={false} songInfoDisplay={3} track={track} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-0');
  });

  it('auto-show stays visible when songInfoDisplay is always', () => {
    const { container, rerender } = render(
      <NowPlaying visible={false} songInfoDisplay="always" track={null} />,
    );

    rerender(<NowPlaying visible={false} songInfoDisplay="always" track={track} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-100');

    // No timeout — should stay visible
    act(() => vi.advanceTimersByTime(10000));
    rerender(<NowPlaying visible={false} songInfoDisplay="always" track={track} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-100');
  });

  it('does not auto-show when songInfoDisplay is off', () => {
    const { container, rerender } = render(
      <NowPlaying visible={false} songInfoDisplay="off" track={null} />,
    );

    rerender(<NowPlaying visible={false} songInfoDisplay="off" track={track} />);

    expect((container.firstChild as HTMLElement).className).toContain('opacity-0');
  });

  it('manual toggle still works independently of auto-show', () => {
    const { container } = render(<NowPlaying visible={true} songInfoDisplay="off" track={track} />);
    expect((container.firstChild as HTMLElement).className).toContain('opacity-100');
  });

  it('displays local track with no artist/album', () => {
    const localTrack: NowPlayingTrackInfo = {
      title: 'my-song.mp3',
      artist: '',
      albumName: '',
      albumArtUrl: null,
    };
    render(<NowPlaying visible={true} songInfoDisplay="always" track={localTrack} />);
    expect(screen.getByText('my-song.mp3')).toBeInTheDocument();
  });
});
