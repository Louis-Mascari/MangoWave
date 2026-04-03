# butterchurn Patches

MangoWave patches applied to the vendored butterchurn source (`lib/butterchurn.js`, beautified from `butterchurn.min.js`). If the bundle is ever regenerated from upstream, these patches must be re-applied.

**Source file:** `lib/butterchurn.js` (beautified with js-beautify + prettier from the original `butterchurn.min.js`)

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

### Edge cases

- `decay=1.0` → `pow(1,x)=1` (no decay, unchanged)
- `decay=0.0` → `pow(0,x)=0` (instant black, unchanged)
- `alpha=0` → `1-pow(1,x)=0` (disabled, unchanged)
- `alpha=1` → `1-pow(0,x)=1` (opaque, unchanged)
- fps=30 → ratio ≈ 1.0, skipped by guard

### Location

Search for `/* [MW-PATCH: frame-rate normalization] */` — inserted after frame equation evaluation, before warp rendering.

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

Search for `/* [MW-PATCH: _mw_fps_ratio uniform] */` in the `renderQuadTexture` methods (warp + comp).

In `createShader` for both warp and comp: `_mw_fps_ratio` added to the fragment shader preamble string (after `uniform float fps;`), and `this.mwFpsRatioLoc` cached via `getUniformLocation`.

### Remaining limitation

This uniform is available to **imported** presets (which go through the converter) but not to **bundled** pre-compiled presets. 6 bundled presets in the NonMinimal pack have shader-level fade constants:

| Preset                                   | Subtraction/frame | Severity |
| ---------------------------------------- | ----------------- | -------- |
| martin - bombyx mori                     | 0.025             | Severe   |
| martin - fruit machine                   | 0.025             | Severe   |
| suksma - Rovastar - Sunflower Passion... | 0.004             | Moderate |
| Geiss - Spiral Artifact                  | 0.004             | Moderate |
| martin - frosty caves 2                  | 0.004             | Moderate |
| Martin - charisma                        | 0.002             | Slow     |

---

## 3. Shader Compile/Link Error Handling

### Problem

butterchurn has zero `gl.getShaderParameter(COMPILE_STATUS)` checks. Broken shaders fail silently, rendering as black screens with no console output.

### Solution

Added `_mwCheckShader(gl, shader, label)` and `_mwCheckProgram(gl, program, label)` helper functions near the top of the module (after the `_` utility class). These check compile/link status and log errors via `console.error('[butterchurn] ...')`.

Called after compile/link in the warp and comp shader `createShader` methods — the two dynamic shader paths that accept user/preset GLSL code. Static shaders (border, motion vectors, blur, etc.) are not checked since their source is hardcoded and known-good.

### Location

Search for `_mwCheckShader` and `_mwCheckProgram` function definitions and call sites.

---

## 4. Source Beautification

### Background

The original `butterchurn.min.js` is a 193KB single-line minified blob with mangled variable names. Debugging shader issues (black output, silent failures) is impossible in minified form.

### Process

1. `npx js-beautify` — expanded to readable indented structure
2. `npx prettier --print-width 80` — reformatted to 80-char lines (~8400 lines)

The beautified `butterchurn.js` is the active source. `butterchurn.min.js` is retained as the original reference.

Variable names remain mangled (single letters), but the code structure (class methods, shader templates, uniform binding) is readable and patchable.
