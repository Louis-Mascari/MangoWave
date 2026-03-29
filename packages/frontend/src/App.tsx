import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
// i18n singleton used directly (not useTranslation) to avoid unstable hook references
// that trigger useSyncExternalStore resubscription and restart effects in MainApp.
import i18n from './i18n/index.ts';
import { useIdleTimer } from './hooks/useIdleTimer.ts';
import { useAudioCapture } from './hooks/useAudioCapture.ts';
import { useLocalPlayback } from './hooks/useLocalPlayback.ts';
import { useMediaPlayerStore } from './store/useMediaPlayerStore.ts';
import { useSpotifyAuth } from './hooks/useSpotifyAuth.ts';
import { useSettingsSync } from './hooks/useSettingsSync.ts';
import { useNowPlaying } from './hooks/useNowPlaying.ts';
import { useAutopilot } from './hooks/useAutopilot.ts';
import { useWindowSync } from './hooks/useWindowSync.ts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { useHideCursor } from './hooks/useHideCursor.ts';
import { useFullscreen } from './hooks/useFullscreen.ts';
import { useSpotifyPlayback } from './hooks/useSpotifyPlayback.ts';
import { usePlaybackAdapter } from './hooks/usePlaybackAdapter.ts';
import { usePresetNavigation } from './hooks/usePresetNavigation.ts';
import { Visualizer } from './components/Visualizer.tsx';
import { ControlBar } from './components/ControlBar.tsx';
import type { PanelView } from './components/ControlBar.tsx';
import { PresetNotification } from './components/PresetNotification.tsx';
import { NowPlaying } from './components/NowPlaying.tsx';
import { StartScreen } from './components/StartScreen.tsx';
import { ShortcutOverlay } from './components/ShortcutOverlay.tsx';
import { LaunchAnimation } from './components/LaunchAnimation.tsx';
import { RateLimitToast } from './components/RateLimitToast.tsx';
import { ActionToast } from './components/ActionToast.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { ImportModal } from './components/ImportModal.tsx';
import { OnboardingOverlay } from './components/OnboardingOverlay.tsx';
import { useUnlockCheck } from './hooks/useUnlockCheck.ts';
import { useSettingsStore } from './store/useSettingsStore.ts';
import { useSpotifyStore } from './store/useSpotifyStore.ts';
import { usePresetHistoryStore } from './store/usePresetHistoryStore.ts';
import { useToastStore } from './store/useToastStore.ts';
import { PlaybackPanel } from './components/PlaybackPanel.tsx';
import { MediaPlaylist } from './components/MediaPlaylist.tsx';
import { isWebGL2Supported } from './engine/isWebGL2Supported.ts';
import { isMobileDevice } from './utils/isMobileDevice.ts';
import {
  exitFullscreen,
  getFullscreenElement,
  requestFullscreen,
  supportsFullscreen,
} from './utils/fullscreen.ts';
import type { VisualizerRenderer } from './engine/VisualizerRenderer.ts';

/**
 * Minimal shell for OAuth popup callbacks.
 * useSpotifyAuth runs inside and handles code exchange + window.close().
 */
