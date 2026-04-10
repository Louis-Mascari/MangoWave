# butterchurn

Source-forked [butterchurn](https://github.com/jberg/butterchurn) v2.6.7 (commit `d90f271`) — WebGL 2 MilkDrop visualizer. ~30 ES6 source modules with meaningful names, bundled directly by Vite (no intermediate build step). TypeScript declarations provided.

## Why source-forked

butterchurn is effectively unmaintained (last stable release 2018). The source fork eliminates npm as a single point of failure, enables MangoWave-specific patches, and provides readable source for debugging.

## Exports

- `default` — butterchurn renderer (creates visualizer instance)
- `butterchurnExtraImages` — built-in texture images (cells, lichen, mage, etc.)

## Structure

- `src/butterchurn/` — ES6 source modules (~30 files) with 17 MangoWave patches
- `src/index.js` — ESM wrapper
- `src/index.d.ts` — TypeScript declarations
- `lib/butterchurnExtraImages.min.js` — built-in texture data (static, not part of the source fork)

## MangoWave Patches

17 patches applied to the source. All searchable via `[MW-PATCH:` comments. See [PATCHES.md](PATCHES.md) for details, math, and verification instructions.

### Patch Summary

1. Frame-rate normalization (JS-level)
2. `_mw_fps_ratio` shader uniform
3. Shader compile/link error handling
4. Graceful shader error fallback
5. Universal FPS normalization for shader constants
6. Source fork (replaces beautified UMD bundle)
7. Fix `targetTexture` leak on resize
8. Fix `solarize` mixing bug
9. Fix `this.frame` reference in `calcTimeAndFPS`
10. Ring buffer for FPS history
11. `DYNAMIC_DRAW` for per-frame buffers
12. Clean up previous shader program on preset change
13. Guard `createSampler()` null returns on WebGL context loss
14. GLSL optimizer integration (dead code elimination via `glsl-optimizer-wasm`)
15. ImageBitmap texture upload
16. Deduplicate texture uploads by ImageBitmap reference
17. True hard cut when blend time is zero

## Dependencies

- `glsl-optimizer-wasm` — Mesa GLSL optimizer compiled to WASM. Called in `warp.js` and `comp.js` `createShader()` to optimize fully-assembled fragment shaders before WebGL compilation. Dead code elimination removes ~96% of unused converter output (matrix/mult overloads). Graceful fallback — returns unoptimized shader if WASM isn't loaded or optimization fails.

## Upstream

The `ecma-proposal-math-extensions` dependency (upstream uses `Math.clamp`) is replaced with an inline polyfill in `src/butterchurn/index.js`.
