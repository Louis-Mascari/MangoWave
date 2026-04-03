/**
 * Compiles EEL source strings in a converted preset to WASM via eel-wasm,
 * creating butterchurn-compatible adapter functions.
 *
 * Presets with `_eelFormat: true` contain preprocessed EEL source in their
 * `*_eqs_str` fields (instead of JS code). This module compiles that EEL to
 * WebAssembly and sets real Function objects on the preset so butterchurn
 * skips its own `new Function()` compilation.
 */

import { loadModule } from 'eel-wasm';

// ---------------------------------------------------------------------------
// Pool variable definitions — every variable butterchurn reads/writes must
// be declared so the adapter can sync JS state ↔ WASM globals.
// Variables NOT listed here become WASM-internal (invisible to JS) — fine for
// preset-private temporaries. reg00–reg99 are auto-shared by eel-wasm.
// ---------------------------------------------------------------------------

/** Read-only globals injected by butterchurn each frame. */
const GLOBAL_RO = [
  'frame',
  'time',
  'fps',
  'bass',
  'mid',
  'treb',
  'bass_att',
  'mid_att',
  'treb_att',
  'meshx',
  'meshy',
  'aspectx',
  'aspecty',
  'pixelsx',
  'pixelsy',
];

/** Per-frame read/write variables (init + frame equations). */
const FRAME_RW = [
  'zoom',
  'zoomexp',
  'rot',
  'warp',
  'cx',
  'cy',
  'dx',
  'dy',
  'sx',
  'sy',
  'ob_size',
  'ob_r',
  'ob_g',
  'ob_b',
  'ob_a',
  'ib_size',
  'ib_r',
  'ib_g',
  'ib_b',
  'ib_a',
  'mv_x',
  'mv_y',
  'mv_dx',
  'mv_dy',
  'mv_l',
  'mv_r',
  'mv_g',
  'mv_b',
  'mv_a',
  'decay',
  'gamma',
  'echo_zoom',
  'echo_alpha',
  'echo_orient',
  'wave_mode',
  'wave_dots',
  'wave_thick',
  'wave_additive',
  'wave_brighten',
  'wave_a',
  'wave_scale',
  'wave_smoothing',
  'wave_r',
  'wave_g',
  'wave_b',
  'wave_x',
  'wave_y',
  'wave_mystery',
  'darken_center',
  'wrap',
  'invert',
  'brighten',
  'darken',
  'solarize',
  'fshader',
  'b1n',
  'b2n',
  'b3n',
  'b1x',
  'b2x',
  'b3x',
  'b1ed',
  'monitor',
];

/** Q-variables shared across all equation types. */
const Q_VARS = Array.from({ length: 32 }, (_, i) => `q${i + 1}`);

/** T-variables shared within shape/wave groups. */
const T_VARS = Array.from({ length: 8 }, (_, i) => `t${i + 1}`);

/** Per-pixel additional variables. */
const PIXEL_VARS = ['x', 'y', 'rad', 'ang'];

/** Shape-specific variables. */
const SHAPE_VARS = [
  'x',
  'y',
  'rad',
  'ang',
  'r',
  'g',
  'b',
  'a',
  'r2',
  'g2',
  'b2',
  'a2',
  'border_r',
  'border_g',
  'border_b',
  'border_a',
  'thickoutline',
  'textured',
  'tex_zoom',
  'tex_ang',
  'additive',
  'sides',
  'num_inst',
  'instance',
  'tex_r',
  'tex_g',
  'tex_b',
  'tex_a',
];

/** Wave-specific variables. */
const WAVE_VARS = [
  'samples',
  'sep',
  'scaling',
  'spectrum',
  'smoothing',
  'r',
  'g',
  'b',
  'a',
  'usedots',
  'thick',
  'additive',
  'x',
  'y',
];

// ---------------------------------------------------------------------------
// Pool creation helpers
// ---------------------------------------------------------------------------

type WasmPool = Record<string, WebAssembly.Global>;

function createGlobals(names: string[]): WasmPool {
  const pool: WasmPool = {};
  for (const name of names) {
    pool[name] = new WebAssembly.Global({ value: 'f64', mutable: true }, 0);
  }
  return pool;
}

/** Create shared Q-variable globals (same Global objects reused across pools). */
function createSharedQVars(): WasmPool {
  return createGlobals(Q_VARS);
}

/** Create shared T-variable globals. */
function createSharedTVars(): WasmPool {
  return createGlobals(T_VARS);
}

