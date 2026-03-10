import { create } from 'zustand';

export interface MediaTrack {
  id: string;
  file: File;
  name: string;
  duration: number;
  objectUrl: string | null;
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

  addTracks: (files: File[]) => void;
  removeTrack: (id: string) => void;
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

  addTracks: (files) => {
    const newTracks: MediaTrack[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: fileNameWithoutExtension(file.name),
      duration: 0,
      objectUrl: null,
    }));
    set((state) => ({ tracks: [...state.tracks, ...newTracks] }));
  },

  removeTrack: (id) => {
    const { tracks, currentTrackIndex } = get();
    const removeIndex = tracks.findIndex((t) => t.id === id);
    if (removeIndex === -1) return;

    const track = tracks[removeIndex];
    if (track.objectUrl) {
      URL.revokeObjectURL(track.objectUrl);
    }

    const newTracks = tracks.filter((t) => t.id !== id);
    let newIndex = currentTrackIndex;
    if (removeIndex < currentTrackIndex) {
      newIndex = currentTrackIndex - 1;
    } else if (removeIndex === currentTrackIndex && newIndex >= newTracks.length) {
      newIndex = Math.max(0, newTracks.length - 1);
    }

    set({ tracks: newTracks, currentTrackIndex: newIndex });
  },

  clearPlaylist: () => {
    const { tracks } = get();
    tracks.forEach((t) => {
      if (t.objectUrl) URL.revokeObjectURL(t.objectUrl);
    });
    set({
      tracks: [],
      currentTrackIndex: 0,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    });
  },

  setCurrentTrack: (index) => set({ currentTrackIndex: index, currentTime: 0 }),

  nextTrack: () => {
    const { tracks, currentTrackIndex, shuffle } = get();
    if (tracks.length === 0) return;
    if (shuffle && tracks.length > 1) {
      let randomIndex: number;
      do {
        randomIndex = Math.floor(Math.random() * tracks.length);
      } while (randomIndex === currentTrackIndex);
      set({ currentTrackIndex: randomIndex, currentTime: 0 });
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
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
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
