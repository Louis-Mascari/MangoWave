# butterchurn Patches

MangoWave patches applied to the vendored butterchurn minified source. If the minified bundle is ever regenerated, these patches must be re-applied.

---

## 1. Frame-Rate Normalization

**File:** `lib/butterchurn.min.js`

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

### How to apply

**Find:**

```
):o=n;var l=this.targetTexture;
```

**Replace with:**

```
):o=n;/* [MW-PATCH: frame-rate normalization] */var _r=30/this.fps;if(_r<.99||_r>1.01){o.decay=Math.pow(o.decay,_r);var _oa=1-Math.pow(1-o.ob_a,_r);o.ob_a=_oa<0?0:_oa>1?1:_oa;var _ia=1-Math.pow(1-o.ib_a,_r);o.ib_a=_ia<0?0:_ia>1?1:_ia;var _ma=1-Math.pow(1-o.mv_a,_r);o.mv_a=_ma<0?0:_ma>1?1:_ma;var _ea=1-Math.pow(1-o.echo_alpha,_r);o.echo_alpha=_ea<0?0:_ea>1?1:_ea;}var l=this.targetTexture;
```

### Known limitation: shader-level per-frame math

This patch normalizes the 5 JS-level frame variables that butterchurn manages between frames. It does **not** normalize constants hardcoded in preset warp/comp GLSL shaders. Some presets use shader-level subtraction for fade effects instead of the standard `decay` parameter — e.g., "Geiss - Spiral Artifact" has `texture(...).xyz - 0.004` in its warp shader, subtracting brightness every frame. At 60fps this fades twice as fast as at 30fps.

This affects both bundled and user-imported presets, since the shader code originates from the `.milk` file's `[warp]`/`[comp]` sections. However, it's uncommon — most preset authors use `fDecay` for fade (now normalized). Fixing shader-level constants would require passing an fps ratio uniform into warp/comp shaders, which requires the full butterchurn source fork (step 15).

**Audit results (bundled presets):** 6 of 395 bundled presets have this pattern, all in the NonMinimal pack:

| Preset                                   | Subtraction/frame | Fade @60fps | Severity               |
| ---------------------------------------- | ----------------- | ----------- | ---------------------- |
| martin - bombyx mori                     | 0.025             | 0.7s        | Severe                 |
| martin - fruit machine                   | 0.025             | 0.7s        | Severe                 |
| suksma - Rovastar - Sunflower Passion... | 0.004             | 4.2s        | Moderate               |
| Geiss - Spiral Artifact                  | 0.004             | 4.2s        | Moderate (quarantined) |
| martin - frosty caves 2                  | 0.004             | 4.2s        | Moderate               |
| Martin - charisma                        | 0.002             | 8.3s        | Slow                   |

**milkdrop-original (552 presets):** zero affected — all use standard `fDecay`.

**Fix approach for source fork:** Add a `_mw_fps_ratio` uniform (value `30.0 / this.fps`) to the warp/comp shader preamble. Preset shaders can't consume it directly (they're pre-authored), so butterchurn would need to detect `sampler_main` texture reads with constant subtraction and multiply the constant by the uniform. Alternatively, a simpler approach: expose the fps ratio as a preset variable (like `time` or `fps`) and apply a global correction factor to the warp shader's output before writing to the frame buffer.

### Verification

1. Load "Aderrasi - See" (`fDecay=1.0`, `ob_a=0.1`) — border should not eat the screen at 60fps
2. Toggle FPS cap between 30/60/uncapped — trail persistence and border opacity should look equivalent
3. Normal presets (decay 0.95-0.99) — subtle correction, should not look noticeably different at 60fps
