/**
 * TypeScript API for the projectM WASM module.
 *
 * Lazily loads the Emscripten module on first call to `init()`.
 * All methods are thin wrappers around `Module.ccall`/`cwrap` that handle
 * string marshalling and memory management for the C API.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Result returned by the texture load callback. */
export interface TextureLoadResult {
  /** Provide EITHER raw pixel data... */
  data?: Uint8Array;
  width?: number;
  height?: number;
  channels?: number; // 3=RGB, 4=RGBA
  /** ...OR an existing GL texture ID (takes precedence over data). */
  textureId?: number;
}

export type TextureLoadCallback = (name: string) => TextureLoadResult | null | undefined;
export type PresetSwitchFailedCallback = (filename: string, message: string) => void;

/** Typed interface for the projectM WASM module. */
export interface ProjectMWasm {
  /** Initialize projectM with a WebGL 2 context on the given canvas.
   *  @param canvasSelector CSS selector for the canvas element (e.g. "#mw-canvas")
   *  @returns 0 on success, negative on failure */
  init(canvasSelector: string): number;

  /** Destroy the projectM instance and release GL context. */
  destroy(): void;

  /** Render a single frame. Call this from requestAnimationFrame. */
  renderFrame(): void;

  /** Load a preset from raw .milk text.
   *  @param milkText The raw content of a .milk preset file
   *  @param smooth If true, blend transition from current preset */
  loadPreset(milkText: string, smooth: boolean): void;

  /** Set the viewport size in pixels. */
  setWindowSize(width: number, height: number): void;

  /** Set the per-pixel equation mesh resolution. Clamped to [8, 300]. */
  setMeshSize(width: number, height: number): void;

  /** Set the FPS hint for preset animations. */
  setFps(fps: number): void;

  /** Set the smooth transition duration in seconds. */
  setSoftCutDuration(seconds: number): void;

  /** Set beat detection sensitivity (default 1.0). */
  setBeatSensitivity(sensitivity: number): void;

  /** Lock/unlock preset auto-switching (MangoWave locks; autopilot handles switches). */
  setPresetLocked(locked: boolean): void;

  /** Enable/disable beat-driven hard cuts. */
  setHardCutEnabled(enabled: boolean): void;

  /** Set manual frame time (seconds since start). Use -1 for system clock. */
  setFrameTime(seconds: number): void;

  /** Enable/disable aspect ratio correction in presets. */
  setAspectCorrection(enabled: boolean): void;

  /** Feed PCM audio samples to projectM.
   *  @param samples Interleaved float samples (LRLRLR for stereo)
   *  @param count Number of samples PER CHANNEL
   *  @param channels 1=mono, 2=stereo */
  pcmAddFloat(samples: Float32Array, count: number, channels: number): void;

  /** Get projectM version. */
  getVersion(): { major: number; minor: number; patch: number };

  /** Register a callback for texture loading requests. */
  setTextureLoadCallback(callback: TextureLoadCallback | null): void;

  /** Register a callback for preset switch failures. */
  setPresetSwitchFailedCallback(callback: PresetSwitchFailedCallback | null): void;
}

// Emscripten module type (subset we use)
interface EmscriptenModule {
  ccall: (name: string, returnType: string | null, argTypes: string[], args: unknown[]) => any;
  cwrap: (name: string, returnType: string | null, argTypes: string[]) => (...args: any[]) => any;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPF32: Float32Array;
  stringToUTF8: (str: string, ptr: number, maxBytes: number) => void;
  lengthBytesUTF8: (str: string) => number;
  // Custom callback hooks set from JS
  _textureLoadCallback?: TextureLoadCallback | null;
  _presetSwitchFailedCallback?: PresetSwitchFailedCallback | null;
}

let modulePromise: Promise<EmscriptenModule> | null = null;
let module: EmscriptenModule | null = null;

// Wrapped C functions (lazily initialized after module load)
let _pm_render_frame: () => void;
let _pm_set_window_size: (w: number, h: number) => void;
let _pm_set_mesh_size: (w: number, h: number) => void;
let _pm_set_fps: (fps: number) => void;
let _pm_set_soft_cut_duration: (sec: number) => void;
let _pm_set_beat_sensitivity: (val: number) => void;
let _pm_set_preset_locked: (locked: number) => void;
let _pm_set_hard_cut_enabled: (enabled: number) => void;
let _pm_set_frame_time: (sec: number) => void;
let _pm_set_aspect_correction: (enabled: number) => void;

