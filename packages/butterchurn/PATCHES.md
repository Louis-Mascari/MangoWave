# butterchurn Patches

MangoWave patches applied to the butterchurn source fork (`src/butterchurn/`, forked from jberg/butterchurn v2.6.7, commit `d90f271`). All patches are searchable via `[MW-PATCH:` comments.

---

## 1. Frame-Rate Normalization (JS-level)

### Problem

butterchurn's per-frame effects (decay, border alpha, motion vector alpha, echo alpha) accumulate once per frame without time normalization. Presets authored for MilkDrop's ~30fps look wrong at 60-144fps. Example: `fDecay=0.98` at 30fps gives `0.98^30 = 0.545` brightness after 1 second, but at 60fps gives `0.98^60 = 0.297` — nearly twice as dark.

### Math (reference rate = 30fps)

| Parameter      | Formula                      | Rationale                                                                           |
| -------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `decay`        | `pow(decay, 30/fps)`         | Multiplicative per-frame; `decay^N` after N frames must equal `decay^30` per second |
| `ob_a`, `ib_a` | `1 - pow(1 - alpha, 30/fps)` | Alpha blending accumulation; ensures same opacity buildup per second                |
| `mv_a`         | `1 - pow(1 - alpha, 30/fps)` | Same alpha blending pattern as borders                                              |
| `echo_alpha`   | `1 - pow(1 - alpha, 30/fps)` | Video echo blend                                                                    |

A guard skips the computation when `30/fps` is within 1% of 1.0 (i.e., fps ≈ 30).

### Location

`src/butterchurn/rendering/renderer.js` — search for `/* [MW-PATCH: frame-rate normalization] */`. Inserted after `this.presetEquationRunner.runFrameEquations(globalVars)`, before `this.runPixelEquations()`.

### Verification

1. Load "Aderrasi - See" (`fDecay=1.0`, `ob_a=0.1`) — border should not eat the screen at 60fps
2. Toggle FPS cap between 30/60/uncapped — trail persistence and border opacity should look equivalent
3. Normal presets (decay 0.95-0.99) — subtle correction, should not look noticeably different at 60fps

---

## 2. `_mw_fps_ratio` Shader Uniform

### Problem

Some presets use shader-level subtraction/multiplication for fade effects instead of the standard `decay` parameter — e.g., `texture(...).xyz - 0.004` in warp shaders. At 60fps this fades twice as fast as at 30fps. The JS-level patch (Patch 1) can't fix these because the constants are hardcoded in GLSL.

### Solution

Added `uniform float _mw_fps_ratio;` to both warp and comp fragment shader preambles (after `uniform float fps;`). Value is set to `30.0 / fps` each frame via `gl.uniform1f`.

The `milkdrop-preset-converter` package's `normalizeFpsConstants()` function rewrites shader constants to reference `_mw_fps_ratio`:

- `ret -= C` → `ret -= C * _mw_fps_ratio`
- `ret *= F` (0<F<1) → `ret *= pow(F, _mw_fps_ratio)`
- Compound affine patterns → `ret = mix(ret, rhs, _mw_fps_ratio)`

Previously the converter injected `float _mw_fps_ratio = 30.0 / fps;` as a local variable in each shader. Now it's a butterchurn-provided uniform — no local declaration needed.

### Location

`src/butterchurn/rendering/shaders/warp.js` and `src/butterchurn/rendering/shaders/comp.js`:

- Fragment shader preamble: `uniform float _mw_fps_ratio;` after `uniform float fps;`
- `createShader`: `this.mwFpsRatioLoc` cached via `getUniformLocation`
- `renderQuadTexture`: search for `/* [MW-PATCH: _mw_fps_ratio uniform] */`

---

## 3. Shader Compile/Link Error Handling

### Problem

butterchurn has zero `gl.getShaderParameter(COMPILE_STATUS)` checks. Broken shaders fail silently, rendering as black screens with no console output.

### Solution

Added `_mwCheckShader(gl, shader, label)` and `_mwCheckProgram(gl, program, label)` module-level helper functions at the top of both warp.js and comp.js. These check compile/link status and log errors via `console.error('[butterchurn] ...')`.

