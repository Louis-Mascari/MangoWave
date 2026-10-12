import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalPlayback } from '../useLocalPlayback.ts';
import { useMediaPlayerStore } from '../../store/useMediaPlayerStore.ts';
import { useToastStore } from '../../store/useToastStore.ts';

vi.mock('../../engine/AudioEngine.ts', () => ({
  AudioEngine: class {
    initFromMediaElement = vi.fn();
    destroy = vi.fn();
  },
  EQ_BANDS: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
}));

// Stands in for HTMLAudioElement so the tests drive `ended` and `error` themselves and
// never depend on real audio advancing in real time
class FakeAudio extends EventTarget {
  static last: FakeAudio;
  src = '';
  volume = 1;
  currentTime = 0;
  duration = 1;
  paused = true;
  playable = true;
  play = vi.fn(() => {
    if (!this.playable) return Promise.reject(new DOMException('no source', 'NotSupportedError'));
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  constructor() {
    super();
    FakeAudio.last = this;
  }
  /** What a browser does when a track plays through to its end. */
  finish() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
    this.dispatchEvent(new Event('ended'));
  }
}

const files = (...names: string[]) => names.map((n) => new File(['x'], n, { type: 'audio/mpeg' }));

function start(...names: string[]) {
  const hook = renderHook(() => useLocalPlayback());
  act(() => hook.result.current.startWithFiles(files(...names)));
  return { hook, audio: FakeAudio.last };
}

const state = () => useMediaPlayerStore.getState();

describe('useLocalPlayback end-of-queue behaviour', () => {
  beforeEach(() => {
    vi.stubGlobal('Audio', FakeAudio);
    let n = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++n}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    useMediaPlayerStore.getState().clearPlaylist();
    useMediaPlayerStore.setState({ repeatMode: 'off', shuffle: false, isPlaying: false });
    useToastStore.getState().clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('plays through the queue once and stops cued on the first track with repeat off', () => {
    const { audio } = start('a.mp3', 'b.mp3');
    expect(audio.play).toHaveBeenCalledTimes(1);

    act(() => audio.finish());
    expect(state().currentTrackIndex).toBe(1);
    expect(audio.play).toHaveBeenCalledTimes(2);

    const srcOfSecond = audio.src;
    act(() => audio.finish());

    expect(state()).toMatchObject({ currentTrackIndex: 0, isPlaying: false });
    // The first track is loaded again but not played
    expect(audio.src).not.toBe(srcOfSecond);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('wraps and keeps playing with repeat all', () => {
    const { audio } = start('a.mp3', 'b.mp3');
    useMediaPlayerStore.setState({ repeatMode: 'all' });

    act(() => audio.finish());
    act(() => audio.finish());

    expect(state().currentTrackIndex).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(3);
    expect(state().isPlaying).toBe(true);
  });

  it('plays again from the first track when Play is pressed after the stop', () => {
    const { hook, audio } = start('a.mp3', 'b.mp3');
    act(() => audio.finish());
    act(() => audio.finish());

    act(() => hook.result.current.play());

    expect(audio.play).toHaveBeenCalledTimes(3);
    expect(state()).toMatchObject({ currentTrackIndex: 0, isPlaying: true });
  });

  it('stays stopped when the track cued at the end turns out to be unreadable', () => {
    const { audio } = start('broken.mp3', 'good.mp3');
    // The broken first track fails to load and the queue moves on
    act(() => audio.dispatchEvent(new Event('error')));
    expect(state().currentTrackIndex).toBe(1);

    act(() => audio.finish());
    expect(state().currentTrackIndex).toBe(0);
    const playsAtStop = audio.play.mock.calls.length;

    // Cueing the broken track fires its load error again; that must not restart the queue
    act(() => audio.dispatchEvent(new Event('error')));

    expect(state()).toMatchObject({ currentTrackIndex: 0, isPlaying: false });
    expect(audio.play).toHaveBeenCalledTimes(playsAtStop);
  });

  it('still skips an unreadable track in the middle of the queue', () => {
    const { audio } = start('a.mp3', 'broken.mp3', 'c.mp3');
    act(() => audio.finish());
    expect(state().currentTrackIndex).toBe(1);

    act(() => audio.dispatchEvent(new Event('error')));

    expect(state().currentTrackIndex).toBe(2);
  });

  it('explains itself when Play is pressed on a track that cannot be played', async () => {
    const { hook, audio } = start('broken.mp3', 'good.mp3');
    audio.playable = false;

    await act(async () => {
      hook.result.current.play();
    });

    expect(useToastStore.getState().message).toContain('broken.mp3');
  });

  it('stays quiet when Play is merely interrupted', async () => {
    const { hook, audio } = start('a.mp3', 'b.mp3');
    audio.play.mockImplementationOnce(() =>
      Promise.reject(new DOMException('interrupted by pause', 'AbortError')),
    );

    await act(async () => {
      hook.result.current.play();
    });

    expect(useToastStore.getState().message).toBeNull();
  });
});
