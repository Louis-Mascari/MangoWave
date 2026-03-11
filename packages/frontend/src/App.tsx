import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useUnlockCheck } from './hooks/useUnlockCheck.ts';
import { useSettingsStore } from './store/useSettingsStore.ts';
import { useSpotifyStore } from './store/useSpotifyStore.ts';
import { usePresetHistoryStore } from './store/usePresetHistoryStore.ts';
import { useCustomPackStore } from './store/useCustomPackStore.ts';
import { useToastStore } from './store/useToastStore.ts';
import mangosPicks from './data/mangos-picks.json';
import { controlPlayback, RateLimitedError } from './services/spotifyApi.ts';
import type { PlaybackAdapter } from './components/PlaybackControls.tsx';
import { isWebGL2Supported } from './engine/isWebGL2Supported.ts';
import { isMobileDevice } from './utils/isMobileDevice.ts';
import quarantinedData from './data/quarantined-presets.json';
import type { VisualizerRenderer } from './engine/VisualizerRenderer.ts';

const quarantinedSet = new Set(quarantinedData.presets as string[]);
const mangosPicksSet = new Set(mangosPicks as string[]);
const MANGOS_PICKS_PACK = "Mango's Picks";

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

  // Listen for popup OAuth completion to rehydrate Spotify store
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'spotify-connected') {
        useSpotifyStore.persist.rehydrate();
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
  const toggleFavoritePreset = useSettingsStore((s) => s.toggleFavoritePreset);
  const toggleBlockPreset = useSettingsStore((s) => s.toggleBlockPreset);
  const showQuarantined = useSettingsStore((s) => s.showQuarantined);
  const quarantineOverrides = useSettingsStore((s) => s.quarantineOverrides);
  const enabledPacks = useSettingsStore((s) => s.enabledPacks);
  const [currentPreset, setCurrentPreset] = useState('');
  const [presetList, setPresetList] = useState<string[]>([]);
  const [presetPackMap, setPresetPackMap] = useState<Map<string, string>>(new Map());
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelView>('none');
  const [showLaunchAnimation, setShowLaunchAnimation] = useState(false);
  const resetAutopilotRef = useRef<() => void>(() => {});

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

  // Check if a preset belongs to any enabled pack
  const enabledPackSet = useMemo(() => new Set(enabledPacks), [enabledPacks]);
  const isInEnabledPack = useCallback(
    (name: string) => {
      // If no packs are enabled, nothing passes
      if (enabledPackSet.size === 0) return false;
      // Check Mango's Picks membership
      if (mangosPicksSet.has(name) && enabledPackSet.has(MANGOS_PICKS_PACK)) return true;
      // Check source pack
      const sourcePack = presetPackMap.get(name);
      if (sourcePack && enabledPackSet.has(sourcePack)) return true;
      return false;
    },
    [enabledPackSet, presetPackMap],
  );

  const handleStart = useCallback(async () => {
    await capture.startCapture();
    setShowLaunchAnimation(true);
  }, [capture]);

  const handleMicCapture = useCallback(async () => {
    await capture.startMicCapture();
    setShowLaunchAnimation(true);
  }, [capture]);

  const handleLocalFiles = useCallback(
    (files: File[]) => {
      local.startWithFiles(files);
      setShowLaunchAnimation(true);
    },
    [local],
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
    setShowNowPlaying(false);
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

    // Build pool: not blocked, in an enabled pack
    let pool: string[];
    if (enabledPacks.length > 0) {
      pool = allPresets.filter((p) => !mergedBlockedSet.has(p) && isInEnabledPack(p));
    } else if (presetPackMap.size > 0) {
      pool = []; // Packs initialized but none enabled
    } else {
      pool = allPresets.filter((p) => !mergedBlockedSet.has(p));
    }

    if (pool.length === 0) return;

    const historyStore = usePresetHistoryStore.getState();

    // Shuffle: exclude already-played presets this round
    let available = pool.filter((p) => !historyStore.playedSet.has(p));
    if (available.length === 0) {
      historyStore.resetRound();
      available = pool;
    }

    // Weighted selection: favorites more likely to be picked early
    const favSet = new Set(favoritePresets);
    const weight = autopilot.favoriteWeight;
    const availableFavorites = available.filter((p) => favSet.has(p));
    let pick: string;

    if (availableFavorites.length > 0 && Math.random() < weight / (weight + 1)) {
      pick = availableFavorites[Math.floor(Math.random() * availableFavorites.length)];
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

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const handleToggleNowPlaying = useCallback(() => {
    setShowNowPlaying((prev) => !prev);
  }, []);

  const handleToggleAutopilot = useCallback(() => {
    setAutopilotEnabled(!autopilot.enabled);
  }, [autopilot.enabled, setAutopilotEnabled]);

  const handleTogglePanel = useCallback((panel: PanelView) => {
    setActivePanel((current) => (current === panel ? 'none' : panel));
  }, []);

  const handleClosePanel = useCallback(() => {
    setActivePanel('none');
  }, []);

  // Autopilot: delegates to pickNextPreset for 'all' mode,
  // overrides pool for 'favorites' and 'pack' modes
  const handleAutopilotAdvance = useCallback(() => {
    if (autopilot.mode === 'all') {
      pickNextPreset();
      return;
    }

    const renderer = rendererRef.current;
    if (!renderer) return;

    // Build mode-specific pool
    let pool: string[];
    if (autopilot.mode === 'favorites' && favoritePresets.length > 0) {
      pool = favoritePresets.filter((p) => !mergedBlockedSet.has(p));
    } else if (autopilot.mode === 'pack' && autopilot.packId) {
      const customPack = useCustomPackStore.getState().packs.find((p) => p.id === autopilot.packId);
      if (customPack) {
        pool = customPack.presets.filter((p) => !mergedBlockedSet.has(p));
      } else {
        return; // Pack deleted — nothing to play
      }
    } else {
      return; // No valid pool
    }

    if (pool.length === 0) return;

    const historyStore = usePresetHistoryStore.getState();
    let available = pool.filter((p) => !historyStore.playedSet.has(p));
    if (available.length === 0) {
      historyStore.resetRound();
      available = pool;
    }

    const favSet = new Set(favoritePresets);
    const weight = autopilot.favoriteWeight;
    const availableFavorites = available.filter((p) => favSet.has(p));
    let pick: string;

    if (availableFavorites.length > 0 && Math.random() < weight / (weight + 1)) {
      pick = availableFavorites[Math.floor(Math.random() * availableFavorites.length)];
    } else {
      pick = available[Math.floor(Math.random() * available.length)];
    }

    historyStore.markPlayed(pick);
    renderer.loadPreset(pick, transitionTime);
  }, [autopilot, favoritePresets, mergedBlockedSet, pickNextPreset, transitionTime]);

  const { reset: resetAutopilot } = useAutopilot(handleAutopilotAdvance);
  useEffect(() => {
    resetAutopilotRef.current = resetAutopilot;
  });
  useHideCursor(3000);
  const isFullscreen = useFullscreen();

  // Reset autopilot timer and shuffle round when mode changes
  useEffect(() => {
    resetAutopilot();
    usePresetHistoryStore.getState().resetRound();
  }, [autopilot.mode, autopilot.packId, enabledPacks, resetAutopilot]);

  // If initial preset isn't in an enabled pack, pick one that is
  const didFixInitialPreset = useRef(false);
  useEffect(() => {
    if (
      !didFixInitialPreset.current &&
      currentPreset &&
      enabledPacks.length > 0 &&
      presetPackMap.size > 0 &&
      !isInEnabledPack(currentPreset)
    ) {
      didFixInitialPreset.current = true;
      pickNextPreset();
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
        if (err instanceof RateLimitedError) {
          setRateLimited(err.retryAfterSeconds * 1000);
          setTimeout(() => clearRateLimited(), err.retryAfterSeconds * 1000);
        }
      }
    },
    [updateIsPlaying, requestPoll, setRateLimited, clearRateLimited],
  );

  const playbackAdapter: PlaybackAdapter = useMemo(() => {
    if (local.isActive) {
      const handleLocalPlay = () => {
        // If playback ended (not playing, at end), restart from the first track
        const { tracks, currentTrackIndex, isPlaying } = useMediaPlayerStore.getState();
        if (!isPlaying && tracks.length > 0 && currentTrackIndex === tracks.length - 1) {
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
    if (isSpotifyConnected && !isMobileDevice) {
      return {
        source: 'spotify',
        isPlaying: spotifyNowPlaying?.isPlaying ?? false,
        canControl: !premiumError && !isRateLimited,
        onPlay: () => handleSpotifyAction('play'),
        onPause: () => handleSpotifyAction('pause'),
        onNext: () => handleSpotifyAction('next'),
        onPrevious: () => handleSpotifyAction('previous'),
        tooltip: premiumError
          ? 'Spotify Premium required for playback controls'
          : isRateLimited
            ? 'Spotify rate limited'
            : undefined,
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
    spotifyNowPlaying?.isPlaying,
    premiumError,
    isRateLimited,
    handleSpotifyAction,
  ]);

  const nowPlayingTrack: NowPlayingTrackInfo | null = useMemo(() => {
    if (local.isActive && localCurrentTrack) {
      return {
        title: localCurrentTrack.name,
        artist: '',
        albumName: '',
        albumArtUrl: null,
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

  const handleToggleQueue = useCallback(() => {
    if (local.isActive) handleTogglePanel('playlist');
  }, [local.isActive, handleTogglePanel]);

  const { showShortcutOverlay, toggleShortcutOverlay } = useKeyboardShortcuts({
    onNextPreset: handleNextPreset,
    onPreviousPreset: handlePreviousPreset,
    onToggleFullscreen: handleToggleFullscreen,
    onClosePanel: handleClosePanel,
    onToggleAutopilot: handleToggleAutopilot,
    onToggleFavorite: handleToggleFavorite,
    onToggleBlock: handleToggleBlock,
    onToggleQueue: handleToggleQueue,
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
          />
          {showLaunchAnimation && (
            <LaunchAnimation onComplete={() => setShowLaunchAnimation(false)} />
          )}
          {!showLaunchAnimation && (
            <>
              {presetNameDisplay !== 'off' && (
                <PresetNotification message={currentPreset} mode={presetNameDisplay} />
              )}
              <RateLimitToast />
              <NowPlaying
                visible={showNowPlaying}
                songInfoDisplay={songInfoDisplay}
                track={nowPlayingTrack}
              />
              <ControlBar
                onNextPreset={handleNextPreset}
                onPreviousPreset={handlePreviousPreset}
                canGoBack={canGoBack}
                onSelectPreset={handleSelectPreset}
                onStop={handleStop}
                onToggleFullscreen={handleToggleFullscreen}
                isFullscreen={isFullscreen}
                onToggleNowPlaying={handleToggleNowPlaying}
                showNowPlaying={showNowPlaying}
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
                onSeek={local.isActive ? local.seek : undefined}
                onVolumeChange={local.isActive ? local.setVolume : undefined}
                volume={local.isActive ? local.volume : undefined}
                isMuted={local.isActive ? local.isMuted : undefined}
                onToggleMute={local.isActive ? local.toggleMute : undefined}
                playbackAdapter={playbackAdapter}
              />
              <ActionToast />
              <ShortcutOverlay visible={showShortcutOverlay} onClose={toggleShortcutOverlay} />
            </>
          )}
        </>
      ) : (
        <StartScreen
          onStart={handleStart}
          onLocalFiles={handleLocalFiles}
          onMicCapture={handleMicCapture}
          error={capture.error}
        />
      )}
    </div>
  );
}

export default App;
