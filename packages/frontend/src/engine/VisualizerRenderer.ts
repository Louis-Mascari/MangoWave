import type { ProjectMWasm, TextureLoadResult } from 'projectm-wasm';
import type { AudioEngine } from './AudioEngine.ts';
import { THEMATIC_PACKS, presetThematicMap } from '../data/presetThematicPacks.ts';

// Pre-warm: start fetching the milkdrop-textures chunk at module load time (while the start
// screen is visible) so it's ready before init() runs.
const milkdropTexturesPromise = import('milkdrop-textures');

/** Authoritative pack display order — thematic packs derived from preset classification. */
export const PACK_ORDER: string[] = [...THEMATIC_PACKS];

export class VisualizerRenderer {
  private projectm: ProjectMWasm | null = null;
  private animationFrameId: number | null = null;
  private presetKeys: string[] = [];
  private presetKeySet: Set<string> = new Set();
  private currentPresetIndex = 0;
  private fpsInterval = 0; // 0 = uncapped
  private lastFrameTime = 0;
  private onPresetChange?: (name: string) => void;
  private onPresetsRegistered?: () => void;
  private _presetPackMap: Map<string, string> = new Map();
  private _importedPresetNames: Set<string> = new Set();

  // Preset .milk text cache — only keep current + previous to avoid unbounded growth
  private milkTextCache: Map<string, string> = new Map();

  // Pre-decoded texture pixel data for the projectM texture callback
  private decodedTextures: Map<string, ImageData> = new Map();

  get currentPresetName(): string {
    return this.presetKeys[this.currentPresetIndex] ?? '';
  }

  get presetList(): string[] {
    return [...this.presetKeys];
  }

  get presetPackMap(): Map<string, string> {
    return new Map(this._presetPackMap);
  }

  /** Names of all bundled preset names (non-imported). */
  get bundledPresetNames(): ReadonlySet<string> {
    const imported = this._importedPresetNames;
    const bundled = new Set<string>();
    for (const key of this.presetKeys) {
      if (!imported.has(key)) bundled.add(key);
    }
    return bundled;
  }

  async init(
    audioEngine: AudioEngine,
    onPresetChange?: (name: string) => void,
    opts?: {
      meshWidth?: number;
      meshHeight?: number;
      fpsCap?: number;
      beatSensitivity?: number;
      excludedPresets?: Set<string>;
      onPresetsRegistered?: () => void;
    },
  ): Promise<void> {
    this.onPresetChange = onPresetChange;
    this.onPresetsRegistered = opts?.onPresetsRegistered;

    // Dynamically import projectm-wasm (lazy — not loaded on start screen)
    const { createProjectM } = await import('projectm-wasm');
    this.projectm = await createProjectM();

    // Initialize projectM with WebGL context on the canvas
    const result = this.projectm.init('#mw-canvas');
    if (result !== 0) {
      throw new Error(`projectM init failed with code ${result}`);
    }

    // Configure projectM
    this.projectm.setPresetLocked(true); // MangoWave's autopilot handles transitions
    this.projectm.setMeshSize(opts?.meshWidth ?? 48, opts?.meshHeight ?? 36);
    this.projectm.setFps(opts?.fpsCap || 60);
    this.projectm.setSoftCutDuration(2.0); // Default blend time
    this.projectm.setBeatSensitivity(opts?.beatSensitivity ?? 1.0);
    this.projectm.setAspectCorrection(true);
    this.projectm.setHardCutEnabled(false);

    // Set up texture load callback
    this.projectm.setTextureLoadCallback((name: string): TextureLoadResult | null => {
      return this.handleTextureLoad(name);
    });

    // Set up preset switch failure callback
    this.projectm.setPresetSwitchFailedCallback((filename: string, message: string) => {
      console.warn(`Preset load failed: ${filename} — ${message}`);
    });

    // Initialize PCM capture from AudioEngine
    await audioEngine.initPcmCapture();
    audioEngine.onPcmData((samples) => {
      if (this.projectm) {
        // samples is interleaved stereo: LRLRLR
        // count = number of samples per channel = total / 2
        this.projectm.pcmAddFloat(samples, samples.length / 2, 2);
      }
    });

    // Register preset names from bundled milkdrop-presets (lazy-loaded)
    this._presetPackMap = new Map();
    this._importedPresetNames = new Set();

    // Load preset names from lightweight manifest
    const { getPresetNames } = await import('milkdrop-presets/names');
    const presetNames = getPresetNames();
    for (const name of presetNames) {
      this._presetPackMap.set(name, presetThematicMap[name] ?? 'Ambient');
    }
    this.presetKeys = [...this._presetPackMap.keys()];
    this.presetKeySet = new Set(this.presetKeys);

    // Load built-in textures for projectM's texture callback (await to avoid race)
    await this.loadBuiltInTextures();

    this.onPresetsRegistered?.();

    // Load a random initial preset, filtering out excluded presets
    if (this.presetKeys.length > 0) {
      const excluded = opts?.excludedPresets;
      const candidates = this.presetKeys.filter((k) => !excluded?.size || !excluded.has(k));
      const pool = candidates.length > 0 ? candidates : this.presetKeys;
      const presetName = pool[Math.floor(Math.random() * pool.length)];
      this.currentPresetIndex = this.presetKeys.indexOf(presetName);
      await this.loadPresetByName(presetName, false);
      this.onPresetChange?.(presetName);
    }
  }

