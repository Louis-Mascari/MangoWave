import butterchurn, { butterchurnExtraImages } from 'butterchurn';
import { setDiagnosticPresetName } from './shaderDiagnostics.ts';
import {
  presetsMinimal,
  presetsNonMinimal,
  presetsExtra,
  presetsExtra2,
  presetsMD1,
} from 'butterchurn-presets';
import { THEMATIC_PACKS, presetThematicMap } from '../data/presetThematicPacks.ts';
import { initOptimizer } from 'glsl-optimizer-wasm';

// Pre-warm: start loading the GLSL optimizer WASM module so it's ready for shader compilation.
// Non-blocking — if it hasn't loaded by the time a shader compiles, the unoptimized shader is used.
initOptimizer().catch(() => {
  /* optimizer is optional — silent failure */
});

// Pre-decode milkdrop textures to ImageBitmap at module load time (while the start screen is
// visible). This moves the heavy JPEG decoding off the main thread via createImageBitmap, so
// the WebGL uploads at init time are fast GPU copies instead of synchronous Image decode +
// format conversion that blocks the main thread for seconds on mobile.
// Includes wrap/clamp variants (fw_/fc_/pw_/pc_) — same bitmap, different sampler settings.
const preDecodedTexturesPromise: Promise<Map<string, ImageBitmap>> = import('milkdrop-textures')
  .then(async ({ getImages }) => {
    const textures = getImages();
    const decoded = new Map<string, ImageBitmap>();
    const entries = Object.entries(textures);
    const BATCH = 10;

    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async ([name, { data }]) => {
          // Use fetch to decode data URI — native browser implementation is faster
          // than manual atob + byte-by-byte copy, and doesn't block the main thread.
          const response = await fetch(data);
          const blob = await response.blob();
          const bitmap = await createImageBitmap(blob);
          return [name, bitmap] as const;
        }),
      );
      for (const [name, bitmap] of results) {
        decoded.set(name, bitmap);
        const lower = name.toLowerCase();
        if (lower !== name) decoded.set(lower, bitmap);
        // Register wrap/clamp variants — same image, sampler controls wrap behavior
        for (const prefix of ['fw_', 'fc_', 'pw_', 'pc_']) {
          decoded.set(prefix + name, bitmap);
          if (lower !== name) decoded.set(prefix + lower, bitmap);
        }
      }
    }

    return decoded;
  })
  .catch(() => new Map<string, ImageBitmap>());

const PACK_SOURCES = [
  presetsMinimal,
  presetsNonMinimal,
  presetsExtra,
  presetsExtra2,
  presetsMD1,
] as const;

/** Authoritative pack display order — thematic packs derived from preset classification. */
export const PACK_ORDER: string[] = [...THEMATIC_PACKS];

export class VisualizerRenderer {
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
  private _milkdropPresetNames: Set<string> = new Set();
  private _importedPresetNames: Set<string> = new Set();

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
    this._milkdropPresetNames = new Set();
    this._importedPresetNames = new Set();
    this.presets = {};

    for (const source of PACK_SOURCES) {
      const packPresets = source.getPresets();
      for (const [name, preset] of Object.entries(packPresets)) {
        this.presets[name] = preset;
        this._presetPackMap.set(name, presetThematicMap[name] ?? 'Ambient');
      }
    }

    this.presetKeys = Object.keys(this.presets);
    this.presetKeySet = new Set(this.presetKeys);

    // Load built-in extra textures (cells, fire, etc.) so presets referencing sampler_<name> render correctly
    this.loadExtraImages(butterchurnExtraImages.getImages());

    // Load 66 standard MilkDrop textures (+ wrap/clamp variants) from pre-decoded ImageBitmaps.
    // The heavy JPEG decoding happened at module load time (on the start screen) via
    // createImageBitmap, so these are fast GPU copies. Batched with setTimeout(0) yields
    // as a safety net to keep the UI responsive on slow devices.
    preDecodedTexturesPromise.then((decoded) => {
      if (!this.visualizer || decoded.size === 0) return;
      const entries = [...decoded.entries()];
      const BATCH_SIZE = 20; // ImageBitmap uploads are fast — larger batches OK
      const uploadBatch = (startIdx: number) => {
        if (!this.visualizer) return;
        const batch: Record<string, ImageBitmap> = {};
        for (let i = startIdx; i < Math.min(startIdx + BATCH_SIZE, entries.length); i++) {
          batch[entries[i][0]] = entries[i][1];
        }
        this.loadExtraImages(batch);
        const next = startIdx + BATCH_SIZE;
        if (next < entries.length) {
          setTimeout(() => uploadBatch(next), 0);
        }
      };
      uploadBatch(0);
    });

    // Register MilkDrop-Original preset names from a lightweight manifest (18KB).
    // The heavy 5MB preset data stays in a separate chunk, loaded lazily on first access.
    import('milkdrop-presets/names').then(({ getPresetNames }) => {
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
    imageData:
      | Record<string, { data: string; width: number; height: number }>
      | Record<string, ImageBitmap>,
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
      this._importedPresetNames.add(name);
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
      this._milkdropPresetNames.add(name);
      if (!this._presetPackMap.has(name)) {
        this._presetPackMap.set(name, presetThematicMap[name] ?? 'Ambient');
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
    this._importedPresetNames.delete(name);
    this.presetKeys = this.presetKeys.filter((k) => k !== name);
    this.presetKeySet.delete(name);
  }

  /** Check if a preset is an EEL preset (Imported or MilkDrop) but not yet WASM-compiled. */
  isEelPresetUnloaded(name: string): boolean {
    return (
      (this._importedPresetNames.has(name) || this._milkdropPresetNames.has(name)) &&
      !this.presets[name]
    );
  }

  /** Whether the preset was user-imported (.milk file). */
  isImportedPreset(name: string): boolean {
    return this._importedPresetNames.has(name);
  }

  /** Whether the preset is from the bundled MilkDrop-Original pack. */
  isMilkdropPreset(name: string): boolean {
    return this._milkdropPresetNames.has(name);
  }

  /** Names of all bundled MilkDrop-Original presets. */
  get milkdropPresetNames(): ReadonlySet<string> {
    return this._milkdropPresetNames;
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
        (this._importedPresetNames.has(key) || this._milkdropPresetNames.has(key)) &&
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
    // Reset lastRenderTime so the first frame after resume doesn't get a
    // huge delta (which would cause butterchurn to skip-forward visuals).
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
    this._milkdropPresetNames = new Set();
    this._importedPresetNames = new Set();
    this.onPresetChange = undefined;
    this.onPresetsRegistered = undefined;
  }
}
