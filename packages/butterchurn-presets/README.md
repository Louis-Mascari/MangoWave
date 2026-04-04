# butterchurn-presets

Vendored [butterchurn-presets](https://github.com/jberg/butterchurn-presets) — 395 unique MilkDrop presets across 5 packs, pre-converted to butterchurn JSON format.

## Why vendored

Static data from an unmaintained npm package. Vendoring ensures CI/deploy is never blocked by upstream changes.

## Packs

| Pack       | Presets | Size  |
| ---------- | ------- | ----- |
| Extra      | ~180    | 828KB |
| Minimal    | ~140    | 640KB |
| Extra2     | ~120    | 596KB |
| NonMinimal | ~100    | 460KB |
| MD1        | ~60     | 280KB |

## Structure

- `lib/` — original minified pack files (`.min.js`)
- `src/index.js` — ESM wrapper with CJS interop
- `src/index.d.ts` — TypeScript declarations
