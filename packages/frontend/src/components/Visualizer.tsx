import { useCallback, useEffect, useRef } from 'react';
import { VisualizerRenderer } from '../engine/VisualizerRenderer.ts';
import type { AudioEngine } from '../engine/AudioEngine.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { QUALITY_TIERS } from '../engine/QualityMonitor.ts';
import type { QualityTier } from '../engine/QualityMonitor.ts';
import { useImportedTexturesStore } from '../store/useImportedTexturesStore.ts';
import quarantinedData from '../data/quarantined-presets.json';
import mobileBlockedData from '../data/mobile-blocked-presets.json';
import { quarantinedSet } from '../data/excludedPresets.ts';
import { BUTTERCHURN_MILKDROP_NAMES } from '../data/presetThematicPacks.ts';
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
    const ctx = audioEngine.context;
    const analyser = audioEngine.analyserNode;

    if (!canvas || !ctx || !analyser) return;

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

    // Defer heavy init (WebGL context, shader compilation, preset map building)
    // so the launch animation's first frames paint smoothly.
    const initId = requestAnimationFrame(() => {
      // Build excluded set for initial preset pick: blocked + effective quarantine + mobile-blocked
      const { blockedPresets, excludedOverrides } = useSettingsStore.getState();
      const overrideSet = new Set(excludedOverrides);
      const excludedPresets = new Set<string>(blockedPresets);
      for (const name of quarantinedData.presets as string[]) {
        if (!overrideSet.has(name)) excludedPresets.add(name);
      }

      // On mobile, add blocked presets to the excluded set (unless user overrode)
      if (isMobileDevice) {
        for (const name of mobileBlockedData.presets as string[]) {
          if (!overrideSet.has(name)) excludedPresets.add(name);
        }
      }

      renderer.init(canvas, ctx, analyser, onPresetChange, {
        meshWidth: performance.meshWidth,
        meshHeight: performance.meshHeight,
        textureRatio: performance.textureRatio,
        fxaa: performance.fxaa,
        excludedPresets,
        // Propagate updated preset list when MilkDrop pack names finish registering
        onPresetsRegistered: () => {
          onPresetsLoaded(renderer.presetList, renderer.presetPackMap);

          // Seed "MilkDrop Classic" custom pack (one-time, after MilkDrop names register).
          // Use a localStorage flag so the pack is never re-created if the user deletes it.
          if (!localStorage.getItem('mw-milkdrop-classic-seeded')) {
            const settings = useSettingsStore.getState();
            // Include both the 437 bundled MilkDrop presets and the ~108 butterchurn
            // presets that are also original MilkDrop presets (deduped at build time).
            // Filter out quarantined and user-blocked presets.
            const { blockedPresets: blocked } = settings;
            const blockedSet = new Set(blocked);
            const names = [...renderer.milkdropPresetNames, ...BUTTERCHURN_MILKDROP_NAMES].filter(
              (n) => !quarantinedSet.has(n) && !blockedSet.has(n),
            );
            if (names.length > 0) {
              settings.createCustomPack('MilkDrop Classic', names);
              localStorage.setItem('mw-milkdrop-classic-seeded', '1');
            }
          }
        },
      });

      // Register imported preset names from persisted metadata (synchronously available).
      // The actual .milk text in IDB loads asynchronously, but names are sufficient for
      // pool building. Lazy conversion in usePresetNavigation handles the rest.
      const { importedPresets: importedMeta } = useSettingsStore.getState();
      if (importedMeta.length > 0) {
        renderer.registerImportedPresetNames(importedMeta.map((p) => p.name));
      }

      // Load user-imported textures (built-in textures already loaded during init)
      const textureStore = useImportedTexturesStore.getState();
      if (textureStore.loaded && textureStore.textures.size > 0) {
        renderer.loadExtraImages(textureStore.getAllTextures());
      }

      renderer.start();
      onPresetsLoaded(renderer.presetList, renderer.presetPackMap);
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

  // Re-register imported preset names when they change (add/remove) and propagate
  // updated preset list to App so PresetBrowser sees them immediately.
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

    // Register any new names
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
      renderer.loadExtraImages(store.getAllTextures());
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
    renderer.setSize(width, height, {
      meshWidth: performance.meshWidth,
      meshHeight: performance.meshHeight,
      textureRatio: performance.textureRatio,
    });
  }, [
    performance.resolutionScale,
    performance.meshWidth,
    performance.meshHeight,
    performance.textureRatio,
    rendererRef,
  ]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setOutputAA(performance.fxaa);
  }, [performance.fxaa, rendererRef]);

  // Auto quality: connect quality monitor to store
  const autoQualityChangeRef = useRef(false);
  const handleQualityChange = useCallback((_tier: number, settings: QualityTier) => {
    // Flag so manual-change detection in useEffect skips this update
    autoQualityChangeRef.current = true;
    const store = useSettingsStore.getState();
    store.setMeshSize(settings.meshWidth, settings.meshHeight);
    store.setTextureRatio(settings.textureRatio);
    store.setResolutionScale(settings.resolutionScale);
    // Reset flag after microtask (store updates are synchronous)
    queueMicrotask(() => {
      autoQualityChangeRef.current = false;
    });
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    renderer.setAutoQuality(performance.autoQuality);
    renderer.setOnQualityChange(performance.autoQuality ? handleQualityChange : null);

    if (performance.autoQuality) {
      // Determine max tier from current settings (highest tier whose settings fit)
      let maxTier = QUALITY_TIERS.length - 1;
      for (let i = QUALITY_TIERS.length - 1; i >= 0; i--) {
        const t = QUALITY_TIERS[i];
        if (
          performance.meshWidth >= t.meshWidth &&
          performance.meshHeight >= t.meshHeight &&
          performance.textureRatio >= t.textureRatio &&
          performance.resolutionScale >= t.resolutionScale
        ) {
          maxTier = i;
          break;
        }
      }
      renderer.setAutoQualityMaxTier(maxTier);
    }

    return () => {
      renderer.setOnQualityChange(null);
    };
    // Only re-run when autoQuality is toggled, not on every settings change —
    // the max tier snapshot is taken once when auto quality is enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performance.autoQuality, rendererRef, handleQualityChange]);

  // When user manually changes performance settings while auto quality is on,
  // disable auto quality (manual override)
  const prevPerfRef = useRef(performance);
  useEffect(() => {
    const prev = prevPerfRef.current;
    prevPerfRef.current = performance;

    // Skip if this change came from auto quality itself
    if (autoQualityChangeRef.current) return;

    // Skip if auto quality is off or was just toggled
    if (!performance.autoQuality || prev.autoQuality !== performance.autoQuality) return;

    // Check if any quality-related setting changed manually
    if (
      prev.meshWidth !== performance.meshWidth ||
      prev.meshHeight !== performance.meshHeight ||
      prev.textureRatio !== performance.textureRatio ||
      prev.resolutionScale !== performance.resolutionScale
    ) {
      useSettingsStore.getState().setAutoQuality(false);
    }
  }, [performance]);

  // Sync audio settings to engine
  useEffect(() => {
    audioEngine.setSmoothingConstant(audio.smoothingConstant);
  }, [audioEngine, audio.smoothingConstant]);

  useEffect(() => {
    audioEngine.setFftSize(audio.fftSize);
  }, [audioEngine, audio.fftSize]);

  // Auto-pause rendering when the tab is hidden to save GPU.
  // If the user manually paused (renderPaused), don't auto-resume on tab focus.
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
      ref={canvasRef}
      onDoubleClick={onToggleFullscreen}
      className="fixed top-0 left-0 block h-screen w-screen"
    />
  );
}
