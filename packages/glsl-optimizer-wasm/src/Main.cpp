// based on https://github.com/zz85/glsl-optimizer/blob/gh-pages/src/emscripten/EmMain.cpp
#include <stdio.h>
#include <string>
#include <stdlib.h>
#include "../glsl-optimizer/src/glsl/glsl_optimizer.h"

static glslopt_ctx* gContext = 0;

extern "C" {
  const char* optimize_glsl(char* source, int shaderType, bool vertexShader) {
    glslopt_target languageTarget = kGlslTargetOpenGLES20;

    switch(shaderType) {
      case 1:
        languageTarget = kGlslTargetOpenGL;
        break;
      case 2:
        languageTarget = kGlslTargetOpenGLES20;
        break;
      case 3:
        languageTarget = kGlslTargetOpenGLES30;
        break;
    }

    if(!source) {
      return "Error: Must give a source";
    }

    gContext = glslopt_initialize(languageTarget);

    if(!gContext) {
      return "Error:\nFailed to initialize glslopt";
    }

    const char* failed_log = 0;
    const glslopt_shader_type type = vertexShader ? kGlslOptShaderVertex : kGlslOptShaderFragment;

    glslopt_shader* shader = glslopt_optimize(gContext, type, source, 0);

    const char* optimizedShader;

    if( !glslopt_get_status(shader) ) {
      failed_log = glslopt_get_log(shader);
    } else {
      optimizedShader = glslopt_get_output(shader);
    }

    glslopt_cleanup(gContext);

    if (failed_log) {
      return std::string("Error:\n").append(std::string(failed_log)).data();
    }

    return optimizedShader;
  }
}
