/**
 * projectM WASM wrapper for MangoWave.
 *
 * Thin C layer around the projectM C API that:
 * 1. Creates a WebGL 2 context on a canvas element via Emscripten HTML5 API
 * 2. Exports lifecycle/render/audio/preset functions for the JS API
 * 3. Forwards texture-load and preset-switch-failed callbacks to JS
 *
 * Compiled with Emscripten to a single MODULARIZE + EXPORT_ES6 .mjs + .wasm bundle.
 */

#include <emscripten.h>
#include <emscripten/html5.h>
#include <emscripten/html5_webgl.h>

#include <projectM-4/projectM.h>
#include <projectM-4/core.h>
#include <projectM-4/audio.h>
#include <projectM-4/parameters.h>
#include <projectM-4/render_opengl.h>
#include <projectM-4/callbacks.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static projectm_handle pm = NULL;
static EMSCRIPTEN_WEBGL_CONTEXT_HANDLE gl_ctx = 0;

/* ---------- JS callback bridge ---------- */

/* JS-side callback for texture loading. Registered from index.ts via EM_ASM. */
EM_JS(void, js_texture_load_callback, (const char* name_ptr, unsigned int* data_out_ptr,
       unsigned int* width_out_ptr, unsigned int* height_out_ptr,
       unsigned int* channels_out_ptr, unsigned int* texid_out_ptr), {
  /* name_ptr is a C string in WASM memory */
  var name = UTF8ToString(name_ptr);
  if (typeof Module._textureLoadCallback === 'function') {
    var result = Module._textureLoadCallback(name);
    if (result) {
      if (result.textureId) {
        HEAPU32[texid_out_ptr >> 2] = result.textureId;
        HEAPU32[width_out_ptr >> 2] = result.width || 0;
        HEAPU32[height_out_ptr >> 2] = result.height || 0;
      } else if (result.data) {
        /* Raw pixel data: copy into WASM memory */
        var byteLen = result.data.length;
        var wasmPtr = _malloc(byteLen);
        HEAPU8.set(result.data, wasmPtr);
        HEAPU32[data_out_ptr >> 2] = wasmPtr;
        HEAPU32[width_out_ptr >> 2] = result.width;
        HEAPU32[height_out_ptr >> 2] = result.height;
        HEAPU32[channels_out_ptr >> 2] = result.channels || 4;
      }
    }
  }
});

EM_JS(void, js_preset_switch_failed, (const char* filename_ptr, const char* message_ptr), {
  var filename = filename_ptr ? UTF8ToString(filename_ptr) : '(data)';
  var message = message_ptr ? UTF8ToString(message_ptr) : '(no message)';
  if (typeof Module._presetSwitchFailedCallback === 'function') {
    Module._presetSwitchFailedCallback(filename, message);
  }
});

/* C callback that projectM calls when it needs a texture */
static void on_texture_load(const char* texture_name,
                            projectm_texture_load_data* data,
                            void* user_data) {
  (void)user_data;
  unsigned int raw_data_ptr = 0;
  unsigned int width = 0;
  unsigned int height = 0;
  unsigned int channels = 0;
  unsigned int texture_id = 0;

  js_texture_load_callback(texture_name, &raw_data_ptr, &width, &height, &channels, &texture_id);

  if (texture_id > 0) {
    data->texture_id = texture_id;
    data->width = width;
    data->height = height;
  } else if (raw_data_ptr > 0) {
    data->data = (const unsigned char*)(uintptr_t)raw_data_ptr;
    data->width = width;
    data->height = height;
    data->channels = channels;
    /* Note: projectM copies the data during the callback, so we free after return.
       Actually, the data pointer must remain valid until the callback returns.
       Since projectM processes it synchronously, we schedule free after. */
  }
}

/* Deferred free of texture data allocated in js_texture_load_callback.
   Called after on_texture_load returns via a post-render cleanup. */
static unsigned int pending_free_ptr = 0;

static void on_texture_load_wrapper(const char* texture_name,
                                     projectm_texture_load_data* data,
                                     void* user_data) {
  on_texture_load(texture_name, data, user_data);
  /* If raw data was provided, we need to free the WASM-side copy after projectM reads it */
  if (data->data && data->texture_id == 0) {
    pending_free_ptr = (unsigned int)(uintptr_t)data->data;
  }
}

static void cleanup_pending_texture_data(void) {
  if (pending_free_ptr) {
    free((void*)(uintptr_t)pending_free_ptr);
    pending_free_ptr = 0;
  }
}

/* C callback for preset switch failure */
static void on_preset_switch_failed(const char* filename, const char* message, void* user_data) {
  (void)user_data;
  js_preset_switch_failed(filename, message);
}

/* ---------- Exported API ---------- */