async function loadModule(): Promise<EmscriptenModule> {
  if (module) return module;
  if (modulePromise) return modulePromise;

  modulePromise = (async () => {
    const { default: createProjectMModule } = await import('../dist/projectm.mjs');
    const mod: EmscriptenModule = await createProjectMModule();
    module = mod;

    // Pre-wrap hot-path functions for zero-overhead calls
    _pm_render_frame = mod.cwrap('pm_render_frame', null, []);
    _pm_set_window_size = mod.cwrap('pm_set_window_size', null, ['number', 'number']);
    _pm_set_mesh_size = mod.cwrap('pm_set_mesh_size', null, ['number', 'number']);
    _pm_set_fps = mod.cwrap('pm_set_fps', null, ['number']);
    _pm_set_soft_cut_duration = mod.cwrap('pm_set_soft_cut_duration', null, ['number']);
    _pm_set_beat_sensitivity = mod.cwrap('pm_set_beat_sensitivity', null, ['number']);
    _pm_set_preset_locked = mod.cwrap('pm_set_preset_locked', null, ['number']);
    _pm_set_hard_cut_enabled = mod.cwrap('pm_set_hard_cut_enabled', null, ['number']);
    _pm_set_frame_time = mod.cwrap('pm_set_frame_time', null, ['number']);
    _pm_set_aspect_correction = mod.cwrap('pm_set_aspect_correction', null, ['number']);

    return mod;
  })();

  return modulePromise;
}

/** Helper: allocate a UTF-8 string in WASM memory, call fn, then free. */
function withCString(mod: EmscriptenModule, str: string, fn: (ptr: number) => void): void {
  const len = mod.lengthBytesUTF8(str) + 1;
  const ptr = mod._malloc(len);
  mod.stringToUTF8(str, ptr, len);
  try {
    fn(ptr);
  } finally {
    mod._free(ptr);
  }
}

export async function createProjectM(): Promise<ProjectMWasm> {
  const mod = await loadModule();

  return {
    init(canvasSelector: string): number {
      return mod.ccall('pm_init', 'number', ['string'], [canvasSelector]);
    },

    destroy(): void {
      mod.ccall('pm_destroy', null, [], []);
    },

    renderFrame(): void {
      _pm_render_frame();
    },

    loadPreset(milkText: string, smooth: boolean): void {
      withCString(mod, milkText, (ptr) => {
        mod.ccall('pm_load_preset', null, ['number', 'number'], [ptr, smooth ? 1 : 0]);
      });
    },

    setWindowSize(width: number, height: number): void {
      _pm_set_window_size(width, height);
    },

    setMeshSize(width: number, height: number): void {
      _pm_set_mesh_size(width, height);
    },

    setFps(fps: number): void {
      _pm_set_fps(fps);
    },

    setSoftCutDuration(seconds: number): void {
      _pm_set_soft_cut_duration(seconds);
    },

    setBeatSensitivity(sensitivity: number): void {
      _pm_set_beat_sensitivity(sensitivity);
    },

    setPresetLocked(locked: boolean): void {
      _pm_set_preset_locked(locked ? 1 : 0);
    },

    setHardCutEnabled(enabled: boolean): void {
      _pm_set_hard_cut_enabled(enabled ? 1 : 0);
    },

    setFrameTime(seconds: number): void {
      _pm_set_frame_time(seconds);
    },

    setAspectCorrection(enabled: boolean): void {
      _pm_set_aspect_correction(enabled ? 1 : 0);
    },

    pcmAddFloat(samples: Float32Array, count: number, channels: number): void {
      const byteLen = samples.byteLength;
      const ptr = mod._malloc(byteLen);
      mod.HEAPF32.set(samples, ptr >> 2);
      try {
        mod.ccall('pm_pcm_add_float', null, ['number', 'number', 'number'], [ptr, count, channels]);
      } finally {
        mod._free(ptr);
      }
    },

    getVersion(): { major: number; minor: number; patch: number } {
      const majorPtr = mod._malloc(4);
      const minorPtr = mod._malloc(4);
      const patchPtr = mod._malloc(4);
      try {
        mod.ccall(
          'pm_get_version',
          null,
          ['number', 'number', 'number'],
          [majorPtr, minorPtr, patchPtr],
        );
        const view = new DataView(mod.HEAPF32.buffer);
        return {
          major: view.getInt32(majorPtr, true),
          minor: view.getInt32(minorPtr, true),
          patch: view.getInt32(patchPtr, true),
        };
      } finally {
        mod._free(majorPtr);
        mod._free(minorPtr);
        mod._free(patchPtr);
      }
    },

    setTextureLoadCallback(callback: TextureLoadCallback | null): void {
      mod._textureLoadCallback = callback;
    },

    setPresetSwitchFailedCallback(callback: PresetSwitchFailedCallback | null): void {
      mod._presetSwitchFailedCallback = callback;
    },
  };
}
