import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioCapture } from './hooks/useAudioCapture.ts';
import { useSpotifyAuth } from './hooks/useSpotifyAuth.ts';
import { useSettingsSync } from './hooks/useSettingsSync.ts';
import { useNowPlaying } from './hooks/useNowPlaying.ts';
import { useAutopilot } from './hooks/useAutopilot.ts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { useHideCursor } from './hooks/useHideCursor.ts';
import { Visualizer } from './components/Visualizer.tsx';
import { ControlBar } from './components/ControlBar.tsx';
import type { PanelView } from './components/ControlBar.tsx';
import { PresetNotification } from './components/PresetNotification.tsx';
import { NowPlaying } from './components/NowPlaying.tsx';
import { StartScreen } from './components/StartScreen.tsx';
import { ShortcutOverlay } from './components/ShortcutOverlay.tsx';
import { LaunchAnimation } from './components/LaunchAnimation.tsx';
import { useSettingsStore } from './store/useSettingsStore.ts';
import { useSpotifyStore } from './store/useSpotifyStore.ts';
import { isWebGL2Supported } from './engine/isWebGL2Supported.ts';
import type { VisualizerRenderer } from './engine/VisualizerRenderer.ts';

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

  const { audioEngine, isCapturing, error, startCapture, stopCapture } = useAudioCapture();
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
  const [currentPreset, setCurrentPreset] = useState('');
  const [presetList, setPresetList] = useState<string[]>([]);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelView>('none');
  const [showLaunchAnimation, setShowLaunchAnimation] = useState(false);
  const resetAutopilotRef = useRef<() => void>(() => {});

  const handleStart = useCallback(async () => {
    await startCapture();
    setShowLaunchAnimation(true);
  }, [startCapture]);

  const handlePresetChange = useCallback((name: string) => {
    setCurrentPreset(name);
  }, []);

  const handlePresetsLoaded = useCallback((presets: string[]) => {
    setPresetList(presets);
  }, []);

  const handleNextPreset = useCallback(() => {
    rendererRef.current?.nextPreset(new Set(blockedPresets), transitionTime);
    resetAutopilotRef.current();
  }, [blockedPresets, transitionTime]);

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

  const handleAutopilotAdvance = useCallback(() => {
    if (autopilot.favoritesOnly && favoritePresets.length > 0) {
      // Build blocked set as everything NOT in favorites
      const allPresets = rendererRef.current?.presetList ?? [];
      const favSet = new Set(favoritePresets);
      const blockedSet = new Set(allPresets.filter((p) => !favSet.has(p)));
      rendererRef.current?.nextPreset(blockedSet, transitionTime);
    } else {
      handleNextPreset();
    }
  }, [autopilot.favoritesOnly, favoritePresets, transitionTime, handleNextPreset]);

  const { reset: resetAutopilot } = useAutopilot(handleAutopilotAdvance);
  useEffect(() => {
    resetAutopilotRef.current = resetAutopilot;
  });
  useHideCursor(3000);

  // Reset autopilot timer when favoritesOnly changes
  useEffect(() => {
    resetAutopilot();
  }, [autopilot.favoritesOnly, resetAutopilot]);

  const handleToggleFavorite = useCallback(() => {
    if (currentPreset) toggleFavoritePreset(currentPreset);
  }, [currentPreset, toggleFavoritePreset]);

  const handleToggleBlock = useCallback(() => {
    if (!currentPreset) return;
    const isCurrentlyBlocked = useSettingsStore.getState().blockedPresets.includes(currentPreset);
    toggleBlockPreset(currentPreset);
    // If we just blocked the current preset, skip to next
    if (!isCurrentlyBlocked) {
      handleNextPreset();
    }
  }, [currentPreset, toggleBlockPreset, handleNextPreset]);

  const { showShortcutOverlay, toggleShortcutOverlay } = useKeyboardShortcuts({
    onNextPreset: handleNextPreset,
    onToggleFullscreen: handleToggleFullscreen,
    onClosePanel: handleClosePanel,
    onToggleAutopilot: handleToggleAutopilot,
    onToggleFavorite: handleToggleFavorite,
    onToggleBlock: handleToggleBlock,
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
      {isCapturing && audioEngine ? (
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
              <NowPlaying visible={showNowPlaying} songInfoDisplay={songInfoDisplay} />
              <ControlBar
                onNextPreset={handleNextPreset}
                onSelectPreset={handleSelectPreset}
                onStop={stopCapture}
                onToggleFullscreen={handleToggleFullscreen}
                onToggleNowPlaying={handleToggleNowPlaying}
                showNowPlaying={showNowPlaying}
                presetList={presetList}
                currentPreset={currentPreset}
                autopilotEnabled={autopilot.enabled}
                onToggleAutopilot={handleToggleAutopilot}
                activePanel={activePanel}
                onTogglePanel={handleTogglePanel}
                isFavorite={favoritePresets.includes(currentPreset)}
                isBlocked={blockedPresets.includes(currentPreset)}
                onToggleFavorite={handleToggleFavorite}
                onToggleBlock={handleToggleBlock}
              />
              <ShortcutOverlay visible={showShortcutOverlay} onClose={toggleShortcutOverlay} />
            </>
          )}
        </>
      ) : (
        <StartScreen onStart={handleStart} error={error} />
      )}
    </div>
  );
}

export default App;
