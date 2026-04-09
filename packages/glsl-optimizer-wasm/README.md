# glsl-optimizer-wasm

Mesa GLSL optimizer compiled to WebAssembly via Emscripten. Performs function inlining, dead code elimination, constant folding, copy propagation, and arithmetic simplification on GLSL ES 3.0 fragment shaders.

Based on [jberg/glsl-optimizer-js](https://github.com/jberg/glsl-optimizer-js) (itself based on [Mesa's GLSL optimizer](https://github.com/aras-p/glsl-optimizer)). Rebuilt with Emscripten 5.0.5 — the published npm package uses ancient Emscripten (~1.38.x) that doesn't initialize in modern runtimes.

## API

```js
import { initOptimizer, tryOptimizeGlsl, isOptimizerReady } from 'glsl-optimizer-wasm';

// Load WASM module (call once at startup)
await initOptimizer();

// Optimize a complete GLSL ES 3.0 fragment shader
const optimized = tryOptimizeGlsl(shaderSource);
// Returns optimized source, or the input unchanged if optimization fails
```

- `initOptimizer()` — async, loads the WASM module. Safe to call multiple times (returns same promise).
- `tryOptimizeGlsl(source)` — sync, returns optimized GLSL or input unchanged on failure. No-op if WASM isn't loaded yet.
- `isOptimizerReady()` — sync, returns true if the module has been loaded.

## Integration

Integrated at butterchurn's `createShader()` in `warp.js`/`comp.js` — optimizes the fully-assembled fragment shader (template + converter fragments). Pre-warmed at module load in `VisualizerRenderer.ts`. Benefits all presets (bundled + imported).

The optimizer requires **complete GLSL programs** (`#version`, uniforms, `void main()`), not the GLSL fragments output by the converter. That's why it runs at shader assembly time, not in the conversion pipeline.

## Structure

```
src/
├── index.js          # JS wrapper (initOptimizer, tryOptimizeGlsl, isOptimizerReady)
├── index.d.ts        # TypeScript declarations
└── Main.cpp          # Emscripten entry point (C wrapper around glslopt API)
glsl-optimizer/
├── src/              # Mesa GLSL optimizer C/C++ source (from aras-p/glsl-optimizer)
├── include/          # Public headers
└── license.txt       # Mesa/MIT license
dist/
└── glsl-optimizer.mjs  # Built WASM artifact (717KB / 216KB gzipped, committed)
build.js              # Emscripten build script
```

## Building

Requires [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (tested with v5.0.5).

```bash
# Activate Emscripten (adjust path to your emsdk install)
source ~/emsdk/emsdk_env.sh

# Build from the package directory
cd packages/glsl-optimizer-wasm
node build.js
```

The built artifact (`dist/glsl-optimizer.mjs`) is checked into the repo so CI and normal development never need Emscripten. Uses Emscripten SINGLE_FILE mode (WASM inlined as base64).

## License

MIT (see `LICENSE` and `glsl-optimizer/license.txt`)
