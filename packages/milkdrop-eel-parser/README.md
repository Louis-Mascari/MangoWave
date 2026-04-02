# milkdrop-eel-parser

Vendored [milkdrop-eel-parser](https://github.com/jberg/milkdrop-eel-parser) — parses MilkDrop EEL2 equations into executable JavaScript functions.

## Why vendored

- Original is a ClojureScript build artifact (cannot rebuild from source)
- Patched `int()` function: `Math.floor` → `Math.trunc` (truncation toward zero, matching MilkDrop behavior). 82 presets (14.9%) affected.
- Unmaintained npm package from single developer

## Structure

- `lib/` — original minified parser bundle
- `src/index.js` — ESM wrapper with CJS interop (`mod.default ?? mod`)
- `src/index.d.ts` — TypeScript declarations

## Note

This parser will be replaced by `eel-wasm` (captbaritone) in a future update for better performance (WASM), security (sandbox), and correctness.
