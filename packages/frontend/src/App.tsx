import { useCallback, useMemo, useRef, useState } from 'react';
import { useAudioCapture } from './hooks/useAudioCapture.ts';
import { useSpotifyAuth } from './hooks/useSpotifyAuth.ts';
import { useSettingsSync } from './hooks/useSettingsSync.ts';
import { Visualizer } from './components/Visualizer.tsx';
import { ControlBar } from './components/ControlBar.tsx';
import { PresetNotification } from './components/PresetNotification.tsx';
import { NowPlaying } from './components/NowPlaying.tsx';
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
  const transitionTime = useSettingsStore((s) => s.transitionTime);
  const [currentPreset, setCurrentPreset] = useState('');
  const [presetList, setPresetList] = useState<string[]>([]);
  const [showNowPlaying, setShowNowPlaying] = useState(false);

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
          />
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center font-sans text-white">
          <h1 className="text-4xl font-bold">MangoWave</h1>
          <p className="mb-6 opacity-60">Click below to share a tab and start visualizing audio</p>
          <button
            onClick={startCapture}
            className="cursor-pointer rounded-lg border-none bg-orange-500 px-8 py-3 text-lg font-bold text-white hover:bg-orange-400"
          >
            Start Visualizer
          </button>
          {error && <p className="mt-4 text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default App;
