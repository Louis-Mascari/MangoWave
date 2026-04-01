import _ from 'lodash';
import {
  splitPreset,
  prepareShader,
  processUnOptimizedShader,
  createBasePresetFuns,
} from 'milkdrop-preset-utils';
import milkdropParser from 'milkdrop-eel-parser';
import { convertHLSLShader } from 'hlslparser-wasm';

// MilkDrop built-in macros for the text-level fallback converter.
// butterchurn's shader template does NOT define GetPixel/GetMain/GetBlur/saturate —
// they must appear in the shader header (before shader_body) so GLSL #define expands them.
const MILKDROP_GLSL_MACROS = [
  '#define GetPixel(uv) (texture(sampler_main, uv).xyz)',
  '#define GetMain(uv) (texture(sampler_main, uv).xyz)',
  '#define GetBlur1(uv) (texture(sampler_blur1, uv).xyz * scale1 + bias1)',
  '#define GetBlur2(uv) (texture(sampler_blur2, uv).xyz * scale2 + bias2)',
  '#define GetBlur3(uv) (texture(sampler_blur3, uv).xyz * scale3 + bias3)',
  '#define lum(x) dot(x, vec3(0.32, 0.49, 0.29))',
  '#define saturate(x) clamp(x, 0.0, 1.0)',
].join('\n');

