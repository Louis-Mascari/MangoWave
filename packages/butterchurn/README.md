# butterchurn

Vendored [butterchurn](https://github.com/jberg/butterchurn) v2 — WebGL 2 MilkDrop visualizer. ESM wrapper around the beautified UMD bundle (with MangoWave patches) and TypeScript declarations.

## Why vendored

butterchurn is effectively unmaintained (last stable release 2018). Vendoring eliminates npm as a single point of failure and allows MangoWave-specific patches.

## Exports

- `default` — butterchurn renderer (creates visualizer instance)
- `butterchurnExtraImages` — built-in texture images (cells, lichen, mage, etc.)

## Structure

- `lib/` — `butterchurn.js` (beautified, active, with patches), `butterchurn.min.js` (gitignored reference), `butterchurnExtraImages.min.js`
- `src/index.js` — ESM wrapper with CJS interop (`mod.default ?? mod`)
- `src/index.d.ts` — TypeScript declarations

## MangoWave Patches

The beautified bundle (`butterchurn.js`) includes MangoWave-specific patches. See [PATCHES.md](PATCHES.md) for details, math, and re-application instructions.