function OAuthPopup() {
  useSpotifyAuth();
  const { t } = useTranslation('messages');
  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      {t('spotify.connectingToSpotify')}
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
          .show(i18n.t('spotify.connectionFailed', { ns: 'messages' }), { type: 'error' });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const accessToken = useSpotifyStore((s) => s.accessToken);
  const isSpotifyConnected = !!accessToken;
  const capture = useAudioCapture();
  const local = useLocalPlayback();

  // Whichever source is active provides the engine
  const audioEngine = capture.audioEngine ?? local.audioEngine;
  const isActive = capture.isCapturing || local.isActive;

  // Only poll Spotify when the visualizer is running — no need on the start screen
  useNowPlaying(isSpotifyConnected && isActive);
  const rendererRef = useRef<VisualizerRenderer | null>(null);
  const [currentPreset, setCurrentPreset] = useState('');
  const { isLeader, broadcastPreset, isRemotePresetRef } = useWindowSync(
    rendererRef,
    currentPreset,
  );
  const autopilot = useSettingsStore((s) => s.autopilot);
  const setAutopilotEnabled = useSettingsStore((s) => s.setAutopilotEnabled);
  const presetNameDisplay = useSettingsStore((s) => s.presetNameDisplay);
  const songInfoDisplay = useSettingsStore((s) => s.songInfoDisplay);
  const setSongInfoDisplay = useSettingsStore((s) => s.setSongInfoDisplay);
  const [presetList, setPresetList] = useState<string[]>([]);
  const [presetPackMap, setPresetPackMap] = useState<Map<string, string>>(new Map());
  const [activePanel, setActivePanel] = useState<PanelView>('none');
  const [showLaunchAnimation, setShowLaunchAnimation] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [webglContextLost, setWebglContextLost] = useState(false);
  const silenceCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setOnboardingShown = useSettingsStore((s) => s.setOnboardingShown);
  const resetAutopilotRef = useRef<() => void>(() => {});

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
    if (getFullscreenElement()) {
      exitFullscreen();
    }
    if (capture.isCapturing) {
      capture.stopCapture();
    }
    if (local.isActive) {
      local.stop();
    }
    setActivePanel('none');
  }, [capture, local]);

  const handlePresetChange = useCallback(
    (name: string) => {
      setCurrentPreset(name);
      usePresetHistoryStore.getState().push(name);
      if (isRemotePresetRef.current) {
        isRemotePresetRef.current = false;
      } else {
        broadcastPreset(name, useSettingsStore.getState().transitionTime);
      }
    },
    [broadcastPreset, isRemotePresetRef],
  );

  const handlePresetsLoaded = useCallback((presets: string[], packMap: Map<string, string>) => {
    setPresetList(presets);
    setPresetPackMap(packMap);
  }, []);

  const {
    pickNextPreset,
    handleNextPreset,
    handlePreviousPreset,
    handleSelectPreset,
    handleToggleFavorite,
    handleToggleBlock,
    canGoBack,
    blockedPresets,
    favoritePresets,
  } = usePresetNavigation({ rendererRef, currentPreset, presetPackMap, resetAutopilotRef });

  const handleWebGLContextLost = useCallback(() => {
    setWebglContextLost(true);
  }, []);

  // Silence detection — warns if no audio is flowing after any source starts.
  // Covers system capture, microphone, and local file playback.
  const audioSource: 'system' | 'mic' | 'local' | null =
    capture.captureSource ?? (local.isActive ? 'local' : null);
  useEffect(() => {
    if (silenceCheckRef.current) {
      clearInterval(silenceCheckRef.current);
      silenceCheckRef.current = null;
    }

    if (!isActive || !audioSource || !audioEngine) return;

    let toastShown = false;
    let checksRemaining = 4;

    // Start checking after launch animation (~2.5s), then every 1.5s.
    // Uses time-domain data (waveform) instead of frequency data because
    // getByteFrequencyData returns zeros for MediaStreamSource in setInterval contexts.
    silenceCheckRef.current = setInterval(() => {
      const data = audioEngine.getTimeDomainData();
      if (data.length === 0) return;
      // Time-domain silence = all samples at exactly 128. Any deviation means audio is flowing.
      const hasSignal = data.some((v) => v < 127 || v > 129);

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
        const toastKey =
          audioSource === 'mic'
            ? 'toasts.silenceDetectedMic'
            : audioSource === 'local'
              ? 'toasts.silenceDetectedLocal'
              : 'toasts.silenceDetected';
        useToastStore.getState().show(i18n.t(toastKey, { ns: 'messages' }), {
          type: 'warning',
          durationMs: 8000,
        });
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
  }, [isActive, audioSource, audioEngine]);

  const handleToggleFullscreen = useCallback(() => {
    if (getFullscreenElement()) {
      exitFullscreen();
    } else if (supportsFullscreen) {
      requestFullscreen();
    } else {
      useToastStore
        .getState()
        .show(i18n.getFixedT(null, 'messages')('errors.fullscreenNotSupported'), {
          type: 'warning',
        });
    }
  }, []);

  const handleToggleNowPlaying = useCallback(() => {
    setSongInfoDisplay(songInfoDisplay === 'off' ? 5 : 'off');
  }, [songInfoDisplay, setSongInfoDisplay]);

  const handleToggleAutopilot = useCallback(() => {
    const next = !autopilot.enabled;
    setAutopilotEnabled(next);
    useToastStore
      .getState()
      .show(
        next
          ? i18n.t('toasts.autopilotOn', { ns: 'messages' })
          : i18n.t('toasts.autopilotOff', { ns: 'messages' }),
      );
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

  const windowSyncEnabled = useSettingsStore((s) => s.windowSyncEnabled);
  const { reset: resetAutopilot } = useAutopilot(handleAutopilotAdvance, {
    suppress: windowSyncEnabled && !isLeader,
  });
  useEffect(() => {
    resetAutopilotRef.current = resetAutopilot;
  });

  useHideCursor(3000);
  const isFullscreen = useFullscreen();

  const {
    handleSpotifyAction,
    handleSpotifySeek,
    handleSpotifyToggleShuffle,
    handleSpotifyCycleRepeat,
  } = useSpotifyPlayback();

  const { playbackAdapter, nowPlayingTrack } = usePlaybackAdapter({
    local,
    captureSource: capture.captureSource,
    isSpotifyConnected,
    spotifyActions: { handleSpotifyAction, handleSpotifyToggleShuffle, handleSpotifyCycleRepeat },
  });

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
    reset: resetPlaybackIdle,
  } = useIdleTimer(5000, true, isMobileDevice);

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
        <h1 className="mb-2 text-3xl font-bold text-red-500">
          {i18n.t('errors.webgl2NotSupported', { ns: 'messages' })}
        </h1>
        <p className="max-w-md text-center opacity-60">
          {i18n.t('errors.webgl2NotSupportedDesc', { ns: 'messages' })}
        </p>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen bg-black">
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
                {i18n.t('errors.webglContextLost', { ns: 'messages' })}
              </h1>
              <p className="mb-6 max-w-md text-center text-sm opacity-70">
                {i18n.t('errors.webglContextLostDesc', { ns: 'messages' })}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="cursor-pointer rounded-lg border-none bg-orange-500 px-8 py-3 text-lg font-bold text-white hover:bg-orange-400"
              >
                {i18n.t('reloadPage', { ns: 'common' })}
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
            <LaunchAnimation
              onComplete={() => {
                setShowLaunchAnimation(false);
                resumePlaybackIdle();
              }}
            />
          )}
          <div className="pointer-events-none fixed top-4 left-4 z-[49] flex flex-col items-start gap-2">
            {presetNameDisplay !== 'off' && (
              <PresetNotification message={currentPreset} mode={presetNameDisplay} />
            )}
            <NowPlaying enabled={songInfoDisplay !== 'off'} track={nowPlayingTrack} />
          </div>
          <RateLimitToast />
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
            isIdle={playbackPanelIdle}
            forceIdle={forcePlaybackIdle}
            resetIdle={resetPlaybackIdle}
            onPauseIdle={pausePlaybackIdle}
            onResumeIdle={resumePlaybackIdle}
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
          />
          {/* Mobile queue modal — desktop queue renders inside ControlBar */}
          {isMobileDevice && activePanel === 'playlist' && (
            <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/50 backdrop-blur-sm">
              <div className="relative mx-2 my-2 flex max-h-full w-full flex-col overflow-hidden rounded-lg bg-gray-900/95">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <h3 className="text-sm font-semibold text-white">
                    {i18n.t('queue', { ns: 'common' })}
                  </h3>
                  <button
                    onClick={() => setActivePanel('none')}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-white/10 text-sm text-white/70 hover:bg-white/20"
                    aria-label={i18n.t('close', { ns: 'common' })}
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
          <ConfirmDialog />
          <ImportModal />
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
    </main>
  );
}

export default App;