/** Expand HLSL mul(a, b) → GLSL ((a) * (b)). Handles nested parens in args. */
function expandHlslMul(text) {
  const pattern = /\bmul\s*\(/;
  let result = text;
  let safety = 0;
  let match;
  while ((match = pattern.exec(result)) !== null && safety++ < 500) {
    const start = match.index;
    const argStart = start + match[0].length;
    // Find the comma separating args (respecting nesting)
    let depth = 1;
    let i = argStart;
    let commaIdx = -1;
    while (i < result.length && depth > 0) {
      if (result[i] === '(') depth++;
      else if (result[i] === ')') {
        depth--;
        if (depth === 0) break;
      } else if (result[i] === ',' && depth === 1 && commaIdx === -1) {
        commaIdx = i;
      }
      i++;
    }
    if (depth !== 0 || commaIdx === -1) break;
    const arg1 = result.substring(argStart, commaIdx).trim();
    const arg2 = result.substring(commaIdx + 1, i).trim();
    const expanded = '((' + arg1 + ') * (' + arg2 + '))';
    result = result.substring(0, start) + expanded + result.substring(i + 1);
  }
  return result;
}

/** Text-level HLSL→GLSL fallback for shaders hlslparser-wasm can't parse.
 *  Handles PS2 MilkDrop shaders via regex replacements — types, intrinsics,
 *  int→float promotion (GLSL ES 3.0), and MilkDrop built-in macros. */
function convertShaderTextLevel(shader) {
  if (shader.length === 0) {
    return '';
  }

  // HLSL type/function → GLSL ES 3.0 equivalents
  // NOTE: texture2D/texture3D are GLSL ES 1.0; ES 3.0 uses unified `texture`
  let result = shader
    .replace(/\btex2D\b/g, 'texture')
    .replace(/\btex3D\b/g, 'texture')
    .replace(/\bfloat2\b/g, 'vec2')
    .replace(/\bfloat3\b/g, 'vec3')
    .replace(/\bfloat4\b/g, 'vec4')
    .replace(/\bhalf2\b/g, 'vec2')
    .replace(/\bhalf3\b/g, 'vec3')
    .replace(/\bhalf4\b/g, 'vec4')
    .replace(/\bhalf\b/g, 'float')
    .replace(/\bfrac\b/g, 'fract')
    .replace(/\blerp\b/g, 'mix')
    .replace(/\brsqrt\b/g, 'inversesqrt')
    .replace(/\bddx\b/g, 'dFdx')
    .replace(/\bddy\b/g, 'dFdy')
    .replace(/\batan2\b/g, 'atan')
    .replace(/\bfmod\b/g, 'mod');

  // HLSL mul(a, b) → GLSL ((a) * (b))
  result = expandHlslMul(result);

  // GLSL ES 3.0 has no implicit int→float promotion. Convert bare integer
  // literals in the shader body to float (avoids touching sampler_blur1, vec2, etc.)
  const bodyIdx = result.indexOf('shader_body');
  if (bodyIdx > -1) {
    const header = result.substring(0, bodyIdx);
    const body = result.substring(bodyIdx);
    const promotedBody = body.replace(/(?<![.\w])(\d+)(?!\.\d|\w)/g, '$1.0');
    result = header + promotedBody;
  }

  // Prepend MilkDrop built-in macros to the header (before shader_body).
  const sbIdx = result.indexOf('shader_body');
  if (sbIdx > -1) {
    result = result.substring(0, sbIdx) + MILKDROP_GLSL_MACROS + '\n' + result.substring(sbIdx);
  } else {
    result = MILKDROP_GLSL_MACROS + '\nshader_body\n{\n' + result + '\n}\n';
  }

  return result;
}

/** Expand a single-argument function-like macro in HLSL source.
 *  Handles nested parentheses in the argument (e.g., GetBlur1(uv + float2(0.1, 0.2))). */
function expandFunctionMacro(text, name, template) {
  const pattern = new RegExp('\\b' + name + '\\s*\\(');
  let result = text;
  let safety = 0;
  let match;
  while ((match = pattern.exec(result)) !== null && safety++ < 500) {
    const start = match.index;
    const argStart = start + match[0].length;
    let depth = 1;
    let i = argStart;
    while (i < result.length && depth > 0) {
      if (result[i] === '(') depth++;
      else if (result[i] === ')') depth--;
      i++;
    }
    if (depth !== 0) break;
    const arg = result.substring(argStart, i - 1);
    const expanded = template.replace(/\$1/g, arg);
    result = result.substring(0, start) + expanded + result.substring(i);
  }
  return result;
}

/** Expand all prepareShader #define macros in-place, then strip #define lines.
 *  hlslparser-wasm's WASM build has a broken preprocessor — any #define causes
 *  parse failure. Expanding macros before parsing lets the HLSL parser handle
 *  type coercions (float4→float2 truncation, etc.) correctly. */
function expandPrepareShaderMacros(hlsl) {
  let result = hlsl;

  // Simple token aliases
  result = result.replace(/\btex2d\b/g, 'tex2D');
  result = result.replace(/\btex3d\b/g, 'tex3D');

  // Function-like macros (matches prepareShader's definitions exactly)
  result = expandFunctionMacro(result, 'GetMain', '(tex2D(sampler_main,$1).xyz)');
  result = expandFunctionMacro(result, 'GetPixel', '(tex2D(sampler_main,$1).xyz)');
  result = expandFunctionMacro(result, 'GetBlur1', '(tex2D(sampler_blur1,$1).xyz*scale1 + bias1)');
  result = expandFunctionMacro(result, 'GetBlur2', '(tex2D(sampler_blur2,$1).xyz*scale2 + bias2)');
  result = expandFunctionMacro(result, 'GetBlur3', '(tex2D(sampler_blur3,$1).xyz*scale3 + bias3)');
  result = expandFunctionMacro(result, 'lum', '(dot($1,float3(0.32,0.49,0.29)))');

  // Strip all #define lines (parser can't handle them)
  result = result.replace(/^[ \t]*#define\b[^\n]*$/gm, '');

  return result;
}

/** Try hlslparser-wasm, return GLSL string or null on failure. */
async function tryHlslParser(hlsl, entryName) {
  let result;
  try {
    result = await convertHLSLShader(hlsl, entryName, 'fs');
  } catch (_) {
    return null;
  }
  if (result === 'parsing failed' || result === 'code generation failed') {
    return null;
  }
  return result;
}

/** Fix variable names that use `*` as a naming character (MilkDrop convention).
 *  Some preset authors used patterns like `v2*r`, `p1*z`, `ring1*x`, `q5*_residual`
 *  as variable names. NSEEL treats `*` as multiplication, but the preset worked because
 *  of NSEEL's lax evaluation. We detect these by finding `word*word` on the LHS of `=`
 *  (assignment context), then replace all occurrences with `word_word`. */
function fixStarVariableNames(str) {
  if (typeof str !== 'string') return str;

  // Pass 1: collect all word*word patterns that appear before = (LHS of assignment)
  const varNames = new Set();
  const lhsRe = /\b([a-zA-Z_]\w*\*[a-zA-Z_]\w*)\s*=/g;
  let m;
  while ((m = lhsRe.exec(str)) !== null) {
    varNames.add(m[1]);
  }

  if (varNames.size === 0) return str;

  // Pass 2: replace all occurrences of each star-variable with underscore version
  for (const varName of varNames) {
    const escaped = varName.replace(/\*/g, '\\*');
    const re = new RegExp('\\b' + escaped + '\\b', 'g');
    str = str.replace(re, varName.replace(/\*/g, '_'));
  }

  return str;
}

/** Insert implicit multiplication operators that MilkDrop's NSEEL tolerates
 *  but milkdrop-eel-parser requires explicitly:
 *  - `)(`           → `)*(`     (close-paren before open-paren)
 *  - `5equal(`      → `5*equal(`  (digit before identifier)
 *  - `xdriftincequal(` → `xdriftinc*equal(` (identifier before known function) */
function insertImplicitOps(str) {
  if (typeof str !== 'string') return str;

  // 1. ) immediately before ( — implicit multiplication
  str = str.replace(/\)\s*\(/g, ')*(');

  // 2. Standalone number literal immediately before a letter — e.g. 5equal → 5*equal
  //    Negative lookbehind ensures we don't split variable names like ring1x, tp2y, k0x
  //    Must match the whole number (including decimals) to avoid splitting 0.000024equal
  str = str.replace(/(?<!\w)(\d+\.?\d*)\s*(?=[a-zA-Z_])/g, '$1*');

  // 3. Identifier char before a known EEL built-in function followed by (
  //    e.g. xdriftincequal( → xdriftinc*equal(, burstequal( → burst*equal(
  //    Uses a callback to avoid splitting compound builtins (asin, acos, invsqrt, etc.)
  const builtinList = [
    'equal',
    'above',
    'below',
    'if',
    'min',
    'max',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'atan2',
    'sqr',
    'sqrt',
    'pow',
    'exp',
    'log',
    'log10',
    'abs',
    'sign',
    'floor',
    'ceil',
    'int',
    'rand',
    'band',
    'bor',
    'bnot',
    'sigmoid',
    'invsqrt',
    'noise',
    'assign',
    'exec2',
    'exec3',
    'megabuf',
    'gmegabuf',
  ];
  const builtinSet = new Set(builtinList);
  const builtinAlt = builtinList.join('|');
  const fnRe = new RegExp('([a-zA-Z0-9_])(' + builtinAlt + ')\\(', 'g');
  str = str.replace(fnRe, (match, pre, fn, offset, full) => {
    // Walk back to find the full identifier preceding the matched builtin
    let start = offset;
    while (start > 0 && /[a-zA-Z0-9_]/.test(full[start - 1])) start--;
    const fullIdent = full.substring(start, offset + 1 + fn.length);
    if (builtinSet.has(fullIdent)) return match; // don't split known builtins
    return pre + '*' + fn + '(';
  });

  return str;
}

/** Strip unary + before identifiers/parens in EEL equation strings.
 *  The milkdrop-eel-parser can't handle unary + (e.g., sin(+atan2(...))).
 *  Unary + is a no-op, so removing it is always safe.
 *  No `m` flag — EEL uses ; as statement separator, not newlines.
 *  With `m`, ^+expr on a continuation line after ) is misidentified as unary. */
function stripUnaryPlus(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/(^|[=,;(+\-*/])\s*\+(?=\s*[a-zA-Z_(])/g, '$1');
}

/** Preprocess a single EEL string — fix star-vars, implicit ops, strip unary +. */
function preprocessEel(str) {
  if (typeof str !== 'string') return str;
  return stripUnaryPlus(insertImplicitOps(fixStarVariableNames(str)));
}

/** Recursively preprocess all EEL string values in an object/array. */
function deepPreprocessEel(val) {
  if (typeof val === 'string') return preprocessEel(val);
  if (Array.isArray(val)) return val.map(deepPreprocessEel);
  if (val && typeof val === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = deepPreprocessEel(v);
    }
    return result;
  }
  return val;
}

/** Fix missing semicolons in milkdrop-eel-parser JS output.
 *  The parser doesn't emit semicolons after non-assignment expression statements
 *  (e.g., bare `ob_bob_b+ob_b*sin(...)` with no `=`). This produces invalid JS
 *  like `...(a['time']*1.73))))) a['ob_g']=...` when the next statement follows.
 *  Fix: insert `;` where `)` is followed by `a[` (start of next statement). */
function fixParserOutput(jsCode) {
  if (typeof jsCode !== 'string' || jsCode.length === 0) return jsCode;
  return jsCode.replace(/\)\s+a\[/g, ');\na[');
}

/** Recursively fix parser output in all string values of an object/array. */
function deepFixParserOutput(val) {
  if (typeof val === 'string') return fixParserOutput(val);
  if (Array.isArray(val)) return val.map(deepFixParserOutput);
  if (val && typeof val === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = deepFixParserOutput(v);
    }
    return result;
  }
  return val;
}

/** Convert HLSL shader to GLSL ES 3.0.
 *  Primary: hlslparser-wasm with manual macro expansion (handles type coercions,
 *  implicit float4→float2 truncation, etc.). Fallback: text-level regex conversion
 *  for any shaders the parser still can't handle. */
export async function convertShader(shader) {
  if (shader.length === 0) {
    return '';
  }

  const shaderBodyName = 'main_shader_sentinel';
  let fullShader = prepareShader(shader);
  fullShader = fullShader.replace('float4 shader_body (', `float4 ${shaderBodyName} (`);

  // Expand macros (hlslparser-wasm's preprocessor is broken in the WASM build)
  const expanded = expandPrepareShaderMacros(fullShader);

  // Try hlslparser-wasm (handles type coercions, complex expressions)
  let rawGlsl = await tryHlslParser(expanded, shaderBodyName);

  if (!rawGlsl) {
    // Retry with C/C++ comments stripped
    const noComments = expanded.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    rawGlsl = await tryHlslParser(noComments, shaderBodyName);
  }

  if (rawGlsl) {
    return processUnOptimizedShader(rawGlsl);
  }

  // Fallback: text-level HLSL→GLSL conversion
  console.warn('[convertShader] hlslparser-wasm failed, using text-level fallback');
  return convertShaderTextLevel(shader);
}

export async function convertPreset(text) {
  const mainPresetText = _.split(text, '[preset00]')[1];
  const presetParts = splitPreset(mainPresetText);

  // Preprocess EEL equations: insert implicit operators + strip unary +
  const rawParsed = milkdropParser.convert_preset_wave_and_shape(
    presetParts.presetVersion,
    preprocessEel(presetParts.presetInit),
    preprocessEel(presetParts.perFrame),
    preprocessEel(presetParts.perVertex),
    deepPreprocessEel(presetParts.shapes),
    deepPreprocessEel(presetParts.waves),
  );

  // Fix missing semicolons in parser JS output (bare expression statements)
  const parsedPreset = deepFixParserOutput(rawParsed);

  const [presetMap, warpShader, compShader] = await Promise.all([
    createBasePresetFuns(parsedPreset, presetParts.shapes, presetParts.waves),
    convertShader(presetParts.warp),
    convertShader(presetParts.comp),
  ]);

  return _.assign({}, presetMap, {
    baseVals: presetParts.baseVals,
    warp: warpShader,
    comp: compShader,
    presetParts,
  });
}

export function convertPresetEquations(presetVersion, initEQs, frameEQs, pixelEQs) {
  const parsedPreset = milkdropParser.convert_basic_preset(
    presetVersion,
    initEQs,
    frameEQs,
    pixelEQs,
  );
  return {
    init_eqs_str: fixParserOutput(parsedPreset.perFrameInitEQs?.trim() ?? ''),
    frame_eqs_str: fixParserOutput(parsedPreset.perFrameEQs?.trim() ?? ''),
    pixel_eqs_str: fixParserOutput(parsedPreset.perPixelEQs?.trim() ?? ''),
  };
}

export function convertWaveEquations(presetVersion, initEQs, frameEQs, pointEQs) {
  const parsedPreset = milkdropParser.make_wave_map(presetVersion, {
    init_eqs_str: initEQs,
    frame_eqs_str: frameEQs,
    point_eqs_str: pointEQs,
  });
  return {
    init_eqs_str: fixParserOutput(parsedPreset.perFrameInitEQs?.trim() ?? ''),
    frame_eqs_str: fixParserOutput(parsedPreset.perFrameEQs?.trim() ?? ''),
    point_eqs_str: fixParserOutput(parsedPreset.perPointEQs?.trim() ?? ''),
  };
}

export function convertShapeEquations(presetVersion, initEQs, frameEQs) {
  const parsedPreset = milkdropParser.make_shape_map(presetVersion, {
    init_eqs_str: initEQs,
    frame_eqs_str: frameEQs,
  });
  return {
    init_eqs_str: fixParserOutput(parsedPreset.perFrameInitEQs?.trim() ?? ''),
    frame_eqs_str: fixParserOutput(parsedPreset.perFrameEQs?.trim() ?? ''),
  };
}
