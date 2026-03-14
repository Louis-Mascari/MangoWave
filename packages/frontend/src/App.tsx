import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIdleTimer } from './hooks/useIdleTimer.ts';
import { useAudioCapture } from './hooks/useAudioCapture.ts';
import { useLocalPlayback } from './hooks/useLocalPlayback.ts';
import { useMediaPlayerStore } from './store/useMediaPlayerStore.ts';
import { useSpotifyAuth } from './hooks/useSpotifyAuth.ts';
import { useSettingsSync } from './hooks/useSettingsSync.ts';
import { useNowPlaying } from './hooks/useNowPlaying.ts';
import { useAutopilot } from './hooks/useAutopilot.ts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { useHideCursor } from './hooks/useHideCursor.ts';
import { useFullscreen } from './hooks/useFullscreen.ts';
import { Visualizer } from './components/Visualizer.tsx';
import { ControlBar } from './components/ControlBar.tsx';
import type { PanelView } from './components/ControlBar.tsx';
import { PresetNotification } from './components/PresetNotification.tsx';
import { NowPlaying } from './components/NowPlaying.tsx';
import type { NowPlayingTrackInfo } from './components/NowPlaying.tsx';
import { StartScreen } from './components/StartScreen.tsx';
import { ShortcutOverlay } from './components/ShortcutOverlay.tsx';
import { LaunchAnimation } from './components/LaunchAnimation.tsx';
import { RateLimitToast } from './components/RateLimitToast.tsx';
import { ActionToast } from './components/ActionToast.tsx';
import { OnboardingOverlay } from './components/OnboardingOverlay.tsx';
import { useUnlockCheck } from './hooks/useUnlockCheck.ts';
import { useSettingsStore } from './store/useSettingsStore.ts';
import { useSpotifyStore } from './store/useSpotifyStore.ts';
import { usePresetHistoryStore } from './store/usePresetHistoryStore.ts';
import { useToastStore } from './store/useToastStore.ts';
import {
  controlPlayback,
  seekToPosition,
  toggleShuffle as apiToggleShuffle,
  setRepeatMode,
  RateLimitedError,
  PremiumRequiredError,
  TokenExpiredError,
} from './services/spotifyApi.ts';
import type { PlaybackAdapter } from './components/PlaybackControls.tsx';
import { PlaybackPanel } from './components/PlaybackPanel.tsx';
import { MediaPlaylist } from './components/MediaPlaylist.tsx';
import { isWebGL2Supported } from './engine/isWebGL2Supported.ts';
import { isMobileDevice } from './utils/isMobileDevice.ts';
import quarantinedData from './data/quarantined-presets.json';
import mobileSafeData from './data/mobile-safe-presets.json';
import type { VisualizerRenderer } from './engine/VisualizerRenderer.ts';

const quarantinedSet = new Set(quarantinedData.presets as string[]);
const mobileSafeSet = new Set(mobileSafeData.presets as string[]);

/**
 * Minimal shell for OAuth popup callbacks.
 * useSpotifyAuth runs inside and handles code exchange + window.close().
 */
function OAuthPopup() {
  useSpotifyAuth();
  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      Connecting to Spotify...
    </div>
  );
}

function App() {
  // Detect if this window is a popup OAuth callback (before any other hooks)
  const isOAuthPopup = useMemo(
    () => !!window.opener && new URLSearchParams(window.location.search).has('code'),
    [],
  );

  if (isOAuthPopup) {
    return <OAuthPopup />;
  }

  return <MainApp />;
}

