# milkdrop-preset-converter

Forked [milkdrop-preset-converter](https://github.com/jberg/milkdrop-preset-converter) — converts `.milk` MilkDrop preset files to butterchurn JSON format.

## Why forked

- Replaced `hlslparser-js` (Thekla 2013, GLSL ES 1.0) with `hlslparser-wasm` (projectM fork, GLSL ES 3.0) for PS3 shader support
- Added EEL preprocessor pipeline (`fixStarVariableNames`, `insertImplicitOps`, `stripUnaryPlus`)
- Added `structureHlslparserOutput` to properly separate hlslparser output into header + body for butterchurn
- Added `fixUniformAssignments` for immutable uniform workarounds
- Eliminated webpack 3 + babel 6 build step — Vite bundles from source directly

## Dependencies

- `hlslparser-wasm` — HLSL to GLSL ES 3.0 compiler (dynamically imported)
- `milkdrop-eel-parser` — EEL2 equation parser (vendored workspace package)
- `milkdrop-preset-utils` — `.milk` file parser + GLSL post-processor (npm)

## Usage

Dynamically imported at runtime when a user imports `.milk` files. Zero main-bundle cost.