Called after compile/link in `createShader` methods — the two dynamic shader paths that accept user/preset GLSL code. Static shaders (border, motion vectors, blur, etc.) are not checked since their source is hardcoded and known-good.

### Location

`src/butterchurn/rendering/shaders/warp.js` and `src/butterchurn/rendering/shaders/comp.js` — search for `_mwCheckShader` and `_mwCheckProgram`.

---

## 4. Graceful Shader Error Fallback

### Problem

When a preset's warp or comp shader fails to compile/link (malformed GLSL, unsupported extensions, etc.), the visualizer renders black until the next preset loads. Users see no indication of what went wrong.

### Solution

In both warp.js and comp.js `createShader(shaderText, _fallback)` methods:

1. After compiling + linking, if `_mwCheckShader` or `_mwCheckProgram` fails AND `shaderText` was non-empty (user/preset shader):
   - Logs `console.warn('[butterchurn] Warp/Comp shader failed to compile, falling back to default')`
   - Calls `this.createShader('', true)` to use the default passthrough shader
   - Returns early
2. The `_fallback` guard parameter prevents infinite recursion if the default shader somehow fails

### Location

`src/butterchurn/rendering/shaders/warp.js` and `src/butterchurn/rendering/shaders/comp.js` — search for `/* [MW-PATCH: graceful shader fallback] */` in `createShader`.

---

## 5. Universal FPS Normalization for Shader Constants

### Problem

395 butterchurn pack presets have pre-compiled shader strings that don't go through `milkdrop-preset-converter`. 6 known presets (all in NonMinimal pack) have hardcoded per-frame fade constants that run 2× too fast at 60fps. The converter's `normalizeFpsConstants()` only ran at import/build time, missing bundled presets entirely.

### Solution

Extracted `normalizeFpsConstants()` into `src/butterchurn/rendering/shaders/fpsNormalization.js` and applied it universally in both warp.js and comp.js `createShader()` methods. Every preset's shader body is normalized at shader creation time, regardless of whether it came from a bundled pack or user import.

The function is idempotent — already-normalized presets (imported, MilkDrop) pass through unchanged because the patterns it matches (`ret -= CONST`, `ret *= CONST` where 0<F<1) are replaced with expressions containing `_mw_fps_ratio`, which don't re-match.

### Patterns handled

| Pattern            | Replacement                    | Rationale                             |
| ------------------ | ------------------------------ | ------------------------------------- |
| `ret -= C`         | `ret -= C * _mw_fps_ratio`     | Per-frame subtraction (fade to black) |
| `ret = ret - C`    | `ret -= C * _mw_fps_ratio`     | Expanded subtraction form             |
| `ret *= F` (0<F<1) | `ret *= pow(F, _mw_fps_ratio)` | Multiplicative decay                  |
| `(ret - C) * F`    | Compound affine normalization  | Combined fade + decay                 |
| `ret = A + B*ret`  | Affine transform normalization | General affine patterns               |

### Location

`src/butterchurn/rendering/shaders/fpsNormalization.js` — the function itself.
`src/butterchurn/rendering/shaders/warp.js` and `comp.js` — called in `createShader` after shader text processing, search for `normalizeFpsConstants`.

---

## 6. Source Beautification → Source Fork

### Background

The original `butterchurn.min.js` was a 193KB single-line minified blob with mangled variable names. Previously beautified with js-beautify + prettier (~8,400 lines), still with mangled names.

### Current state

Replaced entirely with the actual ES6 source from jberg/butterchurn v2.6.7 (commit `d90f271`). The source has ~30 modules with meaningful class/method/variable names. Vite bundles from source directly — no intermediate build step.

`lib/butterchurn.js` and `lib/butterchurn.min.js` have been deleted. `lib/butterchurnExtraImages.min.js` is retained (static texture data, not part of the source fork).

The `ecma-proposal-math-extensions` dependency (upstream uses `Math.clamp`) is replaced with an inline polyfill in `src/butterchurn/index.js`.
