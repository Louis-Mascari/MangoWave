import { useMemo } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { useMediaPlayerStore } from '../store/useMediaPlayerStore.ts';
import type { PlaybackAdapter } from '../components/PlaybackControls.tsx';
import type { NowPlayingTrackInfo } from '../components/NowPlaying.tsx';

interface UsePlaybackAdapterParams {
  local: {
    isActive: boolean;
    play: () => void;
    pause: () => void;
    next: () => void;
    previous: () => void;
  };
  captureSource: 'system' | 'mic' | null;
  isSpotifyConnected: boolean;
  spotifyActions: {
    handleSpotifyAction: (action: 'play' | 'pause' | 'next' | 'previous') => Promise<void>;
    handleSpotifyToggleShuffle: () => Promise<void>;
    handleSpotifyCycleRepeat: () => Promise<void>;
  };
}

export interface UsePlaybackAdapterReturn {
  playbackAdapter: PlaybackAdapter;
  nowPlayingTrack: NowPlayingTrackInfo | null;
  hasPlaybackPanel: boolean;
}

export function usePlaybackAdapter({
  local,
  captureSource,
  isSpotifyConnected,
  spotifyActions,
}: UsePlaybackAdapterParams): UsePlaybackAdapterReturn {
  const spotifyNowPlaying = useSpotifyStore((s) => s.nowPlaying);
  const premiumError = useSpotifyStore((s) => s.premiumError);
  const isRateLimited = useSpotifyStore((s) => s.isRateLimited);

  const localIsPlaying = useMediaPlayerStore((s) => s.isPlaying);
  const localCurrentTrack = useMediaPlayerStore((s) => s.tracks[s.currentTrackIndex] ?? null);
  const localShuffle = useMediaPlayerStore((s) => s.shuffle);
  const localRepeatMode = useMediaPlayerStore((s) => s.repeatMode);
  const toggleShuffle = useMediaPlayerStore((s) => s.toggleShuffle);
  const cycleRepeatMode = useMediaPlayerStore((s) => s.cycleRepeatMode);

  const { handleSpotifyAction, handleSpotifyToggleShuffle, handleSpotifyCycleRepeat } =
    spotifyActions;

  const playbackAdapter: PlaybackAdapter = useMemo(() => {
    if (local.isActive) {
      const handleLocalPlay = () => {
        // If the playlist fully ended (last track, not playing, audio at end), restart
        const { tracks, currentTrackIndex, isPlaying, currentTime, duration } =
          useMediaPlayerStore.getState();
        const atEnd = duration > 0 && currentTime >= duration - 0.5;
        if (!isPlaying && atEnd && tracks.length > 0 && currentTrackIndex === tracks.length - 1) {
          useMediaPlayerStore.getState().setCurrentTrack(0);
        } else {
          local.play();
        }
      };
      return {
        source: 'local',
        isPlaying: localIsPlaying,
        canControl: !!localCurrentTrack,
        onPlay: handleLocalPlay,
        onPause: local.pause,
        onNext: local.next,
        onPrevious: local.previous,
        shuffle: localShuffle,
        repeatMode: localRepeatMode,
        onToggleShuffle: toggleShuffle,
        onCycleRepeat: cycleRepeatMode,
      };
    }
    if (captureSource === 'mic') {
      return {
        source: 'mic',
        isPlaying: false,
        canControl: false,
        onPlay: () => {},
        onPause: () => {},
        onNext: () => {},
        onPrevious: () => {},
        tooltip: 'Microphone input — no playback controls',
      };
    }
    if (isSpotifyConnected && !premiumError) {
      return {
        source: 'spotify',
        isPlaying: spotifyNowPlaying?.isPlaying ?? false,
        canControl: !isRateLimited,
        onPlay: () => handleSpotifyAction('play'),
        onPause: () => handleSpotifyAction('pause'),
        onNext: () => handleSpotifyAction('next'),
        onPrevious: () => handleSpotifyAction('previous'),
        shuffle: spotifyNowPlaying?.shuffleState ?? false,
        repeatMode:
          spotifyNowPlaying?.repeatState === 'track'
            ? 'one'
            : spotifyNowPlaying?.repeatState === 'context'
              ? 'all'
              : 'off',
        onToggleShuffle: handleSpotifyToggleShuffle,
        onCycleRepeat: handleSpotifyCycleRepeat,
        tooltip: isRateLimited ? 'Spotify rate limited' : undefined,
      };
    }
    if (captureSource === 'system') {
      return {
        source: 'system',
        isPlaying: false,
        canControl: false,
        onPlay: () => {},
        onPause: () => {},
        onNext: () => {},
        onPrevious: () => {},
        tooltip: 'Sharing audio — no playback controls',
      };
    }
    return {
      source: 'none',
      isPlaying: false,
      canControl: false,
      onPlay: () => {},
      onPause: () => {},
      onNext: () => {},
      onPrevious: () => {},
    };
  }, [
    local,
    localIsPlaying,
    localCurrentTrack,
    localShuffle,
    localRepeatMode,
    toggleShuffle,
    cycleRepeatMode,
    captureSource,
    isSpotifyConnected,
    spotifyNowPlaying,
    premiumError,
    isRateLimited,
    handleSpotifyAction,
    handleSpotifyToggleShuffle,
    handleSpotifyCycleRepeat,
  ]);

  const hasPlaybackPanel = local.isActive || (isSpotifyConnected && !premiumError);

  const nowPlayingTrack: NowPlayingTrackInfo | null = useMemo(() => {
    if (local.isActive && localCurrentTrack) {
      return {
        title: localCurrentTrack.name,
        artist: localCurrentTrack.artist ?? '',
        albumName: localCurrentTrack.album ?? '',
        albumArtUrl: localCurrentTrack.albumArtUrl ?? null,
      };
    }
    if (spotifyNowPlaying) {
      return {
        title: spotifyNowPlaying.title,
        artist: spotifyNowPlaying.artist,
        albumName: spotifyNowPlaying.albumName,
        albumArtUrl: spotifyNowPlaying.albumArtUrl,
      };
    }
    return null;
  }, [local.isActive, localCurrentTrack, spotifyNowPlaying]);

  return { playbackAdapter, nowPlayingTrack, hasPlaybackPanel };
}