// ---------------------------------------------------------------------------
// Adapter function factory
// ---------------------------------------------------------------------------

/**
 * Create a butterchurn-compatible adapter function that syncs JS state ↔ WASM.
 * butterchurn calls: `a = preset.frame_eqs(a)` where `a` is a state object.
 */
function createAdapter(
  pool: WasmPool,
  wasmFn: (() => void) | undefined,
): (a: Record<string, number>) => Record<string, number> {
  if (!wasmFn) {
    return (a) => a;
  }

  const entries = Object.entries(pool);
  return function eelAdapter(a: Record<string, number>): Record<string, number> {
    for (let i = 0; i < entries.length; i++) {
      const [key, global] = entries[i];
      global.value = a[key] ?? 0;
    }
    wasmFn();
    for (let i = 0; i < entries.length; i++) {
      const [key, global] = entries[i];
      a[key] = global.value;
    }
    return a;
  };
}

/**
 * Variables that butterchurn sets on the per-vertex state object before each
 * pixel_eqs call, and reads back after. Only these need to be synced per vertex.
 *
 * The per-pixel pool SHARES WebAssembly.Global objects with the per-frame pool,
 * so all other variables (bass, q-vars, t-vars, etc.) already have correct
 * values from frame_eqs — no per-vertex sync needed for them.
 *
 * Derived from butterchurn's vertex loop in presetEquationRunner:
 *   IN:  x, y, rad, ang (per-vertex), zoom, zoomexp, rot, warp, cx, cy, dx, dy, sx, sy (reset from frame)
 *   OUT: zoom, zoomexp, rot, warp, cx, cy, dx, dy, sx, sy (read back per-vertex)
 */
const PIXEL_SYNC_VARS = [
  'x',
  'y',
  'rad',
  'ang',
  'zoom',
  'zoomexp',
  'rot',
  'warp',
  'cx',
  'cy',
  'dx',
  'dy',
  'sx',
  'sy',
];

/**
 * Optimized adapter for per-pixel equations. Syncs only the ~14 variables that
 * change between vertices instead of the full ~123-variable pool. This is critical
 * because pixel_eqs is called once per vertex (e.g. 48×36 = 1,728 times/frame).
 */
function createPixelAdapter(
  pool: WasmPool,
  wasmFn: (() => void) | undefined,
): (a: Record<string, number>) => Record<string, number> {
  if (!wasmFn) {
    return (a) => a;
  }

  // Pre-resolve the subset of globals that need per-vertex sync
  const syncEntries: [string, WebAssembly.Global][] = [];
  for (const name of PIXEL_SYNC_VARS) {
    const global = pool[name];
    if (global) syncEntries.push([name, global]);
  }

  return function pixelAdapter(a: Record<string, number>): Record<string, number> {
    for (let i = 0; i < syncEntries.length; i++) {
      const [key, global] = syncEntries[i];
      global.value = a[key] ?? 0;
    }
    wasmFn();
    for (let i = 0; i < syncEntries.length; i++) {
      const [key, global] = syncEntries[i];
      a[key] = global.value;
    }
    return a;
  };
}

// ---------------------------------------------------------------------------
// Preset compilation
// ---------------------------------------------------------------------------

interface PresetShape {
  baseVals: { enabled: number; [k: string]: number };
  init_eqs_str?: string;
  frame_eqs_str?: string;
  init_eqs?: (a: Record<string, number>) => Record<string, number>;
  frame_eqs?: (a: Record<string, number>) => Record<string, number>;
}

interface PresetWave {
  baseVals: { enabled: number; [k: string]: number };
  init_eqs_str?: string;
  frame_eqs_str?: string;
  point_eqs_str?: string;
  init_eqs?: (a: Record<string, number>) => Record<string, number>;
  frame_eqs?: (a: Record<string, number>) => Record<string, number>;
  point_eqs?: (a: Record<string, number>) => Record<string, number>;
}

interface EelPreset {
  _eelFormat?: boolean;
  init_eqs_str?: string;
  frame_eqs_str?: string;
  pixel_eqs_str?: string;
  init_eqs?: (a: Record<string, number>) => Record<string, number>;
  frame_eqs?: (a: Record<string, number>) => Record<string, number>;
  pixel_eqs?: (a: Record<string, number>) => Record<string, number>;
  shapes?: PresetShape[];
  waves?: PresetWave[];
  [key: string]: unknown;
}