EMSCRIPTEN_KEEPALIVE
int pm_init(const char* canvas_selector) {
  EmscriptenWebGLContextAttributes attrs;
  emscripten_webgl_init_context_attributes(&attrs);
  attrs.majorVersion = 2;
  attrs.minorVersion = 0;
  attrs.antialias = 0; /* We handle our own rendering */
  attrs.depth = 1;
  attrs.stencil = 0;
  attrs.alpha = 0;
  attrs.powerPreference = EM_WEBGL_POWER_PREFERENCE_HIGH_PERFORMANCE;
  attrs.preserveDrawingBuffer = 0;

  gl_ctx = emscripten_webgl_create_context(canvas_selector, &attrs);
  if (gl_ctx <= 0) {
    printf("pm_init: Failed to create WebGL 2 context on '%s' (error %lu)\n",
           canvas_selector, gl_ctx);
    return -1;
  }
  emscripten_webgl_make_context_current(gl_ctx);
  emscripten_webgl_enable_extension(gl_ctx, "OES_texture_float");

  pm = projectm_create();
  if (!pm) {
    printf("pm_init: projectm_create() returned NULL\n");
    emscripten_webgl_destroy_context(gl_ctx);
    gl_ctx = 0;
    return -2;
  }

  /* Lock preset switching — MangoWave's autopilot handles transitions */
  projectm_set_preset_locked(pm, true);

  /* Register callbacks */
  projectm_set_texture_load_event_callback(pm, on_texture_load_wrapper, NULL);
  projectm_set_preset_switch_failed_event_callback(pm, on_preset_switch_failed, NULL);

  return 0;
}

EMSCRIPTEN_KEEPALIVE
void pm_destroy(void) {
  if (pm) {
    projectm_destroy(pm);
    pm = NULL;
  }
  if (gl_ctx > 0) {
    emscripten_webgl_destroy_context(gl_ctx);
    gl_ctx = 0;
  }
}

EMSCRIPTEN_KEEPALIVE
void pm_render_frame(void) {
  if (!pm) return;
  cleanup_pending_texture_data();
  projectm_opengl_render_frame(pm);
}

EMSCRIPTEN_KEEPALIVE
void pm_load_preset(const char* milk_text, int smooth) {
  if (!pm || !milk_text) return;
  projectm_load_preset_data(pm, milk_text, smooth ? true : false);
}

EMSCRIPTEN_KEEPALIVE
void pm_set_window_size(int width, int height) {
  if (!pm) return;
  projectm_set_window_size(pm, (size_t)width, (size_t)height);
}

EMSCRIPTEN_KEEPALIVE
void pm_set_mesh_size(int width, int height) {
  if (!pm) return;
  projectm_set_mesh_size(pm, (size_t)width, (size_t)height);
}

EMSCRIPTEN_KEEPALIVE
void pm_set_fps(int fps) {
  if (!pm) return;
  projectm_set_fps(pm, fps);
}

EMSCRIPTEN_KEEPALIVE
void pm_set_soft_cut_duration(double seconds) {
  if (!pm) return;
  projectm_set_soft_cut_duration(pm, seconds);
}

EMSCRIPTEN_KEEPALIVE
void pm_set_beat_sensitivity(float sensitivity) {
  if (!pm) return;
  projectm_set_beat_sensitivity(pm, sensitivity);
}

EMSCRIPTEN_KEEPALIVE
void pm_set_preset_locked(int locked) {
  if (!pm) return;
  projectm_set_preset_locked(pm, locked ? true : false);
}

EMSCRIPTEN_KEEPALIVE
void pm_set_hard_cut_enabled(int enabled) {
  if (!pm) return;
  projectm_set_hard_cut_enabled(pm, enabled ? true : false);
}

EMSCRIPTEN_KEEPALIVE
void pm_set_frame_time(double seconds) {
  if (!pm) return;
  projectm_set_frame_time(pm, seconds);
}

EMSCRIPTEN_KEEPALIVE
void pm_set_aspect_correction(int enabled) {
  if (!pm) return;
  projectm_set_aspect_correction(pm, enabled ? true : false);
}

/**
 * Feed interleaved stereo PCM float samples to projectM.
 * @param samples_ptr Pointer to float array in WASM memory (LRLRLR interleaved)
 * @param count Number of samples PER CHANNEL
 * @param channels 1=mono, 2=stereo
 */
EMSCRIPTEN_KEEPALIVE
void pm_pcm_add_float(const float* samples_ptr, unsigned int count, int channels) {
  if (!pm || !samples_ptr) return;
  projectm_pcm_add_float(pm, samples_ptr, count, (projectm_channels)channels);
}

EMSCRIPTEN_KEEPALIVE
void pm_get_version(int* major, int* minor, int* patch) {
  projectm_get_version_components(major, minor, patch);
}
