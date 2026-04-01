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

/** Convert PS2 shader via text-level HLSL→GLSL replacements.
 *  PS2 MilkDrop shaders are pseudo-GLSL that butterchurn embeds directly in its
 *  fragment shader template. They only need type/function name replacements —
 *  NOT full HLSL parsing (hlslparser-wasm can't parse PS2 syntax). */
function convertPS2Shader (shader) {
  if (shader.length === 0) {
    return '';
  }

  return shader
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
