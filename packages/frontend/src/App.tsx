import { useCallback, useMemo, useRef, useState } from 'react';
import { useAudioCapture } from './hooks/useAudioCapture.ts';
import { useSpotifyAuth } from './hooks/useSpotifyAuth.ts';
import { useSettingsSync } from './hooks/useSettingsSync.ts';
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
import { useSettingsStore } from './store/useSettingsStore.ts';
import { isWebGL2Supported } from './engine/isWebGL2Supported.ts';
import type { VisualizerRenderer } from './engine/VisualizerRenderer.ts';

function App() {
  const webgl2 = useMemo(() => isWebGL2Supported(), []);
  useSpotifyAuth();
  useSettingsSync();

  const { audioEngine, isCapturing, error, startCapture, stopCapture } = useAudioCapture();
  const rendererRef = useRef<VisualizerRenderer | null>(null);
  const blockedPresets = useSettingsStore((s) => s.blockedPresets);
  const favoritePresets = useSettingsStore((s) => s.favoritePresets);
  const transitionTime = useSettingsStore((s) => s.transitionTime);
  const autopilot = useSettingsStore((s) => s.autopilot);
  const setAutopilotEnabled = useSettingsStore((s) => s.setAutopilotEnabled);
  const [currentPreset, setCurrentPreset] = useState('');
  const [presetList, setPresetList] = useState<string[]>([]);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelView>('none');

  const handlePresetChange = useCallback((name: string) => {
    setCurrentPreset(name);
  }, []);

  const handlePresetsLoaded = useCallback((presets: string[]) => {
    setPresetList(presets);
  }, []);

  const handleNextPreset = useCallback(() => {
    rendererRef.current?.nextPreset(new Set(blockedPresets), transitionTime);
  }, [blockedPresets, transitionTime]);

  const handleSelectPreset = useCallback(
    (name: string) => {
      rendererRef.current?.loadPreset(name, transitionTime);
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

  useAutopilot(handleAutopilotAdvance);
  useHideCursor(3000);

  const { showShortcutOverlay, toggleShortcutOverlay } = useKeyboardShortcuts({
    onNextPreset: handleNextPreset,
    onToggleFullscreen: handleToggleFullscreen,
    onClosePanel: handleClosePanel,
    onToggleAutopilot: handleToggleAutopilot,
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
          />
          <PresetNotification message={currentPreset} />
          <NowPlaying visible={showNowPlaying} />
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
            onToggleShortcuts={toggleShortcutOverlay}
          />
          <ShortcutOverlay visible={showShortcutOverlay} onClose={toggleShortcutOverlay} />
        </>
      ) : (
        <StartScreen onStart={startCapture} error={error} />
      )}
    </div>
  );
}

export default App;
