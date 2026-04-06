#!/bin/bash
# Build hlslparser WASM module using Emscripten.
# Requires: source ~/emsdk/emsdk_env.sh (or emsdk on PATH)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p dist

emcc src/Main.cpp vendor/hlslparser/src/*.cpp -o dist/hlslparser.mjs \
  -s 'EXPORT_NAME="HLSLParser"' \
  -s EXPORTED_FUNCTIONS="['_parseHLSL']" \
  -s EXPORTED_RUNTIME_METHODS='["cwrap"]' \
  -s NO_EXIT_RUNTIME=1 \
  -s SINGLE_FILE=1 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  --bind -O3

echo "Built dist/hlslparser.mjs ($(wc -c < dist/hlslparser.mjs) bytes)"
