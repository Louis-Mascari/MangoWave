import butterchurn, { butterchurnExtraImages } from 'butterchurn';
// milkdrop-textures loaded lazily in init() — its 4.6MB textureData.json
// must not be parsed at module scope (blocks launch animation).
import { setDiagnosticPresetName } from './shaderDiagnostics.ts';
import {
  presetsMinimal,
  presetsNonMinimal,
  presetsExtra,
  presetsExtra2,
  presetsMD1,
} from 'butterchurn-presets';

const PACK_SOURCES = [
  { label: 'Minimal', getPresets: () => presetsMinimal.getPresets() },
  { label: 'Non-Minimal', getPresets: () => presetsNonMinimal.getPresets() },
  { label: 'Extra', getPresets: () => presetsExtra.getPresets() },
  { label: 'Extra 2', getPresets: () => presetsExtra2.getPresets() },
  { label: 'MD1', getPresets: () => presetsMD1.getPresets() },
] as const;

/** Authoritative pack display order — derived from PACK_SOURCES load sequence + MilkDrop. */
export const PACK_ORDER = [...PACK_SOURCES.map((p) => p.label), 'MilkDrop'];

export class VisualizerRenderer {
  private static readonly EEL_PACKS = new Set(['Imported', 'MilkDrop']);

  private visualizer: ReturnType<typeof butterchurn.createVisualizer> | null = null;
  private animationFrameId: number | null = null;
  private presets: Record<string, object> = {};
  private presetKeys: string[] = [];
  private presetKeySet: Set<string> = new Set();
  private currentPresetIndex = 0;
  private fpsInterval = 0; // 0 = uncapped
  private lastFrameTime = 0;
  private lastRenderTime = 0;
  private onPresetChange?: (name: string) => void;
  private onPresetsRegistered?: () => void;
  private _presetPackMap: Map<string, string> = new Map();

  get currentPresetName(): string {
    return this.presetKeys[this.currentPresetIndex] ?? '';
  }

  get presetList(): string[] {
    return [...this.presetKeys];
  }

  get presetPackMap(): Map<string, string> {
    return new Map(this._presetPackMap);
  }

  init(
    canvas: HTMLCanvasElement,
    audioContext: AudioContext,
    analyserNode: AnalyserNode,
    onPresetChange?: (name: string) => void,
    opts?: {
      meshWidth?: number;
      meshHeight?: number;
      textureRatio?: number;
      fxaa?: boolean;
      excludedPresets?: Set<string>;
      onPresetsRegistered?: () => void;
    },
  ): void {
    this.onPresetChange = onPresetChange;
    this.onPresetsRegistered = opts?.onPresetsRegistered;

    this.visualizer = butterchurn.createVisualizer(audioContext, canvas, {
      width: canvas.width,
      height: canvas.height,
      pixelRatio: window.devicePixelRatio || 1,
      meshWidth: opts?.meshWidth,
      meshHeight: opts?.meshHeight,
      textureRatio: opts?.textureRatio,
      outputFXAA: opts?.fxaa,
    });

    this.visualizer.connectAudio(analyserNode);

    this._presetPackMap = new Map();
    this.presets = {};

    for (const { label, getPresets } of PACK_SOURCES) {
      const packPresets = getPresets();
      for (const [name, preset] of Object.entries(packPresets)) {
        this.presets[name] = preset;
        this._presetPackMap.set(name, label);
      }
    }

    this.presetKeys = Object.keys(this.presets);
    this.presetKeySet = new Set(this.presetKeys);

    // Load built-in extra textures (cells, fire, etc.) so presets referencing sampler_<name> render correctly
    this.loadExtraImages(butterchurnExtraImages.getImages());

    // Load 66 standard MilkDrop textures from the projectM texture pack.
    // Loaded async to avoid blocking the launch animation with 4.6MB JSON parse.
    // butterchurn skips names already loaded (5 overlap with butterchurnExtraImages).
    import('milkdrop-textures').then(({ getImages }) => {
      const milkdropTextures = getImages();
      this.loadExtraImages(milkdropTextures);

      // Register wrap/clamp variants (fw_/fc_/pw_/pc_) so sampler_fw_X etc. resolve
      // to the correct image instead of the clouds2 fallback.
      const variants: Record<string, { data: string; width: number; height: number }> = {};
      for (const [name, data] of Object.entries(milkdropTextures)) {
        for (const prefix of ['fw_', 'fc_', 'pw_', 'pc_']) {
          const variantKey = prefix + name;
          if (!(variantKey in milkdropTextures)) variants[variantKey] = data;
        }
      }
      if (Object.keys(variants).length > 0) this.loadExtraImages(variants);
    });

    // Register MilkDrop-Original preset names (lazy-loaded, EEL→WASM compiled on demand).
    // Loaded async so the 4.8MB JSON doesn't block init.
    import('milkdrop-presets').then(({ getPresetNames }) => {
      this.registerMilkdropPresetNames(getPresetNames());
      this.onPresetsRegistered?.();
    });

    // Load a random initial preset, filtering out excluded presets.
    // Only pick from presets with loaded objects (excludes EEL packs that need WASM compilation).
    if (this.presetKeys.length > 0) {
      const excluded = opts?.excludedPresets;
      const candidates = this.presetKeys.filter(
        (k) => this.presets[k] && (!excluded?.size || !excluded.has(k)),
      );
      const pool = candidates.length > 0 ? candidates : this.presetKeys;
      const presetName = pool[Math.floor(Math.random() * pool.length)];
      this.currentPresetIndex = this.presetKeys.indexOf(presetName);
      setDiagnosticPresetName(presetName);
      this.visualizer.loadPreset(this.presets[presetName], 0);
      this.onPresetChange?.(presetName);
    }
  }