  /** Load and pre-decode built-in textures for the projectM texture callback. */
  private async loadBuiltInTextures(): Promise<void> {
    const { getImages } = await milkdropTexturesPromise;
    const textures = getImages();

    // Decode all textures in parallel batches (limit concurrency to avoid UI block)
    const entries = Object.entries(textures);
    const BATCH_SIZE = 10;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const decoded = await Promise.all(
        batch.map(async ([name, entry]) => {
          const imageData = await this.decodeDataUri(entry.data);
          return { name, imageData };
        }),
      );
      for (const { name, imageData } of decoded) {
        if (!imageData) continue;
        this.decodedTextures.set(name, imageData);
        // Also register wrap/clamp variants pointing to same ImageData
        for (const prefix of ['fw_', 'fc_', 'pw_', 'pc_']) {
          const variantKey = prefix + name;
          if (!this.decodedTextures.has(variantKey)) {
            this.decodedTextures.set(variantKey, imageData);
          }
        }
      }
    }
  }

  /** Handle projectM's texture load callback — synchronous, returns pre-decoded data. */
  private handleTextureLoad(name: string): TextureLoadResult | null {
    const decoded = this.decodedTextures.get(name) ?? this.decodedTextures.get(name.toLowerCase());
    if (!decoded) return null;
    return {
      data: new Uint8Array(decoded.data.buffer),
      width: decoded.width,
      height: decoded.height,
      channels: 4,
    };
  }

  /** Decode a data URI to ImageData using OffscreenCanvas. */
  private async decodeDataUri(dataUri: string): Promise<ImageData | null> {
    const commaIdx = dataUri.indexOf(',');
    if (commaIdx === -1) return null;
    const base64 = dataUri.slice(commaIdx + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const mimeMatch = dataUri.match(/^data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const blob = new Blob([bytes], { type: mimeType });
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
    return imageData;
  }

  /** Load and decode user-imported textures for the projectM texture callback. */
  async loadExtraImages(
    imageData: Record<string, { data: string; width: number; height: number }>,
  ): Promise<void> {
    for (const [name, entry] of Object.entries(imageData)) {
      if (this.decodedTextures.has(name)) continue; // Don't shadow built-in
      const decoded = await this.decodeDataUri(entry.data);
      if (decoded) {
        this.decodedTextures.set(name, decoded);
      }
    }
  }

  setSize(width: number, height: number): void {
    if (this.projectm) {
      this.projectm.setWindowSize(width, height);
    }
  }

  setMeshSize(width: number, height: number): void {
    if (this.projectm) {
      this.projectm.setMeshSize(width, height);
    }
  }

  setFpsCap(fps: number): void {
    this.fpsInterval = fps > 0 ? 1000 / fps : 0;
    if (this.projectm) {
      this.projectm.setFps(fps > 0 ? fps : 60);
    }
  }

  setBeatSensitivity(sensitivity: number): void {
    if (this.projectm) {
      this.projectm.setBeatSensitivity(sensitivity);
    }
  }

  /** Register imported preset names into the preset list and pack map (without loading). */
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

  /** Unregister an imported preset (on delete). */
  unregisterImportedPreset(name: string): void {
    this._presetPackMap.delete(name);
    this._importedPresetNames.delete(name);
    this.milkTextCache.delete(name);
    this.presetKeys = this.presetKeys.filter((k) => k !== name);
    this.presetKeySet.delete(name);
  }

  /** Whether the preset was user-imported (.milk file). */
  isImportedPreset(name: string): boolean {
    return this._importedPresetNames.has(name);
  }

  /** Load a preset by name. Fetches .milk text if not cached, then loads into projectM. */
  async loadPresetByName(name: string, smooth: boolean): Promise<boolean> {
    if (!this.projectm) return false;

    let milkText = this.milkTextCache.get(name);

    if (!milkText) {
      try {
        if (this._importedPresetNames.has(name)) {
          // Imported preset — read from IDB
          const { get: idbGet } = await import('idb-keyval');
          milkText = await idbGet<string>(`mw-milk:${name}`);
        } else {
          // Bundled preset — read from milkdrop-presets
          const { getMilkText } = await import('milkdrop-presets');
          milkText = getMilkText(name);
        }
      } catch (err) {
        console.error(`Failed to load preset "${name}":`, err);
        return false;
      }
    }

    if (!milkText) return false;

    // Evict stale cache entries — keep only current + previous (needed for blend transitions)
    const prevName = this.currentPresetName;
    for (const key of this.milkTextCache.keys()) {
      if (key !== prevName && key !== name) {
        this.milkTextCache.delete(key);
      }
    }
    this.milkTextCache.set(name, milkText);

    this.projectm.loadPreset(milkText, smooth);
    this.currentPresetIndex = this.presetKeys.indexOf(name);
    this.onPresetChange?.(name);
    return true;
  }

  /** Synchronous loadPreset wrapper for compatibility with existing callers. */
  loadPreset(name: string, blendTime = 2.0): void {
    if (!this.projectm) return;
    // Set soft cut duration before loading
    this.projectm.setSoftCutDuration(blendTime);
    this.loadPresetByName(name, blendTime > 0);
  }

  nextPreset(blockedPresets: Set<string> = new Set(), blendTime = 2.0): void {
    const available = this.presetKeys.filter((k) => !blockedPresets.has(k));
    if (available.length === 0) return;
    const randomIndex = Math.floor(Math.random() * available.length);
    this.loadPreset(available[randomIndex], blendTime);
  }

  start(): void {
    if (this.animationFrameId !== null) return;
    this.lastFrameTime = performance.now();
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

    if (this.projectm) {
      this.projectm.renderFrame();
    }
  };

  destroy(): void {
    this.stop();
    if (this.projectm) {
      this.projectm.setTextureLoadCallback(null);
      this.projectm.setPresetSwitchFailedCallback(null);
      this.projectm.destroy();
      this.projectm = null;
    }
    this.presetKeys = [];
    this.presetKeySet = new Set();
    this._presetPackMap = new Map();
    this._importedPresetNames = new Set();
    this.milkTextCache = new Map();
    this.decodedTextures = new Map();
    this.onPresetChange = undefined;
    this.onPresetsRegistered = undefined;
  }
}
