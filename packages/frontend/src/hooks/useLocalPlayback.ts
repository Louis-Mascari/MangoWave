import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../engine/AudioEngine.ts';
import { useMediaPlayerStore } from '../store/useMediaPlayerStore.ts';

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
}

export function useLocalPlayback(): UseLocalPlaybackReturn {
  const engineRef = useRef<AudioEngine | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);
  const [isActive, setIsActive] = useState(false);

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
      // Clean up any existing engine
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }

      clearPlaylist();
      addTracks(files);

      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
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

    // Revoke old objectUrl from previous track in store
    const prevTrack = useMediaPlayerStore
      .getState()
      .tracks.find((t) => t.objectUrl && t !== currentTrack);
    if (prevTrack?.objectUrl) {
      URL.revokeObjectURL(prevTrack.objectUrl);
      useMediaPlayerStore.setState((state) => ({
        tracks: state.tracks.map((t) => (t.id === prevTrack.id ? { ...t, objectUrl: null } : t)),
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
  }, [currentTrack?.id, isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wire up audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isActive) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      const { repeatMode, tracks, currentTrackIndex } = useMediaPlayerStore.getState();
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else if (repeatMode === 'off' && currentTrackIndex === tracks.length - 1) {
        // Last track, no repeat — stop playback
        setIsPlaying(false);
      } else {
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
    nextTrack();
  }, [nextTrack]);

  const previous = useCallback(() => {
    previousTrack();
  }, [previousTrack]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

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
  };
}
