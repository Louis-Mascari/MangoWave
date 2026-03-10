import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMediaPlayerStore } from '../useMediaPlayerStore.ts';

const createMockFile = (name: string) => new File(['audio data'], name, { type: 'audio/mp3' });

describe('useMediaPlayerStore', () => {
  beforeEach(() => {
    useMediaPlayerStore.setState({
      tracks: [],
      currentTrackIndex: 0,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    });
    vi.restoreAllMocks();
  });

  it('starts with empty state', () => {
    const state = useMediaPlayerStore.getState();
    expect(state.tracks).toHaveLength(0);
    expect(state.currentTrackIndex).toBe(0);
    expect(state.isPlaying).toBe(false);
  });

  it('addTracks adds files to playlist', () => {
    const files = [createMockFile('song1.mp3'), createMockFile('song2.mp3')];
    useMediaPlayerStore.getState().addTracks(files);

    const state = useMediaPlayerStore.getState();
    expect(state.tracks).toHaveLength(2);
    expect(state.tracks[0].name).toBe('song1');
    expect(state.tracks[1].name).toBe('song2');
  });

  it('nextTrack wraps around', () => {
    useMediaPlayerStore.getState().addTracks([createMockFile('a.mp3'), createMockFile('b.mp3')]);
    useMediaPlayerStore.getState().setCurrentTrack(1);
    useMediaPlayerStore.getState().nextTrack();
    expect(useMediaPlayerStore.getState().currentTrackIndex).toBe(0);
  });

  it('previousTrack wraps around', () => {
    useMediaPlayerStore.getState().addTracks([createMockFile('a.mp3'), createMockFile('b.mp3')]);
    useMediaPlayerStore.getState().previousTrack();
    expect(useMediaPlayerStore.getState().currentTrackIndex).toBe(1);
  });

  it('removeTrack removes and adjusts index', () => {
    useMediaPlayerStore
      .getState()
      .addTracks([createMockFile('a.mp3'), createMockFile('b.mp3'), createMockFile('c.mp3')]);
    useMediaPlayerStore.getState().setCurrentTrack(2);

    const idToRemove = useMediaPlayerStore.getState().tracks[0].id;
    useMediaPlayerStore.getState().removeTrack(idToRemove);

    const state = useMediaPlayerStore.getState();
    expect(state.tracks).toHaveLength(2);
    expect(state.currentTrackIndex).toBe(1); // Shifted down
  });

  it('clearPlaylist resets everything', () => {
    useMediaPlayerStore.getState().addTracks([createMockFile('a.mp3')]);
    useMediaPlayerStore.getState().setIsPlaying(true);
    useMediaPlayerStore.getState().clearPlaylist();

    const state = useMediaPlayerStore.getState();
    expect(state.tracks).toHaveLength(0);
    expect(state.isPlaying).toBe(false);
    expect(state.currentTrackIndex).toBe(0);
  });

  it('strips file extension from name', () => {
    useMediaPlayerStore.getState().addTracks([createMockFile('My Song.flac')]);
    expect(useMediaPlayerStore.getState().tracks[0].name).toBe('My Song');
  });
});
