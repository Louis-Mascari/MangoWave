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
  '#define M_PI 3.14159265359',
  '#define M_PI_2 6.28318530718',
  '#define M_INV_PI_2 0.159154943091895',
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
  // Skip preprocessor lines (#if, #elif, etc.) — they require integer constants.
  const bodyIdx = result.indexOf('shader_body');
  if (bodyIdx > -1) {
    const header = result.substring(0, bodyIdx);
    const body = result.substring(bodyIdx);
    const promotedBody = body
      .split('\n')
      .map((line) =>
        /^\s*#/.test(line) ? line : line.replace(/(?<![.\w])(\d+)(?!\.\d|\w)/g, '$1.0'),
      )
      .join('\n');
    result = header + promotedBody;
  }

  // HLSL allows `float4 x = 0;` (implicit scalar broadcast), GLSL doesn't.
  // After type/int promotion, these become `vec4 x = 0.0;` — wrap in constructor.
  result = result.replace(
    /\b(vec[234])\s+(\w+)\s*=\s*(-?[\d.]+)\s*;/g,
    (m, type, name, val) => `${type} ${name} = ${type}(${val});`,
  );

  // Prepend MilkDrop built-in macros to the header (before shader_body).
  const sbIdx = result.indexOf('shader_body');
  if (sbIdx > -1) {
    result = result.substring(0, sbIdx) + MILKDROP_GLSL_MACROS + '\n' + result.substring(sbIdx);
  } else {
    result = MILKDROP_GLSL_MACROS + '\nshader_body\n{\n' + result + '\n}\n';
  }

  // Make uv mutable if the shader body assigns to it (GLSL ES 3.0 in varyings are read-only)
  const sbIdx2 = result.indexOf('shader_body');
  if (sbIdx2 > -1) {
    const braceIdx = result.indexOf('{', sbIdx2);
    if (braceIdx > -1) {
      // Find matching closing brace
      let depth = 0;
      let closeIdx = -1;
      for (let i = braceIdx; i < result.length; i++) {
        if (result[i] === '{') depth++;
        else if (result[i] === '}') {
          depth--;
          if (depth === 0) { closeIdx = i; break; }
        }
      }
      if (closeIdx > -1) {
        let bodyContent = result.substring(braceIdx + 1, closeIdx);
        bodyContent = makeUvMutable(bodyContent);
        result = result.substring(0, braceIdx + 1) + bodyContent + result.substring(closeIdx);
      }
    }
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

  // Expand math constants to literals (hlslparser can't handle #define)
  result = result.replace(/\bM_INV_PI_2\b/g, '0.159154943091895');
  result = result.replace(/\bM_PI_2\b/g, '6.28318530718');
  result = result.replace(/\bM_PI\b/g, '3.14159265359');

  // Expand custom simple-token #defines (e.g. `#define MyGet GetPixel`) before stripping.
  // Preset authors define aliases like `#define sampler_pic sampler_cells` that hlslparser
  // needs expanded since we're about to strip all #define lines.
  const knownMacros = new Set([
    'GetMain', 'GetPixel', 'GetBlur1', 'GetBlur2', 'GetBlur3', 'lum', 'saturate',
    'tex2D', 'tex3D', 'tex2d', 'tex3d', 'M_PI', 'M_PI_2', 'M_INV_PI_2',
  ]);
  const customDefRe = /^[ \t]*#define\s+(\w+)\s+(\w[^\n]*?)\s*$/gm;
  let cdm;
  while ((cdm = customDefRe.exec(result)) !== null) {
    const [, macroName, replacement] = cdm;
    if (knownMacros.has(macroName)) continue; // already handled above
    // Only expand simple token aliases (single word replacement, no parens)
    if (/^\w+$/.test(replacement)) {
      result = result.replace(new RegExp('\\b' + macroName + '\\b', 'g'), replacement);
    }
  }

  // Strip all #define lines (parser can't handle them)
  result = result.replace(/^[ \t]*#define\b[^\n]*$/gm, '');

  // Move global `const` array declarations inside the shader_body function.
  // hlslparser handles const arrays correctly when they're local (generates proper
  // `vec4[]( vec4(...), ... )` constructors) but generates broken flat initializers
  // when they're global (puts `samples[4] = vec4[](-1, 0, 0, ...)` in void main()).
  // MilkDrop presets sometimes declare `const float4 name[N] = { ... };` before
  // shader_body — moving them inside fixes the code generation.
  const constArrayRe = /^[ \t]*(const\s+\w+\s+\w+\s*\[\d+\]\s*=\s*\{[\s\S]*?\}\s*;)/gm;
  let cam;
  const constArrays = [];
  while ((cam = constArrayRe.exec(result)) !== null) {
    constArrays.push({ text: cam[1], index: cam.index, length: cam[0].length });
  }
  if (constArrays.length > 0) {
    // Find the opening brace of shader_body
    const sbMatch = result.match(/shader_body\s*\([^)]*\)\s*:\s*COLOR0\s*\{/);
    if (sbMatch) {
      const insertIdx = sbMatch.index + sbMatch[0].length;
      // Remove const arrays from their original position and insert after shader_body {
      let offset = 0;
      const inserts = [];
      for (const ca of constArrays) {
        result =
          result.substring(0, ca.index - offset) +
          result.substring(ca.index - offset + ca.length);
        inserts.push('\n    ' + ca.text);
        offset += ca.length;
      }
      const adjustedInsertIdx = insertIdx - offset;
      result =
        result.substring(0, adjustedInsertIdx) +
        inserts.join('') +
        result.substring(adjustedInsertIdx);
    }
  }

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

// Variable names declared by butterchurn's preamble (prepareShader output) and hlslparser
// boilerplate. These must NOT be re-declared when extracting preset-specific globals.
const PREAMBLE_VARS = new Set([
  'texsize_noise_lq', 'texsize_noise_mq', 'texsize_noise_hq', 'texsize_noise_lq_lite',
  'texsize_noisevol_lq', 'texsize_noisevol_hq',
  '_qa', '_qb', '_qc', '_qd', '_qe', '_qf', '_qg', '_qh',
  ...Array.from({ length: 32 }, (_, i) => 'q' + (i + 1)),
  'blur1_min', 'blur1_max', 'blur2_min', 'blur2_max', 'blur3_min', 'blur3_max',
  'scale1', 'scale2', 'scale3', 'bias1', 'bias2', 'bias3',
  'slow_roam_cos', 'roam_cos', 'slow_roam_sin', 'roam_sin',
  'hue_shader', 'time', 'rand_preset', 'rand_frame', 'progress', 'frame', 'fps', 'decay',
  'bass', 'mid', 'treb', 'vol', 'bass_att', 'mid_att', 'treb_att', 'vol_att',
  'texsize', 'aspect', 'rad', 'ang', 'uv_orig',
  // Samplers from butterchurn preamble
  'sampler_main', 'sampler_fw_main', 'sampler_pw_main', 'sampler_fc_main', 'sampler_pc_main',
  'sampler_noise_lq', 'sampler_noise_lq_lite', 'sampler_noise_mq', 'sampler_noise_hq',
  'sampler_noisevol_lq', 'sampler_noisevol_hq', 'sampler_pw_noise_lq',
  'sampler_blur1', 'sampler_blur2', 'sampler_blur3',
]);

/** Missing mult0 scalar↔vector overloads. hlslparser generates same-type pairs
 *  (float,float), (vec2,vec2), etc., but HLSL allows scalar*vector which hlslparser
 *  emits as mult0(float,vec3) etc. These delegate per-component to preserve NaN safety. */
const MULT_MIXED_OVERLOADS = `
vec2 mult0(float x, vec2 y) { return vec2(mult0(x, y.x), mult0(x, y.y)); }
vec2 mult0(vec2 x, float y) { return vec2(mult0(x.x, y), mult0(x.y, y)); }
vec3 mult0(float x, vec3 y) { return vec3(mult0(x, y.x), mult0(x, y.y), mult0(x, y.z)); }
vec3 mult0(vec3 x, float y) { return vec3(mult0(x.x, y), mult0(x.y, y), mult0(x.z, y)); }
vec4 mult0(float x, vec4 y) { return vec4(mult0(x, y.x), mult0(x, y.y), mult0(x, y.z), mult0(x, y.w)); }
vec4 mult0(vec4 x, float y) { return vec4(mult0(x.x, y), mult0(x.y, y), mult0(x.z, y), mult0(x.w, y)); }
`.trim();

/** If the shader body assigns to `uv`, create a mutable local copy.
 *  butterchurn declares `uv` as `in vec2` (read-only in GLSL ES 3.0).
 *  Presets that write to uv (panning, zooming, distortion) need a mutable copy. */
function makeUvMutable(body) {
  // Match uv assignments including hlslparser's parenthesized form: (uv).xy +=
  if (/\(uv\)\s*\.[xyzw]+\s*[+\-*\/]?=/.test(body) ||
      /\buv(\.[xyzw]+)?\s*[+\-*\/]?=/.test(body)) {
    body = body.replace(/\buv\b/g, '_mw_uv');
    body = '    vec2 _mw_uv = uv;\n' + body;
  }
  return body;
}

/** Structure hlslparser GLSL output for butterchurn.
 *  hlslparser outputs: helper functions + main_shader_sentinel function.
 *  butterchurn expects: header (helper functions) + shader_body { body statements }.
 *  processUnOptimizedShader wraps EVERYTHING in shader_body { }, which causes helpers
 *  and the function definition to be placed inside butterchurn's void main() — illegal GLSL.
 *  This function properly splits helpers into the header and extracts body statements. */
function structureHlslparserOutput(rawGlsl, shaderBodyName) {
  // Find the main function definition
  const funcPattern = new RegExp(
    'vec4\\s+' + shaderBodyName + '\\s*\\(vec2\\s+\\w+\\)\\s*\\{',
  );
  const funcMatch = rawGlsl.match(funcPattern);

  if (!funcMatch) {
    // Fallback to processUnOptimizedShader if we can't find the function
    return processUnOptimizedShader(rawGlsl);
  }

  const funcStart = funcMatch.index;
  const rawHeader = rawGlsl.substring(0, funcStart);

  // Extract only helper function definitions from the header.
  // prepareShader adds uniforms, variable declarations, #defines that butterchurn's
  // preamble already provides — we must strip all of those. Only helper functions
  // generated by hlslparser (e.g. mult0, matrix_row0) should survive.
  // Function pattern: `type name(params) { body }`
  const funcDefRe = /(?:void|float|vec[234]|mat[234]|int|bool)\s+\w+\s*\([^)]*\)\s*\{/g;
  let header = '';
  let match;
  while ((match = funcDefRe.exec(rawHeader)) !== null) {
    // Find matching closing brace
    let depth = 0;
    let end = -1;
    for (let j = match.index + match[0].length - 1; j < funcStart; j++) {
      if (rawHeader[j] === '{') depth++;
      else if (rawHeader[j] === '}') {
        depth--;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end > -1) {
      header += rawHeader.substring(match.index, end) + '\n';
    }
  }
  header = header.trim();

  // Fix hlslparser return type mismatches: scalar swizzle helpers declare vec2/vec3/vec4
  // return types but return ivec/uvec variants for int/uint overloads.
  header = header
    .replace(/\b[iu]vec2\(/g, 'vec2(')
    .replace(/\b[iu]vec3\(/g, 'vec3(')
    .replace(/\b[iu]vec4\(/g, 'vec4(');

  // Add missing mult0 scalar↔vector overloads if mult0 was generated
  if (/\bfloat\s+mult0\s*\(/.test(header)) {
    header += '\n' + MULT_MIXED_OVERLOADS;
  }

  // Extract preset-specific global variable declarations from the header.
  // Presets declare variables outside shader_body (e.g. `float2 rs; float3 noise;`) which
  // prepareShader keeps as globals. hlslparser outputs them as globals before the main
  // function. We must preserve these as locals inside shader_body.
  // Sampler declarations go in the header (GLSL requires uniform samplers; butterchurn
  // scans the header to bind them).
  // Matches: `float x;`, `vec4 samples[4];`, `float dx, dy;`, `uniform sampler2D tex;`
  const varDeclRe =
    /^(?:(?:(?:uniform\s+)?sampler\w*|float|vec[234]|mat[234](?:x[234])?|int|bool)\s+[\w][\w\s,[\]]*);/gm;
  let presetLocals = '';
  let presetSamplers = '';
  let varMatch;
  while ((varMatch = varDeclRe.exec(rawHeader)) !== null) {
    const line = varMatch[0];
    // Skip uniform/in/out declarations (butterchurn provides these)
    if (/^\s*(?:uniform|in|out)\s/.test(line)) continue;
    // Check if ALL declared names on this line are butterchurn preamble vars
    const namesPart = line.replace(/^[^;]*?\s+/, '').replace(/;$/, '');
    const names = namesPart.split(',').map((n) => n.trim().replace(/\[.*\]$/, ''));
    const allPreamble = names.every((n) => PREAMBLE_VARS.has(n));
    if (allPreamble) continue;

    // Sampler declarations → header with uniform prefix (butterchurn scans for these)
    if (/sampler\w*/.test(line)) {
      const uniformLine = line.startsWith('uniform') ? line : 'uniform ' + line;
      presetSamplers += uniformLine + '\n';
    } else {
      presetLocals += '    ' + line + '\n';
    }
  }

  if (presetSamplers) {
    header = (header ? header + '\n' : '') + presetSamplers.trim();
  }

  // Find matching closing brace for the function
  let braceDepth = 0;
  let bodyStart = -1;
  let bodyEnd = -1;
  for (let i = funcStart + funcMatch[0].length - 1; i < rawGlsl.length; i++) {
    if (rawGlsl[i] === '{') {
      if (braceDepth === 0) bodyStart = i + 1;
      braceDepth++;
    } else if (rawGlsl[i] === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        bodyEnd = i;
        break;
      }
    }
  }

  if (bodyStart === -1 || bodyEnd === -1) {
    return processUnOptimizedShader(rawGlsl);
  }

  let body = rawGlsl.substring(bodyStart, bodyEnd).trim();

  // Strip hlslparser's own "vec3 ret;" declaration — butterchurn's template provides it
  body = body.replace(/^\s*vec3\s+ret\s*;\s*/m, '');
  // Strip "return vec4(ret, ...);" — butterchurn's template provides fragColor assignment.
  // hlslparser may wrap in parens or add type casts, so match broadly.
  body = body.replace(/\s*return\s+vec4\s*\([^;]*\)\s*;\s*/g, '');

  // Fix flat array initializers: hlslparser may output `vec4[]( val, val, val, ... )` without
  // per-element constructors when the HLSL used flat brace init `{ -1, 0, 0, 0.25, ... }`.
  // GLSL ES 3.0 requires one expression per array element: `vec4[]( vec4(...), vec4(...) )`.
  body = body.replace(
    /\b(vec[234])\[(\d+)\]\s*=\s*\1\[\]\(\s*([^;]+)\)\s*;/g,
    (match, type, count, args) => {
      // Check if constructors are already present (e.g. vec4((...), ...))
      if (new RegExp('\\b' + type + '\\s*\\(').test(args)) return match;
      // Parse flat values and group into per-element constructors
      const n = parseInt(count, 10);
      const dim = parseInt(type[3], 10); // vec2=2, vec3=3, vec4=4
      // Split args respecting nested parens
      const values = [];
      let depth = 0;
      let start = 0;
      for (let i = 0; i <= args.length; i++) {
        if (i === args.length || (args[i] === ',' && depth === 0)) {
          const val = args.substring(start, i).trim();
          if (val) values.push(val);
          start = i + 1;
        } else if (args[i] === '(') depth++;
        else if (args[i] === ')') depth--;
      }
      if (values.length !== n * dim) return match; // unexpected count, don't modify
      const elements = [];
      for (let i = 0; i < n; i++) {
        elements.push(type + '(' + values.slice(i * dim, (i + 1) * dim).join(', ') + ')');
      }
      return type + '[' + count + '] = ' + type + '[]( ' + elements.join(', ') + ' );';
    },
  );

  // Prepend preset-specific local variable declarations, skipping any that are
  // already declared inside the function body (hlslparser may emit both a global
  // declaration and a local one — prepending both causes GLSL redefinition errors).
  if (presetLocals) {
    const bodyDeclaredNames = new Set();
    const bodyDeclRe =
      /\b(?:float|vec[234]|mat[234](?:x[234])?|int|bool)\s+(\w+)/g;
    let bdm;
    while ((bdm = bodyDeclRe.exec(body)) !== null) {
      bodyDeclaredNames.add(bdm[1]);
    }
    if (bodyDeclaredNames.size > 0) {
      // For variables in BOTH presetLocals and the body: keep the presetLocals
      // declaration (appears first) and strip the body's redeclaration.
      // hlslparser may emit `vec3 ret1 = vec3( ret1 );` at the end of a scope
      // while the variable was already used above (from the global).
      const presetLocalNames = new Set();
      const plNameRe = /(?:float|vec[234]|mat[234](?:x[234])?|int|bool)\s+([\w][\w\s,]*);/g;
      let plm;
      while ((plm = plNameRe.exec(presetLocals)) !== null) {
        for (const n of plm[1].split(',')) {
          const name = n.trim();
          if (name && !PREAMBLE_VARS.has(name)) presetLocalNames.add(name);
        }
      }
      const overlap = [...presetLocalNames].filter((n) => bodyDeclaredNames.has(n));
      for (const name of overlap) {
        // Strip body redeclaration: `type name = expr;` or `type name;`
        // Use a regex that matches the type + name + optional initializer + semicolon
        const stripRe = new RegExp(
          '\\b(?:float|vec[234]|mat[234](?:x[234])?|int|bool)\\s+' + name + '\\b[^;]*;',
          'g',
        );
        body = body.replace(stripRe, '');
      }
    }
    if (presetLocals.trim()) {
      body = presetLocals + body;
    }
  }

  // Make uv mutable if the shader body assigns to it
  body = makeUvMutable(body);

  return (header ? header + '\n' : '') + ' shader_body {\n' + body + '\n}';
}

/** Fix shader bodies that assign to butterchurn uniforms.
 *  prepareShader declares rand_preset/rand_frame as regular HLSL variables, so
 *  MilkDrop presets can assign to them. But butterchurn's GLSL preamble declares
 *  them as `uniform vec4`, making them immutable. Fix: replace assignments with
 *  a local variable, initialized from the uniform. */
function fixUniformAssignments(shaderBody) {
  const uniformsToFix = [
    { name: 'rand_preset', type: 'vec4' },
    { name: 'rand_frame', type: 'vec4' },
    { name: 'hue_shader', type: 'vec3' },
  ];

  let result = shaderBody;
  for (const { name, type } of uniformsToFix) {
    const assignPattern = new RegExp('\\b' + name + '(\\.[xyzw]+)?\\s*[+\\-*/]?=');
    if (!assignPattern.test(result)) continue;

    const localName = '_mw_' + name;
    const nameRe = new RegExp('\\b' + name + '\\b', 'g');
    result = result.replace(nameRe, localName);

    // Insert local declaration after opening brace of shader_body
    const bodyIdx = result.indexOf('shader_body');
    if (bodyIdx > -1) {
      const braceIdx = result.indexOf('{', bodyIdx);
      if (braceIdx > -1) {
        const decl = '\n    ' + type + ' ' + localName + ' = ' + name + ';';
        result =
          result.substring(0, braceIdx + 1) + decl + result.substring(braceIdx + 1);
      }
    }
  }

  // butterchurn's preamble maps q1-q32 to packed vec4 uniforms via #define
  // (e.g. `#define q25 _qg.x`). If the shader body assigns to any q-variable,
  // it expands to an illegal uniform write. Fix: create mutable float locals.
  const bodyIdx = result.indexOf('shader_body');
  if (bodyIdx > -1) {
    const braceIdx = result.indexOf('{', bodyIdx);
    if (braceIdx > -1) {
      const bodyContent = result.substring(braceIdx + 1);
      const qAssigned = new Set();
      const qAssignRe = /\b(q\d{1,2})\s*[+\-*/]?=/g;
      let qm;
      while ((qm = qAssignRe.exec(bodyContent)) !== null) {
        const num = parseInt(qm[1].substring(1), 10);
        if (num >= 1 && num <= 32) qAssigned.add(qm[1]);
      }
      if (qAssigned.size > 0) {
        // Also find q-vars that are read (so we don't miss renaming reads)
        const decls = [];
        for (const qName of qAssigned) {
          const localName = '_mw_' + qName;
          const nameRe = new RegExp('\\b' + qName + '\\b', 'g');
          result = result.replace(nameRe, localName);
          decls.push('    float ' + localName + ' = ' + qName + ';');
        }
        // Re-find brace position (may have shifted from prior uniform fixes)
        const bodyIdx2 = result.indexOf('shader_body');
        const braceIdx2 = result.indexOf('{', bodyIdx2);
        result =
          result.substring(0, braceIdx2 + 1) +
          '\n' + decls.join('\n') +
          result.substring(braceIdx2 + 1);
      }
    }
  }

  return result;
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
    return fixUniformAssignments(structureHlslparserOutput(rawGlsl, shaderBodyName));
  }

  // Fallback: text-level HLSL→GLSL conversion
  console.warn('[convertShader] hlslparser-wasm failed, using text-level fallback');
  return fixUniformAssignments(convertShaderTextLevel(shader));
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
