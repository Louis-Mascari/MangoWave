import { create } from 'zustand';

export interface MediaTrack {
  id: string;
  file: File;
  name: string;
  duration: number;
  objectUrl: string | null;
}

interface MediaPlayerState {
  tracks: MediaTrack[];
  currentTrackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;

  addTracks: (files: File[]) => void;
  removeTrack: (id: string) => void;
  clearPlaylist: () => void;
  setCurrentTrack: (index: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
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
    const { tracks, currentTrackIndex } = get();
    if (tracks.length === 0) return;
    set({ currentTrackIndex: (currentTrackIndex + 1) % tracks.length, currentTime: 0 });
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
}));