  setSize(
    width: number,
    height: number,
    opts?: { meshWidth?: number; meshHeight?: number; textureRatio?: number },
  ): void {
    if (this.visualizer) {
      this.visualizer.setRendererSize(width, height, opts);
    }
  }

  setOutputAA(useAA: boolean): void {
    if (this.visualizer) {
      this.visualizer.setOutputAA(useAA);
    }
  }

  loadExtraImages(
    imageData: Record<string, { data: string; width: number; height: number }>,
  ): void {
    if (this.visualizer) {
      this.visualizer.loadExtraImages(imageData);
    }
  }

  setFpsCap(fps: number): void {
    this.fpsInterval = fps > 0 ? 1000 / fps : 0;
  }

  /** Register imported preset names into the preset list and pack map (without preset objects). */
  registerImportedPresetNames(names: string[]): void {
    for (const name of names) {
      if (!this._presetPackMap.has(name)) {
        this._presetPackMap.set(name, 'Imported');
        if (!this.presetKeySet.has(name)) {
          this.presetKeys.push(name);
          this.presetKeySet.add(name);
        }
      }
    }
  }

  /** Register MilkDrop-Original preset names (lazy-loaded, EEL→WASM compiled on demand). */
  private registerMilkdropPresetNames(names: string[]): void {
    for (const name of names) {
      if (!this._presetPackMap.has(name)) {
        this._presetPackMap.set(name, 'MilkDrop');
        if (!this.presetKeySet.has(name)) {
          this.presetKeys.push(name);
          this.presetKeySet.add(name);
        }
      }
    }
  }

  /** Register a single converted EEL preset object (called before loadPreset). */
  registerEelPreset(name: string, preset: object): void {
    this.presets[name] = preset;
    if (!this._presetPackMap.has(name)) {
      this._presetPackMap.set(name, 'Imported');
    }
    if (!this.presetKeySet.has(name)) {
      this.presetKeys.push(name);
      this.presetKeySet.add(name);
    }
  }

  /** Unregister an imported preset (on delete). */
  unregisterImportedPreset(name: string): void {
    delete this.presets[name];
    this._presetPackMap.delete(name);
    this.presetKeys = this.presetKeys.filter((k) => k !== name);
    this.presetKeySet.delete(name);
  }

  /** Check if a preset is in an EEL pack (Imported or MilkDrop) but not yet WASM-compiled. */
  isEelPresetUnloaded(name: string): boolean {
    return (
      VisualizerRenderer.EEL_PACKS.has(this._presetPackMap.get(name) ?? '') && !this.presets[name]
    );
  }

  loadPreset(name: string, blendTime = 2.0): void {
    if (!this.visualizer) return;
    if (this.presets[name]) {
      const previousName = this.currentPresetName;
      setDiagnosticPresetName(name);
      this.visualizer.loadPreset(this.presets[name], blendTime);
      this.currentPresetIndex = this.presetKeys.indexOf(name);
      this.onPresetChange?.(name);
      // Evict old WASM-compiled EEL presets to prevent memory exhaustion.
      // Each EEL preset holds a WebAssembly.Instance + Globals that can't
      // be GC'd while referenced. Keep current + previous (for blend transition).
      this.evictStaleEelPresets(name, previousName);
    }
  }

  /**
   * Remove compiled preset objects for EEL presets (Imported + MilkDrop) that
   * aren't actively in use. They remain registered (in _presetPackMap) so
   * isEelPresetUnloaded() returns true and they'll be lazily recompiled on next visit.
   */
  private evictStaleEelPresets(current: string, previous: string): void {
    for (const key of this.presetKeys) {
      if (key === current || key === previous) continue;
      if (
        VisualizerRenderer.EEL_PACKS.has(this._presetPackMap.get(key) ?? '') &&
        this.presets[key]
      ) {
        delete this.presets[key];
      }
    }
  }

  nextPreset(blockedPresets: Set<string> = new Set(), blendTime = 2.0): void {
    const available = this.presetKeys.filter((k) => !blockedPresets.has(k));
    if (available.length === 0) return;
    const randomIndex = Math.floor(Math.random() * available.length);
    this.loadPreset(available[randomIndex], blendTime);
  }

  start(): void {
    if (this.animationFrameId !== null) return;
    const now = performance.now();
    this.lastFrameTime = now;
    this.lastRenderTime = now;
    this.render();
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private render = (): void => {
    this.animationFrameId = requestAnimationFrame(this.render);

    const now = performance.now();
    if (this.fpsInterval > 0) {
      const elapsed = now - this.lastFrameTime;
      if (elapsed < this.fpsInterval) return;
      this.lastFrameTime = now - (elapsed % this.fpsInterval);
    }

    if (this.visualizer) {
      const dt = (now - this.lastRenderTime) / 1000;
      this.lastRenderTime = now;
      this.visualizer.render({ elapsedTime: dt });
    }
  };

  destroy(): void {
    this.stop();
    this.visualizer = null;
    this.presets = {};
    this.presetKeys = [];
    this.presetKeySet = new Set();
    this._presetPackMap = new Map();
    this.onPresetChange = undefined;
    this.onPresetsRegistered = undefined;
  }
}