/**
 * Compile all EEL equations in a preset to WASM and set adapter functions.
 * Mutates the preset object in-place and returns it.
 *
 * Throws if eel-wasm compilation fails (caller should handle gracefully).
 */
export async function compilePresetEel(preset: EelPreset): Promise<EelPreset> {
  // Create shared variable globals
  const qVars = createSharedQVars();
  const tVars = createSharedTVars();

  // Build pools and function definitions for a single loadModule call
  const pools: Record<string, WasmPool> = {};
  const functions: Record<string, { pool: string; code: string }> = {};

  // --- Main preset equations ---
  const framePool = createGlobals([...GLOBAL_RO, ...FRAME_RW]);
  const mainPool = { ...framePool, ...qVars, ...tVars };
  pools.perFrame = mainPool;

  functions.presetInit = {
    pool: 'perFrame',
    code: preset.init_eqs_str?.trim() || '',
  };
  functions.perFrame = {
    pool: 'perFrame',
    code: preset.frame_eqs_str?.trim() || '',
  };

  // Per-pixel gets its own pool with additional x/y/rad/ang
  const pixelPool = { ...mainPool, ...createGlobals(PIXEL_VARS) };
  pools.perVertex = pixelPool;
  functions.perPixel = {
    pool: 'perVertex',
    code: preset.pixel_eqs_str?.trim() || '',
  };

  // --- Shapes ---
  const shapes = preset.shapes ?? [];
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    if (!shape.baseVals || shape.baseVals.enabled === 0) continue;

    const shapePool = {
      ...createGlobals([...GLOBAL_RO, ...FRAME_RW, ...SHAPE_VARS]),
      ...qVars,
      ...tVars,
    };
    const poolName = `shape${i}`;
    pools[poolName] = shapePool;

    functions[`shape${i}Init`] = {
      pool: poolName,
      code: shape.init_eqs_str?.trim() || '',
    };
    functions[`shape${i}Frame`] = {
      pool: poolName,
      code: shape.frame_eqs_str?.trim() || '',
    };
  }

  // --- Waves ---
  const waves = preset.waves ?? [];
  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    if (!wave.baseVals || wave.baseVals.enabled === 0) continue;

    const wavePool = {
      ...createGlobals([...GLOBAL_RO, ...FRAME_RW, ...WAVE_VARS]),
      ...qVars,
      ...tVars,
    };
    const poolName = `wave${i}`;
    pools[poolName] = wavePool;

    functions[`wave${i}Init`] = {
      pool: poolName,
      code: wave.init_eqs_str?.trim() || '',
    };
    functions[`wave${i}Frame`] = {
      pool: poolName,
      code: wave.frame_eqs_str?.trim() || '',
    };
    functions[`wave${i}Point`] = {
      pool: poolName,
      code: wave.point_eqs_str?.trim() || '',
    };
  }

  // Compile all equations into a single WASM module
  const mod = await loadModule({ pools, functions });
  const exports = mod.exports as Record<string, (() => void) | undefined>;

  // Set adapter functions on the preset object.
  // init_eqs and frame_eqs sync ALL pool variables (called once per frame).
  // pixel_eqs uses an optimized adapter that syncs only ~14 vars per vertex
  // instead of ~123 — frame-level globals are already correct from frame_eqs
  // because the per-pixel pool shares the same WebAssembly.Global objects.
  preset.init_eqs = createAdapter(pools.perFrame, exports.presetInit);
  preset.frame_eqs = createAdapter(pools.perFrame, exports.perFrame);
  preset.pixel_eqs = createPixelAdapter(pools.perVertex, exports.perPixel);

  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    if (!shape.baseVals || shape.baseVals.enabled === 0) continue;
    const poolName = `shape${i}`;
    shape.init_eqs = createAdapter(pools[poolName], exports[`shape${i}Init`]);
    shape.frame_eqs = createAdapter(pools[poolName], exports[`shape${i}Frame`]);
  }

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    if (!wave.baseVals || wave.baseVals.enabled === 0) continue;
    const poolName = `wave${i}`;
    wave.init_eqs = createAdapter(pools[poolName], exports[`wave${i}Init`]);
    wave.frame_eqs = createAdapter(pools[poolName], exports[`wave${i}Frame`]);
    wave.point_eqs = createAdapter(pools[poolName], exports[`wave${i}Point`]);
  }

  return preset;
}
