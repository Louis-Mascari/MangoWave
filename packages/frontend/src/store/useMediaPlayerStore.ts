import { parseBlob } from 'music-metadata';
import { create } from 'zustand';

export interface MediaTrack {
  id: string;
  file: File;
  name: string;
  duration: number;
  objectUrl: string | null;
  artist?: string;
  album?: string;
  albumArtUrl?: string | null;
}

export type RepeatMode = 'off' | 'all' | 'one';

interface MediaPlayerState {
  tracks: MediaTrack[];
  currentTrackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  shuffleHistory: Set<number>;

  addTracks: (files: File[]) => void;
  setTrackDuration: (id: string, duration: number) => void;
  setTrackMetadata: (
    id: string,
    meta: { name?: string; artist?: string; album?: string; albumArtUrl?: string | null },
  ) => void;
  removeTrack: (id: string) => void;
  moveTrack: (fromIndex: number, toIndex: number) => void;
  clearPlaylist: () => void;
  setCurrentTrack: (index: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
}

function fileNameWithoutExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

export const useMediaPlayerStore = create<MediaPlayerState>()((set, get) => ({
  tracks: [],
  currentTrackIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  shuffle: false,
  repeatMode: 'off' as RepeatMode,
  shuffleHistory: new Set<number>(),

  addTracks: (files) => {
    const newTracks: MediaTrack[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: fileNameWithoutExtension(file.name),
      duration: 0,
      objectUrl: null,
    }));
    set((state) => ({ tracks: [...state.tracks, ...newTracks] }));

    // Probe durations in the background via temporary Audio elements
    for (const track of newTracks) {
      const probe = new Audio();
      const url = URL.createObjectURL(track.file);
      probe.preload = 'metadata';
      probe.addEventListener(
        'loadedmetadata',
        () => {
          get().setTrackDuration(track.id, probe.duration);
          URL.revokeObjectURL(url);
        },
        { once: true },
      );
      probe.addEventListener(
        'error',
        () => {
          URL.revokeObjectURL(url);
        },
        { once: true },
      );
      probe.src = url;
    }

    // Parse ID3 metadata in the background
    for (const track of newTracks) {
      parseBlob(track.file, { skipCovers: false })
        .then((metadata) => {
          const title = metadata.common.title;
          const artist = metadata.common.artist;
          const album = metadata.common.album;
          const picture = metadata.common.picture?.[0];
          let albumArtUrl: string | null = null;
          if (picture) {
            const blob = new Blob([picture.data], { type: picture.format });
            albumArtUrl = URL.createObjectURL(blob);
          }
          get().setTrackMetadata(track.id, {
            name: title || undefined,
            artist,
            album,
            albumArtUrl,
          });
        })
        .catch(() => {
          // No metadata — filename fallback already in place
        });
    }
  },

  setTrackDuration: (id, duration) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, duration } : t)),
    }));
  },

  setTrackMetadata: (id, meta) => {
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== id) return t;
        const update: Partial<MediaTrack> = {};
        if (meta.name !== undefined) update.name = meta.name;
        if (meta.artist !== undefined) update.artist = meta.artist;
        if (meta.album !== undefined) update.album = meta.album;
        if (meta.albumArtUrl !== undefined) update.albumArtUrl = meta.albumArtUrl;
        return { ...t, ...update };
      }),
    }));
  },

  removeTrack: (id) => {
    const { tracks, currentTrackIndex } = get();
    const removeIndex = tracks.findIndex((t) => t.id === id);
    if (removeIndex === -1) return;

    const track = tracks[removeIndex];
    if (track.objectUrl) {
      URL.revokeObjectURL(track.objectUrl);
    }
    if (track.albumArtUrl) {
      URL.revokeObjectURL(track.albumArtUrl);
    }

    const newTracks = tracks.filter((t) => t.id !== id);
    let newIndex = currentTrackIndex;
    if (removeIndex < currentTrackIndex) {
      newIndex = currentTrackIndex - 1;
    } else if (removeIndex === currentTrackIndex && newIndex >= newTracks.length) {
      newIndex = Math.max(0, newTracks.length - 1);
    }

    // Rebuild shuffle history with adjusted indices
    const newHistory = new Set<number>();
    for (const idx of get().shuffleHistory) {
      if (idx < removeIndex) newHistory.add(idx);
      else if (idx > removeIndex) newHistory.add(idx - 1);
      // idx === removeIndex is dropped
    }

    set({ tracks: newTracks, currentTrackIndex: newIndex, shuffleHistory: newHistory });
  },

  moveTrack: (fromIndex, toIndex) => {
    const { tracks, currentTrackIndex, shuffleHistory } = get();
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= tracks.length ||
      toIndex >= tracks.length
    )
      return;

    const newTracks = [...tracks];
    const [moved] = newTracks.splice(fromIndex, 1);
    newTracks.splice(toIndex, 0, moved);

    // Adjust currentTrackIndex to follow the currently playing track
    let newIndex = currentTrackIndex;
    if (currentTrackIndex === fromIndex) {
      newIndex = toIndex;
    } else if (fromIndex < currentTrackIndex && toIndex >= currentTrackIndex) {
      newIndex = currentTrackIndex - 1;
    } else if (fromIndex > currentTrackIndex && toIndex <= currentTrackIndex) {
      newIndex = currentTrackIndex + 1;
    }

    // Rebuild shuffle history with remapped indices
    const indexMap = new Map<number, number>();
    for (let i = 0; i < tracks.length; i++) {
      const originalTrack = tracks[i];
      const newPos = newTracks.indexOf(originalTrack);
      indexMap.set(i, newPos);
    }
    const newHistory = new Set<number>();
    for (const idx of shuffleHistory) {
      const mapped = indexMap.get(idx);
      if (mapped !== undefined) newHistory.add(mapped);
    }

    set({ tracks: newTracks, currentTrackIndex: newIndex, shuffleHistory: newHistory });
  },

  clearPlaylist: () => {
    const { tracks } = get();
    tracks.forEach((t) => {
      if (t.objectUrl) URL.revokeObjectURL(t.objectUrl);
      if (t.albumArtUrl) URL.revokeObjectURL(t.albumArtUrl);
    });
    set({
      tracks: [],
      currentTrackIndex: 0,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      shuffleHistory: new Set(),
    });
  },

  setCurrentTrack: (index) => {
    const history = new Set(get().shuffleHistory);
    history.add(index);
    set({ currentTrackIndex: index, currentTime: 0, shuffleHistory: history });
  },

  nextTrack: () => {
    const { tracks, currentTrackIndex, shuffle, shuffleHistory, repeatMode } = get();
    if (tracks.length === 0) return;

    if (shuffle && tracks.length > 1) {
      // Mark current as played
      const history = new Set(shuffleHistory);
      history.add(currentTrackIndex);

      // Find unplayed tracks
      const unplayed = tracks
        .map((_, i) => i)
        .filter((i) => !history.has(i) && i !== currentTrackIndex);

      if (unplayed.length === 0) {
        // All tracks played
        if (repeatMode !== 'off') {
          // Reset history and pick random (not current)
          const newHistory = new Set<number>();
          let randomIndex: number;
          do {
            randomIndex = Math.floor(Math.random() * tracks.length);
          } while (randomIndex === currentTrackIndex && tracks.length > 1);
          newHistory.add(randomIndex);
          set({ currentTrackIndex: randomIndex, currentTime: 0, shuffleHistory: newHistory });
        } else {
          // All played, repeat off — stop playback and reset to first track
          set({
            isPlaying: false,
            currentTrackIndex: 0,
            currentTime: 0,
            shuffleHistory: new Set(),
          });
        }
      } else {
        // Pick random from unplayed
        const randomIndex = unplayed[Math.floor(Math.random() * unplayed.length)];
        history.add(randomIndex);
        set({ currentTrackIndex: randomIndex, currentTime: 0, shuffleHistory: history });
      }
    } else {
      set({ currentTrackIndex: (currentTrackIndex + 1) % tracks.length, currentTime: 0 });
    }
  },

  previousTrack: () => {
    const { tracks, currentTrackIndex } = get();
    if (tracks.length === 0) return;
    set({
      currentTrackIndex: (currentTrackIndex - 1 + tracks.length) % tracks.length,
      currentTime: 0,
    });
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  toggleShuffle: () =>
    set((state) => ({ shuffle: !state.shuffle, shuffleHistory: new Set<number>() })),
  cycleRepeatMode: () =>
    set((state) => {
      const next: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
      return { repeatMode: next[state.repeatMode] };
    }),
}));

// Expose stores on window in dev mode for console QA
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).useMediaPlayerStore = useMediaPlayerStore;
}
