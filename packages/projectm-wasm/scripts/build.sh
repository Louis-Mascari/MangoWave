#!/usr/bin/env bash
#
# Reproducible Emscripten build for projectm-wasm.
#
# Prerequisites:
#   - Emscripten SDK (emsdk) activated in PATH
#   - projectM source cloned with submodules at $PROJECTM_SRC (default: ~/projectm-spike)
#   - projectM already built for WASM at $PROJECTM_BUILD (default: ~/projectm-spike/build-wasm)
#
# Output:
#   dist/projectm.mjs   — ES module glue (WASM inlined via SINGLE_FILE)
#
# Usage:
#   ./scripts/build.sh                          # Use defaults
#   PROJECTM_SRC=~/projectm ./scripts/build.sh  # Custom source path

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PKG_DIR/dist"

PROJECTM_SRC="${PROJECTM_SRC:-$HOME/projectm-spike}"
PROJECTM_BUILD="${PROJECTM_BUILD:-$PROJECTM_SRC/build-wasm}"

# Verify prerequisites
if ! command -v emcc &>/dev/null; then
  echo "Error: emcc not found. Activate emsdk first." >&2
  exit 1
fi

if [ ! -f "$PROJECTM_BUILD/src/libprojectM/libprojectM-4.a" ]; then
  echo "Error: libprojectM-4.a not found at $PROJECTM_BUILD/src/libprojectM/" >&2
  echo "Build projectM for WASM first:" >&2
  echo "  cd $PROJECTM_SRC && mkdir -p build-wasm && cd build-wasm" >&2
  echo "  emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -DENABLE_PLAYLIST=OFF \\" >&2
  echo "    -DENABLE_SDL_UI=OFF -DBUILD_TESTING=OFF -DENABLE_SYSTEM_PROJECTM_EVAL=OFF \\" >&2
  echo "    -DENABLE_SYSTEM_GLM=OFF" >&2
  echo "  emmake make -j\$(nproc)" >&2
  exit 1
fi

mkdir -p "$DIST_DIR"

echo "Building projectm-wasm..."
echo "  Source: $PROJECTM_SRC"
echo "  Build:  $PROJECTM_BUILD"
echo "  Output: $DIST_DIR"

# Include paths for projectM headers (both source and generated)
INCLUDE_FLAGS=(
  "-I$PROJECTM_SRC/src/api/include"
  "-I$PROJECTM_BUILD/src/api/include"
)

# Static libraries to link
LIBS=(
  "$PROJECTM_BUILD/src/libprojectM/libprojectM-4.a"
  "$PROJECTM_BUILD/vendor/projectm-eval/projectm-eval/libprojectM_eval.a"
  "$PROJECTM_BUILD/vendor/glad/libglad.a"
)

# Emscripten flags
EMCC_FLAGS=(
  -O2
  -fexceptions                      # projectM uses C++ exceptions for preset parse errors
  -sMIN_WEBGL_VERSION=2
  -sMAX_WEBGL_VERSION=2
  -sFULL_ES2=1
  -sFULL_ES3=1
  -sALLOW_MEMORY_GROWTH=1
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createProjectMModule
  -sSINGLE_FILE=1                   # Inline WASM as base64 in .mjs (one file to commit)
  -sEXPORTED_FUNCTIONS='[
    "_pm_init","_pm_destroy","_pm_render_frame","_pm_load_preset",
    "_pm_set_window_size","_pm_set_mesh_size","_pm_set_fps",
    "_pm_set_soft_cut_duration","_pm_set_beat_sensitivity",
    "_pm_set_preset_locked","_pm_set_hard_cut_enabled",
    "_pm_set_frame_time","_pm_set_aspect_correction",
    "_pm_pcm_add_float","_pm_get_version",
    "_malloc","_free"
  ]'
  -sEXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","lengthBytesUTF8","HEAPU8","HEAPU32","HEAPF32"]'
  -sNO_EXIT_RUNTIME=1
  -sENVIRONMENT=web
  --no-entry
)

emcc "${INCLUDE_FLAGS[@]}" \
  "$PKG_DIR/src/projectm-wrapper.c" \
  "${LIBS[@]}" \
  "${EMCC_FLAGS[@]}" \
  -o "$DIST_DIR/projectm.mjs"

# Report size
WASM_SIZE=$(wc -c < "$DIST_DIR/projectm.mjs")
echo "Build complete: $DIST_DIR/projectm.mjs ($(( WASM_SIZE / 1024 )) KB)"
echo "  (WASM is inlined as base64 via SINGLE_FILE)"
