import _ from 'lodash';
import {
  splitPreset,
  prepareShader,
  processUnOptimizedShader,
  createBasePresetFuns
} from 'milkdrop-preset-utils';
import milkdropParser from 'milkdrop-eel-parser';
import { convertHLSLShader } from 'hlslparser-wasm';

/** Convert PS3+ HLSL shader to GLSL ES 3.0 via hlslparser-wasm. */
export async function convertShader (shader) {
  if (shader.length === 0) {
    return '';
  }

  const shaderBodyName = 'main_shader_sentinel';
  let fullShader = prepareShader(shader);
  fullShader = fullShader.replace('float4 shader_body (', `float4 ${shaderBodyName} (`);
  let convertedShader = await convertHLSLShader(fullShader, shaderBodyName, 'fs');
  convertedShader = processUnOptimizedShader(convertedShader);

  return convertedShader;
}

// MilkDrop built-in macros/functions that butterchurn's fragment shader template
// does NOT define. Presets reference these freely; they must be in the shader header
// (before shader_body) so butterchurn includes them when assembling the GLSL.
const PS2_HEADER_MACROS = [
  '#define GetBlur1(uv) (texture(sampler_blur1, uv).xyz * scale1 + bias1)',
  '#define GetBlur2(uv) (texture(sampler_blur2, uv).xyz * scale2 + bias2)',
  '#define GetBlur3(uv) (texture(sampler_blur3, uv).xyz * scale3 + bias3)',
  '#define lum(x) dot(x, vec3(0.32, 0.49, 0.29))',
  '#define saturate(x) clamp(x, 0.0, 1.0)',
].join('\n');

/** Convert PS2 shader via text-level HLSL→GLSL replacements.
 *  PS2 MilkDrop shaders are pseudo-GLSL that butterchurn embeds directly in its
 *  fragment shader template. They need type/function name replacements and
 *  int→float promotion — NOT full HLSL parsing (hlslparser-wasm can't parse PS2). */
function convertPS2Shader (shader) {
  if (shader.length === 0) {
    return '';
  }

  // HLSL type/function → GLSL equivalents
  let result = shader
    .replace(/\btex2D\b/g, 'texture2D')
    .replace(/\btex3D\b/g, 'texture3D')
    .replace(/\bfloat2\b/g, 'vec2')
    .replace(/\bfloat3\b/g, 'vec3')
    .replace(/\bfloat4\b/g, 'vec4')
    .replace(/\bfrac\b/g, 'fract')
    .replace(/\blerp\b/g, 'mix')
    .replace(/\batan2\b/g, 'atan')
    .replace(/\bhalf2\b/g, 'vec2')
    .replace(/\bhalf3\b/g, 'vec3')
    .replace(/\bhalf4\b/g, 'vec4')
    .replace(/\bhalf\b/g, 'float');

  // GLSL ES 3.0 has no implicit int→float promotion. Convert bare integer
  // literals to float in the shader body (after shader_body {).
  // The regex matches digits NOT preceded/followed by . or word chars
  // (avoids touching vec2, sampler_blur1, 0.5, #define, etc.)
  const bodyIdx = result.indexOf('shader_body');
  if (bodyIdx > -1) {
    const header = result.substring(0, bodyIdx);
    const body = result.substring(bodyIdx);
    const promotedBody = body.replace(/(?<![.\w])(\d+)(?!\.\d|\w)/g, '$1.0');
    result = header + promotedBody;
  }

  // Prepend MilkDrop built-in macros to the header (before shader_body).
  // butterchurn's getShaderParts() extracts header text and includes it
  // in the final fragment shader source.
  const sbIdx = result.indexOf('shader_body');
  if (sbIdx > -1) {
    result = result.substring(0, sbIdx) + PS2_HEADER_MACROS + '\n' + result.substring(sbIdx);
  } else {
    result = PS2_HEADER_MACROS + '\n' + result;
  }

  return result;
}

export async function convertPreset (text) {
  const mainPresetText = _.split(text, '[preset00]')[1];
  const presetParts = splitPreset(mainPresetText);

  const isPS2 = (presetParts.presetVersion || 0) < 3;

  const parsedPreset = milkdropParser.convert_preset_wave_and_shape(presetParts.presetVersion,
                                                                    presetParts.presetInit,
                                                                    presetParts.perFrame,
                                                                    presetParts.perVertex,
                                                                    presetParts.shapes,
                                                                    presetParts.waves);

  const convertFn = isPS2
    ? (s) => Promise.resolve(convertPS2Shader(s))
    : convertShader;

  const [presetMap, warpShader, compShader] = await Promise.all([
    createBasePresetFuns(parsedPreset,
                         presetParts.shapes,
                         presetParts.waves),
    convertFn(presetParts.warp),
    convertFn(presetParts.comp)
  ]);

  return _.assign({}, presetMap, {
    baseVals: presetParts.baseVals,
    warp: warpShader,
    comp: compShader,
    presetParts
  });
}

export function convertPresetEquations (presetVersion, initEQs, frameEQs, pixelEQs) {
  const parsedPreset = milkdropParser.convert_basic_preset(presetVersion, initEQs, frameEQs, pixelEQs);
  return {
    init_eqs_str: parsedPreset.perFrameInitEQs ? parsedPreset.perFrameInitEQs.trim() : '',
    frame_eqs_str: parsedPreset.perFrameEQs ? parsedPreset.perFrameEQs.trim() : '',
    pixel_eqs_str: parsedPreset.perPixelEQs ? parsedPreset.perPixelEQs.trim() : ''
  };
}

export function convertWaveEquations (presetVersion, initEQs, frameEQs, pointEQs) {
  const parsedPreset = milkdropParser.make_wave_map(presetVersion, {
    init_eqs_str: initEQs,
    frame_eqs_str: frameEQs,
    point_eqs_str: pointEQs
  });
  return {
    init_eqs_str: parsedPreset.perFrameInitEQs ? parsedPreset.perFrameInitEQs.trim() : '',
    frame_eqs_str: parsedPreset.perFrameEQs ? parsedPreset.perFrameEQs.trim() : '',
    point_eqs_str: parsedPreset.perPointEQs ? parsedPreset.perPointEQs.trim() : ''
  };
}

export function convertShapeEquations (presetVersion, initEQs, frameEQs) {
  const parsedPreset = milkdropParser.make_shape_map(presetVersion, {
    init_eqs_str: initEQs,
    frame_eqs_str: frameEQs
  });
  return {
    init_eqs_str: parsedPreset.perFrameInitEQs ? parsedPreset.perFrameInitEQs.trim() : '',
    frame_eqs_str: parsedPreset.perFrameEQs ? parsedPreset.perFrameEQs.trim() : ''
  };
}
