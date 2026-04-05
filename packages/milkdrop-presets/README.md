# milkdrop-presets

438 MilkDrop-Original presets converted to butterchurn JSON format with EEL source strings for WASM compilation.

## How it works

Raw `.milk` files live in `milk/`. The build script (`scripts/build-milkdrop-presets.mjs`) converts them via `milkdrop-preset-converter`, deduplicates against butterchurn packs, and outputs:

- `lib/presets.json` — full preset data (~5MB, lazy-loaded on first access)
- `lib/presetNames.json` — name manifest (~18KB, loaded at init)

Both are committed artifacts (not gitignored).

## Exports

- `milkdrop-presets` — full preset data (dynamic import, ~5MB)
- `milkdrop-presets/names` — lightweight name manifest for registration at startup

## Two-tier loading

Names are registered with the renderer at startup from the lightweight manifest. Full preset objects are loaded on demand via `milkdropPresetsLoader.ts` (deep clone, `compilePresetEel` for WASM compilation). Evicted after blend transition to prevent OOM — same pattern as user-imported presets.

## Rebuilding

```bash
node scripts/build-milkdrop-presets.mjs
```

The script is extensible — pass any directory of `.milk` files. Auto-deduplicates against all existing butterchurn packs.
