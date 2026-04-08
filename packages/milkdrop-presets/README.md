# milkdrop-presets

437 MilkDrop-Original presets stored as raw `.milk` text files, parsed natively by projectM.

## How it works

Raw `.milk` files live in `milk/`. The build script (`scripts/build-milkdrop-presets.mjs`) reads them, deduplicates against existing preset packs, and outputs:

- `lib/presets.json` — full preset data with raw `.milk` text (~5MB, lazy-loaded on first access)
- `lib/presetNames.json` — name manifest (~18KB, loaded at init)

Both are committed artifacts (not gitignored).

## Exports

- `milkdrop-presets` — full preset data (dynamic import, ~5MB)
- `milkdrop-presets/names` — lightweight name manifest for registration at startup

## Two-tier loading

Names are registered with the renderer at startup from the lightweight manifest. Raw `.milk` text is loaded on demand via `getMilkText()` and passed to projectM, which parses it natively. This avoids loading the full 5MB bundle at launch.

## Rebuilding

```bash
node scripts/build-milkdrop-presets.mjs
```

The script is extensible — pass any directory of `.milk` files. Auto-deduplicates against all existing preset packs.
