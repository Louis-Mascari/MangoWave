import { useEffect, useRef } from 'react';
import { VisualizerRenderer } from '../engine/VisualizerRenderer.ts';
import type { AudioEngine } from '../engine/AudioEngine.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useImportedTexturesStore } from '../store/useImportedTexturesStore.ts';
import quarantinedData from '../data/quarantined-presets.json';
import mobileBlockedData from '../data/mobile-blocked-presets.json';
import { quarantinedSet } from '../data/excludedPresets.ts';
import { isMobileDevice } from '../utils/isMobileDevice.ts';

interface VisualizerProps {
  audioEngine: AudioEngine;
  rendererRef: React.RefObject<VisualizerRenderer | null>;
  onPresetChange: (name: string) => void;
  onPresetsLoaded: (presets: string[], packMap: Map<string, string>) => void;
  onToggleFullscreen: () => void;
  onContextLost: () => void;
  renderPaused?: boolean;
}

export function Visualizer({
  audioEngine,
  rendererRef,
  onPresetChange,
  onPresetsLoaded,
  onToggleFullscreen,
  onContextLost,
  renderPaused,
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const performance = useSettingsStore((s) => s.performance);
  const eq = useSettingsStore((s) => s.eq);
  const audio = useSettingsStore((s) => s.audio);

  // Initialize renderer — deferred by one frame so the launch animation
  // can start rendering before heavy WebGL init blocks the main thread.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new VisualizerRenderer();
    rendererRef.current = renderer;

    const updateSize = () => {
      const width = Math.floor(window.innerWidth * performance.resolutionScale);
      const height = Math.floor(window.innerHeight * performance.resolutionScale);
      canvas.width = width;
      canvas.height = height;
      renderer.setSize(width, height);
    };

    updateSize();

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      renderer.stop();
      onContextLost();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    window.addEventListener('resize', updateSize);

    // Defer heavy init (WASM loading, WebGL context, preset registration)
    // so the launch animation's first frames paint smoothly.
    const initId = requestAnimationFrame(() => {
      // Build excluded set for initial preset pick
      const { blockedPresets, excludedOverrides } = useSettingsStore.getState();
      const overrideSet = new Set(excludedOverrides);
      const excludedPresets = new Set<string>(blockedPresets);
      for (const name of quarantinedData.presets as string[]) {
        if (!overrideSet.has(name)) excludedPresets.add(name);
      }

      if (isMobileDevice) {
        for (const name of mobileBlockedData.presets as string[]) {
          if (!overrideSet.has(name)) excludedPresets.add(name);
        }
      }

      // init() is now async (WASM loading)
      renderer
        .init(audioEngine, onPresetChange, {
          meshWidth: performance.meshWidth,
          meshHeight: performance.meshHeight,
          fpsCap: performance.fpsCap,
          excludedPresets,
          onPresetsRegistered: () => {
            onPresetsLoaded(renderer.presetList, renderer.presetPackMap);

            // Seed "MilkDrop Classic" custom pack (one-time)
            if (!localStorage.getItem('mw-milkdrop-classic-seeded')) {
              const settings = useSettingsStore.getState();
              const { blockedPresets: blocked } = settings;
              const blockedSet = new Set(blocked);
              const names = [...renderer.bundledPresetNames].filter(
                (n) => !quarantinedSet.has(n) && !blockedSet.has(n),
              );
              if (names.length > 0) {
                settings.createCustomPack('MilkDrop Classic', names);
                localStorage.setItem('mw-milkdrop-classic-seeded', '1');
              }
            }
          },
        })
        .then(async () => {
          // Register imported preset names from persisted metadata
          const { importedPresets: importedMeta } = useSettingsStore.getState();
          if (importedMeta.length > 0) {
            renderer.registerImportedPresetNames(importedMeta.map((p) => p.name));
          }

          // Load and decode user-imported textures (must await before starting render)
          const textureStore = useImportedTexturesStore.getState();
          if (textureStore.loaded && textureStore.textures.size > 0) {
            await renderer.loadExtraImages(textureStore.getAllTextures());
          }

          renderer.start();
          onPresetsLoaded(renderer.presetList, renderer.presetPackMap);
        })
        .catch((err) => {
          console.error('Failed to initialize visualizer:', err);
        });
    });

    return () => {
      cancelAnimationFrame(initId);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      window.removeEventListener('resize', updateSize);
      renderer.destroy();
      rendererRef.current = null;
    };
    // Only re-init on audioEngine change, not on every settings change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEngine]);

  // Re-register imported preset names when they change (add/remove)
  const importedPresets = useSettingsStore((s) => s.importedPresets);
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const names = importedPresets.map((p) => p.name);
    const nameSet = new Set(names);

    // Unregister any names the renderer has that are no longer in the store
    const packMap = renderer.presetPackMap;
    for (const key of renderer.presetList) {
      if (packMap.get(key) === 'Imported' && !nameSet.has(key)) {
        renderer.unregisterImportedPreset(key);
      }
    }

    if (names.length > 0) {
      renderer.registerImportedPresetNames(names);
    }

    onPresetsLoaded(renderer.presetList, renderer.presetPackMap);
  }, [importedPresets, rendererRef, onPresetsLoaded]);

  // Hot-load imported textures when they change after init
  const textureCount = useImportedTexturesStore((s) => s.textures.size);
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const store = useImportedTexturesStore.getState();
    if (store.textures.size > 0) {
      void renderer.loadExtraImages(store.getAllTextures());
    }
  }, [textureCount, rendererRef]);

  // Sync performance settings to renderer
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setFpsCap(performance.fpsCap);
  }, [performance.fpsCap, rendererRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const width = Math.floor(window.innerWidth * performance.resolutionScale);
    const height = Math.floor(window.innerHeight * performance.resolutionScale);
    canvas.width = width;
    canvas.height = height;
    renderer.setSize(width, height);
    renderer.setMeshSize(performance.meshWidth, performance.meshHeight);
  }, [performance.resolutionScale, performance.meshWidth, performance.meshHeight, rendererRef]);

  // Sync audio settings to engine
  useEffect(() => {
    audioEngine.setSmoothingConstant(audio.smoothingConstant);
  }, [audioEngine, audio.smoothingConstant]);

  useEffect(() => {
    audioEngine.setFftSize(audio.fftSize);
  }, [audioEngine, audio.fftSize]);

  // Auto-pause rendering when the tab is hidden to save GPU.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        renderer.stop();
      } else if (!renderPaused) {
        renderer.start();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [rendererRef, renderPaused]);

  // Sync EQ settings to audio engine
  useEffect(() => {
    audioEngine.setPreAmpGain(eq.preAmpGain);
  }, [audioEngine, eq.preAmpGain]);

  useEffect(() => {
    eq.bandGains.forEach((gain, i) => {
      audioEngine.setEQBandGain(i, gain);
    });
  }, [audioEngine, eq.bandGains]);

  return (
    <canvas
      id="mw-canvas"
      ref={canvasRef}
      onDoubleClick={onToggleFullscreen}
      className="fixed top-0 left-0 block h-screen w-screen"
    />
  );
}
