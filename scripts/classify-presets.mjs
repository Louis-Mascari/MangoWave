#!/usr/bin/env node

/**
 * Classify all MangoWave presets into 5 thematic packs:
 *   Ambient, Reactive, Psychedelic, Ethereal
 *
 * Loads butterchurn presets (5 packs, pre-compiled JS) and MilkDrop-Original
 * presets (converted JSON with _eelFormat). Scores each preset on 5 dimensions
 * and assigns to the highest-scoring category with priority tiebreakers.
 *
 * Usage:
 *   node scripts/classify-presets.mjs                    # Output stats + JSON
 *   node scripts/classify-presets.mjs --update           # Also regenerate TS mapping
 */

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Load butterchurn presets via vm (CJS/UMD bundles) ──────────────────────

import { createContext, runInContext } from 'vm';

function loadButterchurnPack(filename) {
  const code = readFileSync(
    resolve(__dirname, '..', 'packages/butterchurn-presets/lib', filename),
    'utf8',
  );
  const exports = {};
  const module = { exports };
  const sandbox = createContext({ module, exports, require, self: {}, define: undefined });
  runInContext(code, sandbox);
  const result = sandbox.module.exports;
  return typeof result === 'function' && typeof result.getPresets === 'function'
    ? result.getPresets()
    : typeof result.getPresets === 'function'
      ? result.getPresets()
      : result;
}

const BUTTERCHURN_PACKS = [
  'butterchurnPresetsMinimal.min.js',
  'butterchurnPresetsNonMinimal.min.js',
  'butterchurnPresetsExtra.min.js',
  'butterchurnPresetsExtra2.min.js',
  'butterchurnPresetsMD1.min.js',
];

// ── Load all presets ───────────────────────────────────────────────────────

const allPresets = {};

for (const file of BUTTERCHURN_PACKS) {
  const pack = loadButterchurnPack(file);
  for (const [name, preset] of Object.entries(pack)) {
    allPresets[name] = preset;
  }
}

// Load MilkDrop-Original presets
const milkdropPath = resolve(__dirname, '..', 'packages/milkdrop-presets/lib/presets.json');
const milkdropPresets = JSON.parse(readFileSync(milkdropPath, 'utf8'));
const milkdropNames = new Set();
for (const [name, preset] of Object.entries(milkdropPresets)) {
  if (!allPresets[name]) {
    allPresets[name] = preset;
    milkdropNames.add(name);
  }
}

console.log(
  `Loaded ${Object.keys(allPresets).length} presets (${milkdropNames.size} MilkDrop-Original)`,
);

// ── Classification scoring ─────────────────────────────────────────────────

/**
 * Audio-reactive variable patterns.
 * Butterchurn JS form: a.bass, a.mid, a.treb, a.bass_att, etc.
 * EEL form: bass, mid, treb, bass_att, mid_att, treb_att, vol
 */
const AUDIO_VARS_JS = /\ba\.(bass|mid|treb|bass_att|mid_att|treb_att|vol)\b/g;
const AUDIO_VARS_EEL = /\b(bass|mid|treb|bass_att|mid_att|treb_att|vol)\b/g;

/** Shader complexity signals */
const BLUR_NOISE_PATTERN = /GetBlur|noise_|tex2D.*blur|sampler_blur|sampler_noise/gi;
const SOLARIZE_INVERT = /solarize|invert|darken|brighten|gamma/gi;

function getAllEquationText(preset) {
  const parts = [];
  if (preset.init_eqs_str) parts.push(preset.init_eqs_str);
  if (preset.frame_eqs_str) parts.push(preset.frame_eqs_str);
  if (preset.pixel_eqs_str) parts.push(preset.pixel_eqs_str);

  // Shape and wave equations
  if (preset.shapes) {
    for (const shape of Object.values(preset.shapes)) {
      if (shape.init_eqs_str) parts.push(shape.init_eqs_str);
      if (shape.frame_eqs_str) parts.push(shape.frame_eqs_str);
    }
  }
  if (preset.waves) {
    for (const wave of Object.values(preset.waves)) {
      if (wave.init_eqs_str) parts.push(wave.init_eqs_str);
      if (wave.frame_eqs_str) parts.push(wave.frame_eqs_str);
      if (wave.point_eqs_str) parts.push(wave.point_eqs_str);
    }
  }
  return parts.join('\n');
}

