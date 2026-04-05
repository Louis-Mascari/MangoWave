# Preset Classification System

Classifies MangoWave's 832 presets into 4 thematic packs. Two classification approaches are available:

1. **LLM-based** (`classify-presets-llm.mjs`) — uses Claude to semantically classify presets based on their code, parameters, and names. Higher accuracy; understands intent. This is the canonical classification used in production.
2. **Heuristic** (`classify-presets.mjs`) — regex/threshold-based scoring. Fast, no API key needed, useful for quick re-runs or as a baseline to diff against.

## Thematic Packs

| Pack            | Description                                          | Key Signals                                                                                                                                              |
| --------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ambient**     | Smooth, time-driven animations — calm and meditative | Gentle motion, mathematical patterns, modest audio modulation. Calm, time-driven. Default/fallback.                                                      |
| **Reactive**    | Responds to beats — audio-driven motion and color    | Audio variables (`bass`, `mid`, `treb`, `bass_att`, `mid_att`, `treb_att`, `vol`) are the PRIMARY driver. Fundamentally different with vs without audio. |
| **Psychedelic** | Intense shaders, warping, and visual complexity      | High warp, complex shaders, solarize/invert, aggressive motion, blur/noise. Visual intensity.                                                            |
| **Ethereal**    | Trails, echo layers, and soft glowing persistence    | High decay (>0.97), echo alpha >0, blur effects. Ghostly, dreamy, layered persistence.                                                                   |

**Waveform pack (removed):** Only 4 presets (spectrum analyzers/oscilloscopes) qualified — too few to be useful as a filter. Merged into Reactive. Re-add when the preset library grows (e.g., cream-of-the-crop expansion).

## How to Re-classify All Presets

### LLM-based (recommended)

```bash
ANTHROPIC_API_KEY=sk-... node scripts/classify-presets-llm.mjs --update
```

Flags:

- `--update` — regenerate `presetThematicPacks.ts` after classification
- `--diff` — compare with heuristic baseline (`preset-classification-heuristic.json`)
- `--model NAME` — Claude model (default: `claude-sonnet-4-20250514`)
- `--batch-size N` — presets per API call (default: 40)
- `--concurrency N` — parallel API calls (default: 3)
- `--resume` — resume from `llm-classification-partial.json` (auto-saved after each batch)

### Heuristic (no API key needed)

```bash
node scripts/classify-presets.mjs --update
```

Both scripts:

1. Load all butterchurn (5 packs) and MilkDrop-Original (437) presets
2. Classify each preset
3. Write `scripts/preset-classification.json` (intermediate, gitignored)
4. With `--update`: regenerate `packages/frontend/src/data/presetThematicPacks.ts`

After regenerating, run `pnpm exec prettier --write packages/frontend/src/data/presetThematicPacks.ts` to format.

## How to Classify New Presets

New MilkDrop presets added to `packages/milkdrop-presets` will be classified by either script. Run with `--update` after rebuilding the milkdrop-presets JSON.

For reviewing borderline cases, check `scripts/preset-classification.json` which maps every preset name to its assigned pack.

## Heuristic Algorithm (classify-presets.mjs)

1. **Score** each preset on 4 dimensions: audio reactivity, waveform prominence, psychedelic complexity, ethereal persistence.
2. **Compute percentile thresholds** across all presets (65th for audio, 60th for psychedelic/ethereal).
3. **Classify** using priority rules:
   - High waveform score → Reactive (waveform-style presets merged into Reactive)
   - Dominant category wins if above percentile threshold
   - **Ambient as fallback**

## Audio Variable Reference

From [Geiss's MilkDrop preset authoring guide](http://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html):

- `bass`, `mid`, `treb` — instantaneous audio levels (0-1+)
- `bass_att`, `mid_att`, `treb_att` — attenuated (smoothed) versions
- `vol` — overall volume level

In butterchurn JS form, these are `a.bass`, `a.mid`, etc. In raw EEL (MilkDrop .milk files), they're bare identifiers.