function MainApp() {
  const webgl2 = useMemo(() => isWebGL2Supported(), []);
  useUnlockCheck();
  useSpotifyAuth();
  useSettingsSync();

  // Listen for popup OAuth completion/failure to rehydrate or show error
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'spotify-connected') {
        useSpotifyStore.persist.rehydrate();
      } else if (event.data?.type === 'spotify-auth-failed') {
        useToastStore
          .getState()
          .show(
            'Spotify connection failed. Please try again — if the issue persists, ' +
              "check that your account has been added to the app's authorized users.",
            { type: 'error' },
          );
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const accessToken = useSpotifyStore((s) => s.accessToken);
  const isSpotifyConnected = !!accessToken;
  useNowPlaying(isSpotifyConnected);

  const capture = useAudioCapture();
  const local = useLocalPlayback();

  // Whichever source is active provides the engine
  const audioEngine = capture.audioEngine ?? local.audioEngine;
  const isActive = capture.isCapturing || local.isActive;
  const rendererRef = useRef<VisualizerRenderer | null>(null);
  const blockedPresets = useSettingsStore((s) => s.blockedPresets);
  const favoritePresets = useSettingsStore((s) => s.favoritePresets);
  const transitionTime = useSettingsStore((s) => s.transitionTime);
  const autopilot = useSettingsStore((s) => s.autopilot);
  const setAutopilotEnabled = useSettingsStore((s) => s.setAutopilotEnabled);
  const presetNameDisplay = useSettingsStore((s) => s.presetNameDisplay);
  const songInfoDisplay = useSettingsStore((s) => s.songInfoDisplay);
  const setSongInfoDisplay = useSettingsStore((s) => s.setSongInfoDisplay);
  const toggleFavoritePreset = useSettingsStore((s) => s.toggleFavoritePreset);
  const toggleBlockPreset = useSettingsStore((s) => s.toggleBlockPreset);
  const showQuarantined = useSettingsStore((s) => s.showQuarantined);
  const quarantineOverrides = useSettingsStore((s) => s.quarantineOverrides);
  const enabledPacks = useSettingsStore((s) => s.enabledPacks);
  const [currentPreset, setCurrentPreset] = useState('');
  const [presetList, setPresetList] = useState<string[]>([]);
  const [presetPackMap, setPresetPackMap] = useState<Map<string, string>>(new Map());
  const [activePanel, setActivePanel] = useState<PanelView>('none');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLaunchAnimation, setShowLaunchAnimation] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [webglContextLost, setWebglContextLost] = useState(false);
  const silenceCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setOnboardingShown = useSettingsStore((s) => s.setOnboardingShown);
  const resetAutopilotRef = useRef<() => void>(() => {});
  const rateLimitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build effective quarantine set (quarantined minus user overrides)
  const effectiveQuarantineSet = useMemo(() => {
    if (showQuarantined) return new Set<string>();
    const overrideSet = new Set(quarantineOverrides);
    const result = new Set<string>();
    for (const name of quarantinedSet) {
      if (!overrideSet.has(name)) {
        result.add(name);
      }
    }
    return result;
  }, [showQuarantined, quarantineOverrides]);

  // Merged blocked set: user blocks + effective quarantine
  const mergedBlockedSet = useMemo(() => {
    const set = new Set(blockedPresets);
    for (const name of effectiveQuarantineSet) {
      set.add(name);
    }
    return set;
  }, [blockedPresets, effectiveQuarantineSet]);

  // Check if a preset belongs to any enabled built-in pack
  const enabledPackSet = useMemo(() => new Set(enabledPacks), [enabledPacks]);
  const isInEnabledPack = useCallback(
    (name: string) => {
      if (enabledPackSet.size === 0) return false;
      const sourcePack = presetPackMap.get(name);
      return !!sourcePack && enabledPackSet.has(sourcePack);
    },
    [enabledPackSet, presetPackMap],
  );

  const startLaunch = useCallback(() => {
    setShowLaunchAnimation(true);
    if (!useSettingsStore.getState().onboardingShown) setShowOnboarding(true);
  }, []);

  const handleStart = useCallback(async () => {
    const ok = await capture.startCapture();
    if (ok) startLaunch();
  }, [capture, startLaunch]);

  const handleMicCapture = useCallback(async () => {
    const ok = await capture.startMicCapture();
    if (ok) startLaunch();
  }, [capture, startLaunch]);

  const handleLocalFiles = useCallback(
    (files: File[]) => {
      local.startWithFiles(files);
      startLaunch();
    },
    [local, startLaunch],
  );

  const handleAddLocalFiles = useCallback((files: File[]) => {
    useMediaPlayerStore.getState().addTracks(files);
  }, []);

  const handleStop = useCallback(() => {
    if (capture.isCapturing) {
      capture.stopCapture();
    }
    if (local.isActive) {
      local.stop();
    }
    setActivePanel('none');
  }, [capture, local]);

  const handlePresetChange = useCallback((name: string) => {
    setCurrentPreset(name);
    usePresetHistoryStore.getState().push(name);
  }, []);

  const handlePresetsLoaded = useCallback((presets: string[], packMap: Map<string, string>) => {
    setPresetList(presets);
    setPresetPackMap(packMap);
  }, []);

  // Shared shuffle pick: used by both manual next and autopilot
  const pickNextPreset = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const allPresets = renderer.presetList;

    let pool: string[];
    if (autopilot.mode === 'favorites' && favoritePresets.length > 0) {
      // Favorites mode: pool is favorites only (not blocked), ignores pack filtering
      pool = favoritePresets.filter((p) => !mergedBlockedSet.has(p));
    } else if (enabledPacks.length > 0) {
      pool = allPresets.filter((p) => !mergedBlockedSet.has(p) && isInEnabledPack(p));
    } else if (presetPackMap.size > 0) {
      pool = []; // Packs initialized but none enabled
    } else {
      pool = allPresets.filter((p) => !mergedBlockedSet.has(p));
    }

    // On mobile, restrict to safe presets if the allowlist is populated
    if (isMobileDevice && mobileSafeSet.size > 0) {
      pool = pool.filter((p) => mobileSafeSet.has(p));
    }

    if (pool.length === 0) return;

    const historyStore = usePresetHistoryStore.getState();

    // Shuffle: exclude already-played presets this round
    let available = pool.filter((p) => !historyStore.playedSet.has(p));
    if (available.length === 0) {
      historyStore.resetRound();
      available = pool;
    }

    // Weighted selection: in 'all' mode, each favorite gets `weight`x the chance of a non-favorite.
    // e.g. 10 favorites, 540 others, weight=2 → favorites get 2x probability each.
    let pick: string;
    if (autopilot.mode !== 'favorites') {
      const favSet = new Set(favoritePresets);
      const weight = autopilot.favoriteWeight;
      const favCount = available.filter((p) => favSet.has(p)).length;
      const nonFavCount = available.length - favCount;
      const totalWeight = favCount * weight + nonFavCount;
      const favGroupProb = (favCount * weight) / totalWeight;

      if (favCount > 0 && Math.random() < favGroupProb) {
        const favAvailable = available.filter((p) => favSet.has(p));
        pick = favAvailable[Math.floor(Math.random() * favAvailable.length)];
      } else {
        const nonFav = available.filter((p) => !favSet.has(p));
        pick =
          nonFav.length > 0
            ? nonFav[Math.floor(Math.random() * nonFav.length)]
            : available[Math.floor(Math.random() * available.length)];
      }
    } else {
      pick = available[Math.floor(Math.random() * available.length)];
    }
    historyStore.markPlayed(pick);
    renderer.loadPreset(pick, transitionTime);
  }, [
    mergedBlockedSet,
    enabledPacks,
    isInEnabledPack,
    presetPackMap,
    favoritePresets,
    autopilot.mode,
    autopilot.favoriteWeight,
    transitionTime,
  ]);

  const handleNextPreset = useCallback(() => {
    pickNextPreset();
    resetAutopilotRef.current();
  }, [pickNextPreset]);

  const handlePreviousPreset = useCallback(() => {
    const name = usePresetHistoryStore.getState().goBack();
    if (name) {
      rendererRef.current?.loadPreset(name, transitionTime);
      resetAutopilotRef.current();
    }
  }, [transitionTime]);

  const canGoBack = usePresetHistoryStore((s) => s.cursor > 0);

  const handleSelectPreset = useCallback(
    (name: string) => {
      rendererRef.current?.loadPreset(name, transitionTime);
      resetAutopilotRef.current();
    },
    [transitionTime],
  );

  const handleWebGLContextLost = useCallback(() => {
    setWebglContextLost(true);
  }, []);

  // Silence detection for system audio — warns if no audio is flowing after capture starts
  useEffect(() => {
    if (silenceCheckRef.current) {
      clearInterval(silenceCheckRef.current);
      silenceCheckRef.current = null;
    }

    if (!isActive || capture.captureSource !== 'system' || !audioEngine) return;

    let toastShown = false;
    let checksRemaining = 4;

    // Start checking after launch animation (~2.5s), then every 1s
    silenceCheckRef.current = setInterval(() => {
      const data = audioEngine.getFrequencyData();
      if (data.length === 0) return;
      const hasSignal = data.some((v) => v > 2);

      if (hasSignal) {
        // Audio detected — cancel warning and dismiss toast if it was shown
        if (toastShown) useToastStore.getState().clear();
        clearInterval(silenceCheckRef.current!);
        silenceCheckRef.current = null;
        return;
      }

      checksRemaining--;
      if (checksRemaining <= 0 && !toastShown) {
        toastShown = true;
        useToastStore
          .getState()
          .show(
            'No audio detected — make sure audio is playing in the shared screen, window, ' +
              'or tab, and that you checked "Share audio" in the browser dialog.',
            { type: 'warning', durationMs: 8000 },
          );
      }

      // Keep checking for a few seconds after showing toast so we can dismiss it
      if (toastShown && checksRemaining <= -5) {
        clearInterval(silenceCheckRef.current!);
        silenceCheckRef.current = null;
      }
    }, 1500);

    return () => {
      if (silenceCheckRef.current) {
        clearInterval(silenceCheckRef.current);
        silenceCheckRef.current = null;
      }
    };
  }, [isActive, capture.captureSource, audioEngine]);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const handleToggleNowPlaying = useCallback(() => {
    setSongInfoDisplay(songInfoDisplay === 'off' ? 5 : 'off');
  }, [songInfoDisplay, setSongInfoDisplay]);

  const handleToggleAutopilot = useCallback(() => {
    const next = !autopilot.enabled;
    setAutopilotEnabled(next);
    useToastStore.getState().show(next ? 'Autopilot on' : 'Autopilot off');
  }, [autopilot.enabled, setAutopilotEnabled]);

  const handleTogglePanel = useCallback((panel: PanelView) => {
    setActivePanel((current) => (current === panel ? 'none' : panel));
  }, []);

  const handleClosePanel = useCallback(() => {
    setActivePanel('none');
  }, []);

  // Autopilot advance — pickNextPreset already respects mode (all vs favorites)
  const handleAutopilotAdvance = useCallback(() => {
    pickNextPreset();
  }, [pickNextPreset]);

  const { reset: resetAutopilot } = useAutopilot(handleAutopilotAdvance);
  useEffect(() => {
    resetAutopilotRef.current = resetAutopilot;
  });
  useEffect(() => {
    return () => {
      if (rateLimitTimeoutRef.current) clearTimeout(rateLimitTimeoutRef.current);
    };
  }, []);

  useHideCursor(3000);
  const isFullscreen = useFullscreen();

  // Reset autopilot timer and shuffle round when mode changes
  useEffect(() => {
    resetAutopilot();
    usePresetHistoryStore.getState().resetRound();
  }, [autopilot.mode, enabledPacks, resetAutopilot]);

  // If initial preset isn't in an enabled pack, pick one that is.
  // Only runs once — the renderer's init() already filters blocked/quarantined.
  const didFixInitialPreset = useRef(false);
  useEffect(() => {
    if (
      !didFixInitialPreset.current &&
      currentPreset &&
      enabledPacks.length > 0 &&
      presetPackMap.size > 0
    ) {
      didFixInitialPreset.current = true;
      if (!isInEnabledPack(currentPreset)) {
        pickNextPreset();
      }
    }
  }, [currentPreset, enabledPacks, presetPackMap, isInEnabledPack, pickNextPreset]);

  const handleToggleFavorite = useCallback(() => {
    if (!currentPreset) return;
    const wasFavorite = useSettingsStore.getState().favoritePresets.includes(currentPreset);
    toggleFavoritePreset(currentPreset);
    useToastStore.getState().show(wasFavorite ? 'Removed from favorites' : 'Added to favorites');
  }, [currentPreset, toggleFavoritePreset]);

  const handleToggleBlock = useCallback(() => {
    if (!currentPreset) return;
    const isCurrentlyBlocked = useSettingsStore.getState().blockedPresets.includes(currentPreset);
    toggleBlockPreset(currentPreset);
    useToastStore.getState().show(isCurrentlyBlocked ? 'Preset unblocked' : 'Preset blocked');
    // If we just blocked the current preset, skip to next
    if (!isCurrentlyBlocked) {
      handleNextPreset();
    }
  }, [currentPreset, toggleBlockPreset, handleNextPreset]);

  // --- Playback adapter (unified controls for local / spotify / mic / none) ---
  const spotifyNowPlaying = useSpotifyStore((s) => s.nowPlaying);
  const premiumError = useSpotifyStore((s) => s.premiumError);
  const setPremiumError = useSpotifyStore((s) => s.setPremiumError);
  const isRateLimited = useSpotifyStore((s) => s.isRateLimited);
  const updateIsPlaying = useSpotifyStore((s) => s.updateIsPlaying);
  const requestPoll = useSpotifyStore((s) => s.requestPoll);
  const setRateLimited = useSpotifyStore((s) => s.setRateLimited);
  const clearRateLimited = useSpotifyStore((s) => s.clearRateLimited);

  const localIsPlaying = useMediaPlayerStore((s) => s.isPlaying);
  const localCurrentTrack = useMediaPlayerStore((s) => s.tracks[s.currentTrackIndex] ?? null);
  const localShuffle = useMediaPlayerStore((s) => s.shuffle);
  const localRepeatMode = useMediaPlayerStore((s) => s.repeatMode);
  const toggleShuffle = useMediaPlayerStore((s) => s.toggleShuffle);
  const cycleRepeatMode = useMediaPlayerStore((s) => s.cycleRepeatMode);

  const handleSpotifyError = useCallback(
    (err: unknown) => {
      if (err instanceof RateLimitedError) {
        setRateLimited(err.retryAfterSeconds * 1000);
        rateLimitTimeoutRef.current = setTimeout(
          () => clearRateLimited(),
          err.retryAfterSeconds * 1000,
        );
      } else if (err instanceof PremiumRequiredError) {
        setPremiumError(true);
        useToastStore
          .getState()
          .show(
            'Spotify Premium is required for playback controls. ' +
              'You can still see now-playing info and use MangoWave with other audio sources.',
            { type: 'warning' },
          );
      } else if (err instanceof TokenExpiredError) {
        requestPoll(); // Triggers token refresh in useNowPlaying
      } else {
        useToastStore
          .getState()
          .show('Could not reach Spotify. Please check your connection and try again.', {
            type: 'error',
          });
      }
    },
    [setRateLimited, clearRateLimited, setPremiumError, requestPoll],
  );

  const handleSpotifyAction = useCallback(
    async (action: 'play' | 'pause' | 'next' | 'previous') => {
      const token = useSpotifyStore.getState().accessToken;
      if (!token) return;
      if (action === 'play') updateIsPlaying(true);
      else if (action === 'pause') updateIsPlaying(false);
      try {
        await controlPlayback(token, action);
        requestPoll();
      } catch (err) {
        handleSpotifyError(err);
      }
    },
    [updateIsPlaying, requestPoll, handleSpotifyError],
  );

  const handleSpotifySeek = useCallback(
    async (positionMs: number) => {
      const token = useSpotifyStore.getState().accessToken;
      if (!token) return;
      try {
        await seekToPosition(token, positionMs);
        requestPoll();
      } catch (err) {
        handleSpotifyError(err);
      }
    },
    [requestPoll, handleSpotifyError],
  );

  const handleSpotifyToggleShuffle = useCallback(async () => {
    const token = useSpotifyStore.getState().accessToken;
    const current = useSpotifyStore.getState().nowPlaying?.shuffleState ?? false;
    if (!token) return;
    try {
      await apiToggleShuffle(token, !current);
      requestPoll();
    } catch (err) {
      handleSpotifyError(err);
    }
  }, [requestPoll, handleSpotifyError]);

  const handleSpotifyCycleRepeat = useCallback(async () => {
    const token = useSpotifyStore.getState().accessToken;
    const current = useSpotifyStore.getState().nowPlaying?.repeatState ?? 'off';
    if (!token) return;
    const next = current === 'off' ? 'context' : current === 'context' ? 'track' : 'off';
    try {
      await setRepeatMode(token, next);
      requestPoll();
    } catch (err) {
      handleSpotifyError(err);
    }
  }, [requestPoll, handleSpotifyError]);

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
    if (capture.captureSource === 'mic') {
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
    if (capture.captureSource === 'system') {
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
    capture,
    isSpotifyConnected,
    spotifyNowPlaying,
    premiumError,
    isRateLimited,
    handleSpotifyAction,
    handleSpotifyToggleShuffle,
    handleSpotifyCycleRepeat,
  ]);

  // Whether the PlaybackPanel is visible (local or Spotify source)
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

  // Playback panel
  const handlePlaybackPanelSeek = useCallback(
    (time: number) => {
      if (local.isActive) {
        local.seek(time);
      } else if (isSpotifyConnected) {
        handleSpotifySeek(time * 1000);
      }
    },
    [local, isSpotifyConnected, handleSpotifySeek],
  );

  const {
    isIdle: playbackPanelIdle,
    pause: pausePlaybackIdle,
    resume: resumePlaybackIdle,
    forceIdle: forcePlaybackIdle,
  } = useIdleTimer(isMobileDevice ? 5000 : 3000, 5000);

  const handleToggleQueue = useCallback(() => {
    handleTogglePanel('playlist');
  }, [handleTogglePanel]);

  const handlePlayPause = useCallback(() => {
    if (!playbackAdapter.canControl) return;
    if (playbackAdapter.isPlaying) {
      playbackAdapter.onPause();
    } else {
      playbackAdapter.onPlay();
    }
  }, [playbackAdapter]);

  const handleNextTrack = useCallback(() => {
    if (!playbackAdapter.canControl) return;
    playbackAdapter.onNext();
  }, [playbackAdapter]);

  const handlePreviousTrack = useCallback(() => {
    if (!playbackAdapter.canControl) return;
    playbackAdapter.onPrevious();
  }, [playbackAdapter]);

  const { showShortcutOverlay, toggleShortcutOverlay } = useKeyboardShortcuts({
    onNextPreset: handleNextPreset,
    onPreviousPreset: handlePreviousPreset,
    onToggleFullscreen: handleToggleFullscreen,
    onClosePanel: handleClosePanel,
    onToggleAutopilot: handleToggleAutopilot,
    onToggleFavorite: handleToggleFavorite,
    onToggleBlock: handleToggleBlock,
    onToggleQueue: handleToggleQueue,
    onPlayPause: handlePlayPause,
    onNextTrack: handleNextTrack,
    onPreviousTrack: handlePreviousTrack,
  });

  if (!webgl2) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-black font-sans text-white">
        <h1 className="mb-2 text-3xl font-bold text-red-500">WebGL 2 Not Supported</h1>
        <p className="max-w-md text-center opacity-60">
          MangoWave requires WebGL 2 to render visualizations. Please try a modern browser such as
          Chrome, Firefox, or Edge.
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black">
      {isActive && audioEngine ? (
        <>
          <Visualizer
            audioEngine={audioEngine}
            rendererRef={rendererRef}
            onPresetChange={handlePresetChange}
            onPresetsLoaded={handlePresetsLoaded}
            onToggleFullscreen={handleToggleFullscreen}
            onContextLost={handleWebGLContextLost}
          />
          {webglContextLost && (
            <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 font-sans text-white">
              <h1 className="mb-2 text-2xl font-bold text-red-400">
                Visualizer Lost Graphics Context
              </h1>
              <p className="mb-6 max-w-md text-center text-sm opacity-70">
                Your device&apos;s graphics system was interrupted — this can happen when your
                device is under heavy load, the GPU is shared with other applications, or the
                display configuration changed. Reloading the page will restore the visualizer.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="cursor-pointer rounded-lg border-none bg-orange-500 px-8 py-3 text-lg font-bold text-white hover:bg-orange-400"
              >
                Reload Page
              </button>
            </div>
          )}
          {showOnboarding && (
            <OnboardingOverlay
              onComplete={() => {
                setShowOnboarding(false);
                setOnboardingShown(true);
              }}
            />
          )}
          {showLaunchAnimation && (
            <LaunchAnimation onComplete={() => setShowLaunchAnimation(false)} />
          )}
          {presetNameDisplay !== 'off' && (
            <PresetNotification message={currentPreset} mode={presetNameDisplay} />
          )}
          <RateLimitToast />
          <NowPlaying enabled={songInfoDisplay !== 'off'} track={nowPlayingTrack} />
          <ControlBar
            onNextPreset={handleNextPreset}
            onPreviousPreset={handlePreviousPreset}
            canGoBack={canGoBack}
            onSelectPreset={handleSelectPreset}
            onStop={handleStop}
            onToggleFullscreen={handleToggleFullscreen}
            isFullscreen={isFullscreen}
            presetList={presetList}
            presetPackMap={presetPackMap}
            currentPreset={currentPreset}
            autopilotEnabled={autopilot.enabled}
            onToggleAutopilot={handleToggleAutopilot}
            activePanel={activePanel}
            onTogglePanel={handleTogglePanel}
            isFavorite={favoritePresets.includes(currentPreset)}
            isBlocked={blockedPresets.includes(currentPreset)}
            onToggleFavorite={handleToggleFavorite}
            onToggleBlock={handleToggleBlock}
            onAddLocalFiles={handleAddLocalFiles}
            onClearPlaylist={local.clearQueue}
            onMobileMenuChange={setMobileMenuOpen}
            onForcePlaybackIdle={forcePlaybackIdle}
            hasPlaybackPanel={hasPlaybackPanel}
            isIdle={playbackPanelIdle}
            forceIdle={forcePlaybackIdle}
          />
          <PlaybackPanel
            adapter={playbackAdapter}
            onSeek={handlePlaybackPanelSeek}
            volume={local.isActive ? local.volume : undefined}
            onVolumeChange={local.isActive ? local.setVolume : undefined}
            isMuted={local.isActive ? local.isMuted : undefined}
            onToggleMute={local.isActive ? local.toggleMute : undefined}
            isIdle={playbackPanelIdle}
            onPauseIdle={pausePlaybackIdle}
            onResumeIdle={resumePlaybackIdle}
            nowPlayingEnabled={songInfoDisplay !== 'off'}
            onToggleNowPlaying={handleToggleNowPlaying}
            onToggleQueue={handleToggleQueue}
            isQueueOpen={activePanel === 'playlist'}
            hidden={mobileMenuOpen}
          />
          {/* Mobile queue modal — desktop queue renders inside ControlBar */}
          {isMobileDevice && activePanel === 'playlist' && (
            <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/50 backdrop-blur-sm">
              <div className="relative mx-2 my-2 flex max-h-full w-full flex-col overflow-hidden rounded-lg bg-gray-900/95">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <h3 className="text-sm font-semibold text-white">Queue</h3>
                  <button
                    onClick={() => setActivePanel('none')}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-white/10 text-sm text-white/70 hover:bg-white/20"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <MediaPlaylist onAddFiles={handleAddLocalFiles} onClear={local.clearQueue} />
                </div>
              </div>
            </div>
          )}
          <ActionToast />
          <ShortcutOverlay visible={showShortcutOverlay} onClose={toggleShortcutOverlay} />
        </>
      ) : (
        <StartScreen
          onStart={handleStart}
          onLocalFiles={handleLocalFiles}
          onMicCapture={handleMicCapture}
          error={capture.error}
          onClearError={capture.clearError}
        />
      )}
    </div>
  );
}

export default App;