function getShaderText(preset) {
  return (preset.warp || '') + '\n' + (preset.comp || '');
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function scorePreset(preset) {
  const eqs = getAllEquationText(preset);
  const shaders = getShaderText(preset);
  const allText = eqs + '\n' + shaders;
  const isEel = !!preset._eelFormat;
  const bv = preset.baseVals || {};

  // 1. Audio reactivity — count audio variable references normalized by equation length
  const audioPattern = isEel ? AUDIO_VARS_EEL : AUDIO_VARS_JS;
  const audioHitsEq = countMatches(eqs, audioPattern);
  const audioHitsShader = countMatches(shaders, AUDIO_VARS_EEL);
  const audioHits = audioHitsEq + audioHitsShader;
  const eqLen = Math.max(eqs.length, 1);
  // Density-based score: audio refs per 100 chars of equation text + absolute count bonus
  const audioScore = (audioHitsEq / eqLen) * 200 + Math.min(audioHits / 8, 2.5);

  // 2. Waveform prominence — only classify as Waveform when visualization IS the wave
  let waveScore = 0;
  const waveA = bv.wave_a ?? 0;
  const mvA = bv.mv_a ?? 0;

  // Motion vectors are a strong waveform/spectrum signal
  if (mvA > 0) waveScore += 3.0;

  // High built-in wave alpha means the wave is visually prominent
  if (waveA > 0.8) waveScore += 1.0;
  if (waveA > 1.5) waveScore += 0.5;

  // Custom waves: only count if they have substantial point equations AND high alpha.
  // Most presets have custom waves as decorative elements — not enough to classify as Waveform.
  if (preset.waves) {
    let prominentWaves = 0;
    for (const wave of Object.values(preset.waves)) {
      const wa = wave.baseVals?.a ?? wave.a ?? 0;
      const hasSubstantialEqs = wave.point_eqs_str && wave.point_eqs_str.length > 80;
      if (wa > 0.5 && hasSubstantialEqs) prominentWaves++;
    }
    // Only boost if multiple prominent custom waves (suggests wave-focused preset)
    if (prominentWaves >= 2) waveScore += 1.5;
    else if (prominentWaves === 1 && waveA > 0.5) waveScore += 0.5;
  }

  // 3. Shader/psychedelic complexity — complex shaders + warping + visual effects
  let psychScore = 0;
  const warpVal = Math.abs(bv.warp ?? 0);
  if (warpVal > 0.5) psychScore += 0.8;
  if (warpVal > 2.0) psychScore += 1.0;

  const shaderLen = shaders.length;
  if (shaderLen > 2000) psychScore += 1.0;
  if (shaderLen > 4000) psychScore += 1.5;

  const blurNoise = countMatches(shaders, BLUR_NOISE_PATTERN);
  psychScore += Math.min(blurNoise * 0.4, 1.5);

  const solarize = countMatches(shaders, SOLARIZE_INVERT);
  psychScore += Math.min(solarize * 0.4, 1.0);

  // Motion intensity boosts psychedelic
  const zoom = Math.abs((bv.zoom ?? 1.0) - 1.0);
  const rot = Math.abs(bv.rot ?? 0);
  const sx = Math.abs((bv.sx ?? 1.0) - 1.0);
  const sy = Math.abs((bv.sy ?? 1.0) - 1.0);
  const dx = Math.abs(bv.dx ?? 0);
  const dy = Math.abs(bv.dy ?? 0);
  const motionIntensity = zoom * 10 + rot * 0.3 + (sx + sy) * 10 + (dx + dy) * 50;
  if (motionIntensity > 1.5) psychScore += 0.5;
  if (motionIntensity > 4.0) psychScore += 0.8;

  // 4. Trail/echo/ethereal — persistence, echo layers, blur
  let etherealScore = 0;
  const decay = bv.decay ?? 0.98;
  // High decay = long trails. Only meaningful above 0.97.
  if (decay > 0.97) etherealScore += 1.0;
  if (decay > 0.99) etherealScore += 1.0;
  if (decay >= 1.0) etherealScore += 0.5;

  const echoAlpha = bv.echo_alpha ?? 0;
  // Echo is a strong ethereal signal — layered ghost images
  if (echoAlpha > 0.05) etherealScore += 1.5;
  if (echoAlpha > 0.3) etherealScore += 1.0;

  const echoZoom = bv.echo_zoom ?? 1;
  if (echoAlpha > 0.05 && Math.abs(echoZoom - 1.0) > 0.01) etherealScore += 0.5;

  // Shader blur contributes to both ethereal and psychedelic
  etherealScore += Math.min(blurNoise * 0.3, 0.8);

  return { audioScore, waveScore, psychScore, etherealScore, motionIntensity };
}

// ── Classification rules ───────────────────────────────────────────────────

/**
 * Two-phase classification:
 * Phase 1: Score all presets and compute percentile thresholds.
 * Phase 2: Assign each preset to its dominant category, using percentile-
 *          aware thresholds so packs are reasonably balanced (10-25% each).
 */

// Phase 1: Score all presets
const presetScores = {};
for (const [name, preset] of Object.entries(allPresets)) {
  presetScores[name] = scorePreset(preset);
}

// Compute percentile thresholds for each score dimension
function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

const allScores = Object.values(presetScores);
const audioP65 = percentile(
  allScores.map((s) => s.audioScore),
  0.65,
);
const psychP60 = percentile(
  allScores.map((s) => s.psychScore),
  0.6,
);
const etherealP60 = percentile(
  allScores.map((s) => s.etherealScore),
  0.6,
);

// Phase 2: Classify
function classify(name, scores) {
  const { audioScore, waveScore, psychScore, etherealScore } = scores;

  // 1. Waveform features → Reactive (Waveform pack removed — too few presets)
  if (waveScore >= 3.0) return 'Reactive';

  // 2. Dominant category wins — only if clearly above the population median
  //    and dominant over other categories

  // Reactive: high audio refs AND dominant — require above 65th percentile
  // (most MilkDrop presets reference audio somewhat; Reactive means audio is the primary driver)
  if (
    audioScore > audioP65 &&
    audioScore >= psychScore * 0.9 &&
    audioScore >= etherealScore * 0.9
  ) {
    return 'Reactive';
  }

  // Psychedelic: complex shaders + effects AND dominant
  if (psychScore > psychP60 && psychScore > etherealScore && psychScore >= audioScore * 0.7) {
    return 'Psychedelic';
  }

  // Ethereal: persistence + echo AND dominant
  if (etherealScore > etherealP60 && etherealScore >= psychScore) {
    return 'Ethereal';
  }

  // 3. Secondary waveform features → Reactive
  if (waveScore >= 1.5) return 'Reactive';

  // 4. Ambient — presets that don't strongly score in any specific category.
  // These are typically smooth, time-driven animations that may reference audio
  // modestly but aren't defined by any single visual characteristic.
  return 'Ambient';
}

// ── Run classification ─────────────────────────────────────────────────────

const classification = {};
const packCounts = { Ambient: 0, Reactive: 0, Psychedelic: 0, Ethereal: 0 };

for (const [name, preset] of Object.entries(allPresets)) {
  const scores = presetScores[name];
  const pack = classify(name, scores);
  classification[name] = pack;
  packCounts[pack]++;
}

// ── Output results ─────────────────────────────────────────────────────────

console.log('\nPack distribution:');
for (const [pack, count] of Object.entries(packCounts)) {
  const pct = ((count / Object.keys(allPresets).length) * 100).toFixed(1);
  console.log(`  ${pack}: ${count} (${pct}%)`);
}
console.log(`  Total: ${Object.keys(classification).length}`);

// Write intermediate JSON
const jsonPath = resolve(__dirname, 'preset-classification.json');
writeFileSync(jsonPath, JSON.stringify(classification, null, 2) + '\n');
console.log(`\nWrote ${jsonPath}`);

// ── Generate TypeScript mapping (--update flag) ────────────────────────────

if (process.argv.includes('--update')) {
  const THEMATIC_PACKS = ['Ambient', 'Reactive', 'Psychedelic', 'Ethereal'];

  const lines = [
    "export const THEMATIC_PACKS = ['Ambient', 'Reactive', 'Psychedelic', 'Ethereal'] as const;",
    'export type ThematicPack = (typeof THEMATIC_PACKS)[number];',
    '',
    '/** Tooltip descriptions for each thematic pack (used in PresetBrowser checkboxes). */',
    'export const PACK_DESCRIPTIONS: Record<string, string> = {',
    "  Ambient: 'Smooth, time-driven animations \\u2014 calm and meditative',",
    "  Reactive: 'Responds to beats \\u2014 audio-driven motion and color',",
    "  Psychedelic: 'Intense shaders, warping, and visual complexity',",
    "  Ethereal: 'Trails, echo layers, and soft glowing persistence',",
    '};',
    '',
    '/** Maps every preset name to its thematic pack. */',
    'export const presetThematicMap: Record<string, ThematicPack> = {',
  ];

  // Quote helper: single quotes unless the string contains an apostrophe (Prettier convention)
  function quoteName(str) {
    const escaped = str.replace(/\\/g, '\\\\');
    if (escaped.includes("'")) {
      const dblEscaped = escaped.replace(/"/g, '\\"');
      return `"${dblEscaped}"`;
    }
    return `'${escaped}'`;
  }

  // Sort alphabetically for stable output
  const sorted = Object.entries(classification).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, pack] of sorted) {
    lines.push(`  ${quoteName(name)}: '${pack}',`);
  }
  lines.push('};');
  lines.push('');

  // Note: BUTTERCHURN_MILKDROP_NAMES (butterchurn presets that are also original MilkDrop
  // presets) is maintained manually in presetThematicPacks.ts. It requires cross-referencing
  // with .milk source files and is not regenerated by this script.

  const tsPath = resolve(__dirname, '..', 'packages/frontend/src/data/presetThematicPacks.ts');
  writeFileSync(tsPath, lines.join('\n'));
  console.log(`Wrote ${tsPath}`);
}
