import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../engine/AudioEngine.ts';
import { useMediaPlayerStore } from '../store/useMediaPlayerStore.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';

export interface UseLocalPlaybackReturn {
  audioEngine: AudioEngine | null;
  isActive: boolean;
  startWithFiles: (files: File[]) => void;
  stop: () => void;
  clearQueue: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  volume: number;
  setVolume: (volume: number) => void;
  isMuted: boolean;
  toggleMute: () => void;
}

export function useLocalPlayback(): UseLocalPlaybackReturn {
  const engineRef = useRef<AudioEngine | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);
  const [isActive, setIsActive] = useState(false);
  const savedVolume = useSettingsStore((s) => s.volume);
  const persistVolume = useSettingsStore((s) => s.setVolume);
  const [volume, setVolumeState] = useState(savedVolume);
  const [isMuted, setIsMuted] = useState(false);
  const preMuteVolumeRef = useRef(savedVolume);

  const tracks = useMediaPlayerStore((s) => s.tracks);
  const currentTrackIndex = useMediaPlayerStore((s) => s.currentTrackIndex);
  const addTracks = useMediaPlayerStore((s) => s.addTracks);
  const clearPlaylist = useMediaPlayerStore((s) => s.clearPlaylist);
  const nextTrack = useMediaPlayerStore((s) => s.nextTrack);
  const previousTrack = useMediaPlayerStore((s) => s.previousTrack);
  const setIsPlaying = useMediaPlayerStore((s) => s.setIsPlaying);
  const setCurrentTime = useMediaPlayerStore((s) => s.setCurrentTime);
  const setDuration = useMediaPlayerStore((s) => s.setDuration);

  const currentTrack = tracks[currentTrackIndex] ?? null;

  // Initialize audio element + engine on first file load
  const startWithFiles = useCallback(
    (files: File[]) => {
      // Clean up any existing audio element and engine
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }

      clearPlaylist();
      addTracks(files);

      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.volume = useSettingsStore.getState().volume;
      audioRef.current = audio;

      const engine = new AudioEngine();
      engine.initFromMediaElement(audio);
      engineRef.current = engine;
      setAudioEngine(engine);
      setIsActive(true);
    },
    [addTracks, clearPlaylist],
  );

  // Load and play track when currentTrack changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isActive || !currentTrack) return;

    // Revoke ALL stale objectUrls from other tracks
    const staleTracks = useMediaPlayerStore
      .getState()
      .tracks.filter((t) => t.objectUrl && t.id !== currentTrack.id);
    if (staleTracks.length > 0) {
      staleTracks.forEach((t) => URL.revokeObjectURL(t.objectUrl!));
      useMediaPlayerStore.setState((state) => ({
        tracks: state.tracks.map((t) =>
          staleTracks.some((s) => s.id === t.id) ? { ...t, objectUrl: null } : t,
        ),
      }));
    }

    // Create objectUrl for current track
    const url = URL.createObjectURL(currentTrack.file);
    useMediaPlayerStore.setState((state) => ({
      tracks: state.tracks.map((t) => (t.id === currentTrack.id ? { ...t, objectUrl: url } : t)),
    }));

    audio.src = url;
    audio.play().catch(() => {
      // Autoplay may be blocked
    });

    return () => {
      // Revoke on cleanup (unmount or track change)
      URL.revokeObjectURL(url);
    };
  }, [currentTrack?.id, isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wire up audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isActive) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      // Also update the track's duration in the store for the queue panel
      const { tracks, currentTrackIndex } = useMediaPlayerStore.getState();
      const track = tracks[currentTrackIndex];
      if (track && track.duration !== audio.duration) {
        useMediaPlayerStore.setState((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === track.id ? { ...t, duration: audio.duration } : t,
          ),
        }));
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      const { repeatMode } = useMediaPlayerStore.getState();
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        // nextTrack handles shuffle history, repeat-off stopping, and wrapping
        nextTrack();
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [isActive, setCurrentTime, setDuration, setIsPlaying, nextTrack]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    clearPlaylist();
    setAudioEngine(null);
    setIsActive(false);
  }, [clearPlaylist]);

  const clearQueue = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    clearPlaylist();
  }, [clearPlaylist]);

  const play = useCallback(() => {
    audioRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const next = useCallback(() => {
    const { tracks } = useMediaPlayerStore.getState();
    if (tracks.length <= 1 && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      return;
    }
    nextTrack();
  }, [nextTrack]);

  const previous = useCallback(() => {
    const { tracks } = useMediaPlayerStore.getState();
    if (tracks.length <= 1 && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      return;
    }
    previousTrack();
  }, [previousTrack]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const setVolume = useCallback(
    (vol: number) => {
      setVolumeState(vol);
      setIsMuted(vol === 0);
      if (audioRef.current) {
        audioRef.current.volume = vol;
      }
      if (vol > 0) persistVolume(vol);
    },
    [persistVolume],
  );

  const toggleMute = useCallback(() => {
    if (isMuted) {
      const restored = preMuteVolumeRef.current || 1;
      setVolumeState(restored);
      setIsMuted(false);
      if (audioRef.current) audioRef.current.volume = restored;
    } else {
      preMuteVolumeRef.current = volume;
      setVolumeState(0);
      setIsMuted(true);
      if (audioRef.current) audioRef.current.volume = 0;
    }
  }, [isMuted, volume]);

  return {
    audioEngine,
    isActive,
    startWithFiles,
    stop,
    clearQueue,
    play,
    pause,
    next,
    previous,
    seek,
    volume,
    setVolume,
    isMuted,
    toggleMute,
  };
}
