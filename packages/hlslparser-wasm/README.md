# hlslparser-wasm

HLSL to GLSL ES 3.0 shader compiler, compiled to WebAssembly via Emscripten.

Based on [projectM's hlslparser fork](https://github.com/projectM-visualizer/projectm/tree/master/vendor/hlslparser) — an enhanced version of [Thekla/hlslparser](https://github.com/Thekla/hlslparser) with GLSL ES 3.0 support, PS3 shader features, and DX9 NaN compatibility.

Replaces [hlslparser-js](https://github.com/jberg/hlslparser-js) (ES 1.0 only) in the milkdrop-preset-converter pipeline to unlock PS3 MilkDrop preset support.

## API

```js
import { convertHLSLShader } from 'hlslparser-wasm';

const glsl = await convertHLSLShader(hlslSource, 'main', 'ps'); // 'ps' or 'vs'
```

## Building

Requires [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html):

```bash
source ~/emsdk/emsdk_env.sh
./build.sh
```

The built artifact (`dist/hlslparser.mjs`) is checked into the repo so CI and normal development never need Emscripten.

## License

MIT — see `vendor/hlslparser/LICENSE` (Unknown Worlds Entertainment, Inc. + projectM contributors).
