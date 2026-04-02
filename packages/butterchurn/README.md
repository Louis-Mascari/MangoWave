# butterchurn

Vendored [butterchurn](https://github.com/jberg/butterchurn) v2 — WebGL 2 MilkDrop visualizer. ESM wrapper around the original minified UMD bundle with TypeScript declarations.

## Why vendored

butterchurn is effectively unmaintained (last stable release 2018). Vendoring eliminates npm as a single point of failure and allows MangoWave-specific patches.

## Exports

- `default` — butterchurn renderer (creates visualizer instance)
- `butterchurnExtraImages` — built-in texture images (cells, lichen, mage, etc.)

## Structure

- `lib/` — original minified bundles (`butterchurn.min.js`, `butterchurnExtraImages.min.js`)
- `src/index.js` — ESM wrapper with CJS interop (`mod.default ?? mod`)
- `src/index.d.ts` — TypeScript declarations
