/**
 * JS wrapper for the glsl-optimizer WASM module.
 *
 * Exports:
 *   initOptimizer()     — async, loads the WASM module. Call once at startup.
 *   tryOptimizeGlsl()   — sync, returns optimized GLSL or the input unchanged on failure.
 *   isOptimizerReady()  — sync, returns true if the module has been loaded.
 *
 * The optimizer performs function inlining, dead code elimination, constant folding,
 * copy propagation, and arithmetic simplification on GLSL ES 3.0 fragment shaders.
 */
import GLSLOptimizerModule from '../dist/glsl-optimizer.mjs';

let optimizeGlsl = null;

/**
 * Load and initialize the WASM module. Safe to call multiple times — subsequent
 * calls return the same promise.
 */
let initPromise = null;
export function initOptimizer() {
  if (!initPromise) {
    initPromise = GLSLOptimizerModule().then((instance) => {
      optimizeGlsl = instance.cwrap('optimize_glsl', 'string', ['string', 'number', 'boolean']);
    });
  }
  return initPromise;
}

/** @returns {boolean} Whether the optimizer WASM module has been loaded. */
export function isOptimizerReady() {
  return optimizeGlsl !== null;
}

/**
 * Optimize a GLSL ES 3.0 fragment shader. Returns the optimized source on success,
 * or the original source unchanged if the optimizer is not loaded or encounters an error.
 *
 * @param {string} source — Complete GLSL fragment shader (must include #version 300 es)
 * @returns {string} Optimized GLSL or the original source on failure
 */
export function tryOptimizeGlsl(source) {
  if (!optimizeGlsl || !source || source.length === 0) {
    return source;
  }
  try {
    // shaderType 3 = kGlslTargetOpenGLES30, vertexShader = false
    const result = optimizeGlsl(source, 3, false);
    if (!result || result.startsWith('Error:') || !result.trimStart().startsWith('#version')) {
      if (result && !result.startsWith('Error:')) {
        console.debug('[glsl-optimizer] Optimizer returned invalid output, using original shader');
      }
      return source;
    }
    return result;
  } catch {
    return source;
  }
}
