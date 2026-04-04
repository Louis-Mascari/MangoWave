# Preset Classification System

Classifies MangoWave's presets into 5 thematic packs using heuristic analysis of preset properties (baseVals, equations, shaders).

## Thematic Packs

| Pack            | Description                                          | Key Signals                                                                                                                                                                                            |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ambient**     | Smooth, time-driven animations — calm and meditative | Low scores across all other categories (fallback). These presets animate smoothly with mathematical equations but aren't dominated by audio reactivity, complex shaders, or heavy persistence effects. |
| **Reactive**    | Responds to beats — audio-driven motion and color    | High density of audio variable references (`bass`, `mid`, `treb`, `bass_att`, `mid_att`, `treb_att`, `vol`) in equations and shaders, above 65th percentile.                                           |
| **Psychedelic** | Intense shaders, warping, and visual complexity      | High warp values, long/complex shaders (>2000 chars), blur/noise texture sampling (`GetBlur`, `noise_`), solarize/invert effects, intense motion (zoom, rotation).                                     |
| **Waveform**    | Spectrum bars, oscilloscope lines, and audio shapes  | Visible motion vectors (`mv_a > 0`), high wave alpha (`wave_a > 0.8`), multiple prominent custom waves with substantial point equations.                                                               |
| **Ethereal**    | Trails, echo layers, and soft glowing persistence    | High decay (>0.97), echo alpha >0.05 with non-default echo settings (orient/zoom), blur shader references.                                                                                             |

## Classification Algorithm

1. **Score** each preset on 4 dimensions: audio reactivity, waveform prominence, psychedelic complexity, ethereal persistence.
2. **Compute percentile thresholds** for audio, psychedelic, and ethereal scores across all presets (65th, 60th, 60th respectively).
3. **Classify** using priority rules:
   - Waveform first (score >= 3.0) — most selective category
   - Dominant category wins if above percentile threshold
   - Secondary waveform (score >= 1.5)
   - **Ambient as fallback** — presets that don't strongly score in any category

## How to Re-classify All Presets

```bash
node scripts/classify-presets.mjs --update
```

This will:

1. Load all butterchurn (5 packs) and MilkDrop-Original (438) presets
2. Score and classify each preset
3. Write `scripts/preset-classification.json` (intermediate, gitignored)
4. Regenerate `packages/frontend/src/data/presetThematicPacks.ts`

After regenerating, run `npx prettier --write packages/frontend/src/data/presetThematicPacks.ts` to format.

## How to Classify New Presets

New MilkDrop presets added to `packages/milkdrop-presets` will be classified by the same script. Run `--update` after rebuilding the milkdrop-presets JSON.

For manually reviewing borderline cases, check `scripts/preset-classification.json` which maps every preset name to its assigned pack.

## Audio Variable Reference

From [Geiss's MilkDrop preset authoring guide](http://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html):

- `bass`, `mid`, `treb` — instantaneous audio levels (0-1+)
- `bass_att`, `mid_att`, `treb_att` — attenuated (smoothed) versions
- `vol` — overall volume level

In butterchurn JS form, these are `a.bass`, `a.mid`, etc. In raw EEL (MilkDrop .milk files), they're bare identifiers.
