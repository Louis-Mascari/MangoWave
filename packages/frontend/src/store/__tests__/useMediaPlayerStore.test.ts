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
      shuffle: false,
      repeatMode: 'off',
      shuffleHistory: new Set(),
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

  it('toggleShuffle toggles shuffle state', () => {
    expect(useMediaPlayerStore.getState().shuffle).toBe(false);
    useMediaPlayerStore.getState().toggleShuffle();
    expect(useMediaPlayerStore.getState().shuffle).toBe(true);
    useMediaPlayerStore.getState().toggleShuffle();
    expect(useMediaPlayerStore.getState().shuffle).toBe(false);
  });

  it('cycleRepeatMode cycles off → all → one → off', () => {
    expect(useMediaPlayerStore.getState().repeatMode).toBe('off');
    useMediaPlayerStore.getState().cycleRepeatMode();
    expect(useMediaPlayerStore.getState().repeatMode).toBe('all');
    useMediaPlayerStore.getState().cycleRepeatMode();
    expect(useMediaPlayerStore.getState().repeatMode).toBe('one');
    useMediaPlayerStore.getState().cycleRepeatMode();
    expect(useMediaPlayerStore.getState().repeatMode).toBe('off');
  });

  it('nextTrack picks random index when shuffle is on with repeat', () => {
    useMediaPlayerStore
      .getState()
      .addTracks([createMockFile('a.mp3'), createMockFile('b.mp3'), createMockFile('c.mp3')]);
    useMediaPlayerStore.setState({ shuffle: true, repeatMode: 'all' });

    // Run nextTrack multiple times — should never stay on same index
    const indices = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const prev = useMediaPlayerStore.getState().currentTrackIndex;
      useMediaPlayerStore.getState().nextTrack();
      const next = useMediaPlayerStore.getState().currentTrackIndex;
      expect(next).not.toBe(prev);
      indices.add(next);
    }
    // With 3 tracks and 20 iterations, should have hit at least 2 different indices
    expect(indices.size).toBeGreaterThanOrEqual(2);
  });

  it('shuffle plays all tracks before repeating when repeat is on', () => {
    useMediaPlayerStore
      .getState()
      .addTracks([createMockFile('a.mp3'), createMockFile('b.mp3'), createMockFile('c.mp3')]);
    useMediaPlayerStore.setState({ shuffle: true, repeatMode: 'all' });

    const played = new Set<number>();
    played.add(useMediaPlayerStore.getState().currentTrackIndex);

    // Should visit all 3 tracks within 3 nextTrack calls (2 unplayed + reset)
    for (let i = 0; i < 2; i++) {
      useMediaPlayerStore.getState().nextTrack();
      played.add(useMediaPlayerStore.getState().currentTrackIndex);
    }
    expect(played.size).toBe(3);
  });

  it('shuffle stops when all tracks played and repeat is off', () => {
    useMediaPlayerStore.getState().addTracks([createMockFile('a.mp3'), createMockFile('b.mp3')]);
    useMediaPlayerStore.setState({ shuffle: true, repeatMode: 'off' });

    // Play through all tracks
    useMediaPlayerStore.getState().nextTrack(); // plays second track
    useMediaPlayerStore.getState().nextTrack(); // all played, should stop

    expect(useMediaPlayerStore.getState().isPlaying).toBe(false);
  });

  it('moveTrack reorders tracks and adjusts currentTrackIndex when moving current track', () => {
    useMediaPlayerStore
      .getState()
      .addTracks([createMockFile('a.mp3'), createMockFile('b.mp3'), createMockFile('c.mp3')]);
    useMediaPlayerStore.getState().setCurrentTrack(0); // playing 'a'

    useMediaPlayerStore.getState().moveTrack(0, 2); // move 'a' to end

    const state = useMediaPlayerStore.getState();
    expect(state.tracks[0].name).toBe('b');
    expect(state.tracks[1].name).toBe('c');
    expect(state.tracks[2].name).toBe('a');
    expect(state.currentTrackIndex).toBe(2); // follows the playing track
  });

  it('moveTrack adjusts currentTrackIndex when moving a track before current', () => {
    useMediaPlayerStore
      .getState()
      .addTracks([createMockFile('a.mp3'), createMockFile('b.mp3'), createMockFile('c.mp3')]);
    useMediaPlayerStore.getState().setCurrentTrack(2); // playing 'c'

    useMediaPlayerStore.getState().moveTrack(0, 2); // move 'a' past 'c'

    const state = useMediaPlayerStore.getState();
    expect(state.tracks[2].name).toBe('a');
    expect(state.currentTrackIndex).toBe(1); // 'c' shifted left
  });

  it('moveTrack remaps shuffleHistory indices', () => {
    useMediaPlayerStore
      .getState()
      .addTracks([createMockFile('a.mp3'), createMockFile('b.mp3'), createMockFile('c.mp3')]);
    // Mark tracks 0 and 1 as played
    useMediaPlayerStore.setState({ shuffleHistory: new Set([0, 1]) });

    useMediaPlayerStore.getState().moveTrack(0, 2); // a moves to end: [b, c, a]

    const history = useMediaPlayerStore.getState().shuffleHistory;
    // Track 'a' was at 0, now at 2. Track 'b' was at 1, now at 0.
    expect(history.has(2)).toBe(true); // 'a' (was 0)
    expect(history.has(0)).toBe(true); // 'b' (was 1)
    expect(history.has(1)).toBe(false);
  });

  it('moveTrack no-ops for invalid or same indices', () => {
    useMediaPlayerStore.getState().addTracks([createMockFile('a.mp3'), createMockFile('b.mp3')]);

    useMediaPlayerStore.getState().moveTrack(0, 0); // same index
    expect(useMediaPlayerStore.getState().tracks[0].name).toBe('a');

    useMediaPlayerStore.getState().moveTrack(-1, 0); // negative
    expect(useMediaPlayerStore.getState().tracks[0].name).toBe('a');

    useMediaPlayerStore.getState().moveTrack(0, 5); // out of bounds
    expect(useMediaPlayerStore.getState().tracks[0].name).toBe('a');
  });

  it('toggleShuffle resets shuffle history', () => {
    useMediaPlayerStore.getState().addTracks([createMockFile('a.mp3'), createMockFile('b.mp3')]);
    useMediaPlayerStore.setState({ shuffle: true });
    useMediaPlayerStore.getState().nextTrack();
    expect(useMediaPlayerStore.getState().shuffleHistory.size).toBeGreaterThan(0);

    useMediaPlayerStore.getState().toggleShuffle();
    expect(useMediaPlayerStore.getState().shuffleHistory.size).toBe(0);
  });
});
