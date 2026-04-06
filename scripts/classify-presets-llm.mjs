#!/usr/bin/env node

/**
 * LLM-powered preset classification using Claude API.
 *
 * Sends preset metadata (baseVals, equation excerpts, shader excerpts) to Claude
 * in batches for semantic classification into thematic packs. Produces higher-quality
 * classifications than the heuristic script by understanding the *intent* of preset code.
 *
 * Reusable: pack definitions are configurable, output format is identical to the
 * heuristic script (JSON + optional TS mapping), and --resume handles interruptions.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/classify-presets-llm.mjs
 *   ANTHROPIC_API_KEY=sk-... node scripts/classify-presets-llm.mjs --update
 *   ANTHROPIC_API_KEY=sk-... node scripts/classify-presets-llm.mjs --diff
 *
 * Flags:
 *   --update         Regenerate presetThematicPacks.ts after classification
 *   --diff           Compare LLM results with heuristic (preset-classification-heuristic.json)
 *   --model NAME     Claude model (default: claude-sonnet-4-20250514)
 *   --batch-size N   Presets per API call (default: 40)
 *   --concurrency N  Parallel API calls (default: 3)
 *   --resume         Resume from scripts/llm-classification-partial.json
 *
 * Environment:
 *   ANTHROPIC_API_KEY  Required.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createContext, runInContext } from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag, defaultVal) => {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : defaultVal;
};
const hasFlag = (flag) => args.includes(flag);

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
  process.exit(1);
}

const MODEL = getArg('--model', 'claude-sonnet-4-20250514');
const BATCH_SIZE = parseInt(getArg('--batch-size', '40'), 10);
const CONCURRENCY = parseInt(getArg('--concurrency', '3'), 10);
const DO_UPDATE = hasFlag('--update');
const DO_DIFF = hasFlag('--diff');
const DO_RESUME = hasFlag('--resume');

// ── Pack definitions (edit these to change classification categories) ────────

const PACK_DEFINITIONS = {
  Ambient: {
    description: 'Smooth, time-driven animations — calm and meditative',
    signals:
      'Slow, gentle motion. Mathematical patterns evolving smoothly over time. Audio may modulate ' +
      'slightly but is NOT the dominant driver. Simple or no shaders. Calm aesthetic. ' +
      'Think: lava lamp, slow kaleidoscope, reaction diffusion, gentle flowing. ' +
      "This is also the DEFAULT/FALLBACK — if a preset doesn't strongly fit elsewhere, it's Ambient.",
  },
  Reactive: {
    description: 'Responds to beats — audio-driven motion and color',
    signals:
      'Audio variables (bass/mid/treb/etc.) are the PRIMARY driver of visual change. The visual ' +
      'experience is FUNDAMENTALLY different with vs without music. Heavy audio variable usage in ' +
      'equations driving motion, color, size, or intensity. Think: beat-pulsing geometry, bass-driven ' +
      'explosions, audio-responsive patterns. NOTE: Most presets reference audio somewhat — that alone ' +
      'does NOT make them Reactive. Audio must DOMINATE. 10+ audio refs driving core motion/color = ' +
      'Reactive. 3 audio refs as minor modulation = probably something else.',
  },
  Psychedelic: {
    description: 'Intense shaders, warping, and visual complexity',
    signals:
      'Complex warp/comp shaders. High warp values. Intense effects: solarize, invert, heavy color ' +
      'cycling, aggressive distortion. Fractal patterns, kaleidoscopic patterns with intensity. ' +
      'Visual overload / sensory intensity. Think: acid trip, deep fractal zoom, intense color storms, ' +
      'heavy shader processing.',
  },
  // Waveform pack removed — only 4 presets qualified (spectrum/oscilloscope). Merged into Reactive.
  // Re-add when preset library grows (cream-of-the-crop) and enough waveform presets exist.
  Ethereal: {
    description: 'Trails, echo layers, and soft glowing persistence',
    signals:
      'High decay (>0.97) creating long visual trails. Echo layers (echo_alpha > 0) creating ghost ' +
      'images. The aesthetic is ghostly, misty, dreamy — previous frames linger and blend visibly. ' +
      'Soft-glow, translucent layering. Think: ghost trails, echo chambers, foggy dreamscapes. ' +
      'IMPORTANT: Requires VISIBLE persistence/trail/echo as the defining aesthetic. High decay alone ' +
      'with intense visuals = Psychedelic, not Ethereal. The overall feel must be dreamy/ghostly/soft.',
  },
};

const PACK_NAMES = Object.keys(PACK_DEFINITIONS);

// ── Load presets ────────────────────────────────────────────────────────────

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

console.log('Loading presets...');
const allPresets = {};

for (const file of [
  'butterchurnPresetsMinimal.min.js',
  'butterchurnPresetsNonMinimal.min.js',
  'butterchurnPresetsExtra.min.js',
  'butterchurnPresetsExtra2.min.js',
  'butterchurnPresetsMD1.min.js',
]) {
  const pack = loadButterchurnPack(file);
  for (const [name, preset] of Object.entries(pack)) {
    allPresets[name] = preset;
  }
}

const milkdropPath = resolve(__dirname, '..', 'packages/milkdrop-presets/lib/presets.json');
const milkdropPresets = JSON.parse(readFileSync(milkdropPath, 'utf8'));
for (const [name, preset] of Object.entries(milkdropPresets)) {
  if (!allPresets[name]) allPresets[name] = preset;
}

const presetNames = Object.keys(allPresets).sort();
console.log(`Loaded ${presetNames.length} presets`);

// ── Feature extraction ──────────────────────────────────────────────────────

function getAllEquationText(preset) {
  const parts = [];
  for (const key of ['init_eqs_str', 'frame_eqs_str', 'pixel_eqs_str']) {
    if (preset[key]) parts.push(preset[key]);
  }
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

function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen) + '...[truncated]';
}

function extractFeatures(name, preset) {
  const bv = preset.baseVals || {};
  const eqs = getAllEquationText(preset);

  const isEel = !!preset._eelFormat;
  const audioPattern = isEel
    ? /\b(bass|mid|treb|bass_att|mid_att|treb_att|vol)\b/g
    : /\ba\.(bass|mid|treb|bass_att|mid_att|treb_att|vol)\b/g;

  const keyVals = {};
  for (const k of [
    'decay',
    'warp',
    'zoom',
    'rot',
    'sx',
    'sy',
    'dx',
    'dy',
    'wave_a',
    'wave_mode',
    'wave_mystery',
    'mv_a',
    'mv_x',
    'mv_y',
    'echo_alpha',
    'echo_zoom',
    'echo_orient',
    'ob_a',
    'ib_a',
  ]) {
    if (bv[k] !== undefined && bv[k] !== null) keyVals[k] = bv[k];
  }

  return {
    name,
    baseVals: keyVals,
    audioRefCount: (eqs.match(audioPattern) || []).length,
    equationLength: eqs.length,
    waveCount: preset.waves ? Object.keys(preset.waves).length : 0,
    shapeCount: preset.shapes ? Object.keys(preset.shapes).length : 0,
    frameEqs: truncate(preset.frame_eqs_str, 300),
    pixelEqs: truncate(preset.pixel_eqs_str, 200),
    warpShader: truncate(preset.warp || '', 400),
    compShader: truncate(preset.comp || '', 400),
  };
}

// ── Claude API ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildSystemPrompt() {
  let system = `You are classifying MilkDrop music visualizer presets into thematic packs based on their code and parameters.

MilkDrop presets are real-time audio visualizations. Each preset has:
- **baseVals**: numeric parameters controlling motion (zoom, rot, warp, dx, dy), persistence (decay), wave display (wave_a, wave_mode, mv_a), and echo effects (echo_alpha, echo_zoom).
- **Equations**: per-frame/per-pixel math that drives animation. Variables like bass, mid, treb, bass_att, mid_att, treb_att, vol are real-time audio levels.
- **Shaders**: HLSL/GLSL warp and composite shaders for post-processing effects.

Key parameter reference:
- decay: 0.9-1.0, how much of the previous frame persists (1.0 = infinite trails, 0.9 = fast fade)
- warp: distortion intensity applied via warp shader
- zoom: per-frame zoom (1.0 = none, >1 = zoom in, <1 = zoom out)
- rot: per-frame rotation in radians
- wave_a: opacity of the built-in oscilloscope waveform (0 = hidden, 1+ = visible)
- mv_a: opacity of motion vector grid / spectrum bars (0 = hidden, >0 = visible)
- echo_alpha: opacity of echo/ghost layer (0 = no echo)
- echo_zoom/echo_orient: echo layer transform

Classify each preset into exactly ONE of these packs:

`;

  for (const [pack, def] of Object.entries(PACK_DEFINITIONS)) {
    system += `**${pack}**: ${def.description}\n  Classification signals: ${def.signals}\n\n`;
  }

  system += `DISAMBIGUATION RULES:
1. Preset NAME is a strong signal — "acid", "fractal", "psychedelic", "trippy" → Psychedelic. "Spectrum", "oscilloscope", "sine wave" → Waveform. "Ghost", "fog", "trail", "echo" → Ethereal. "Gentle", "calm", "slow" → Ambient.
2. Reactive requires audio as PRIMARY driver, not just present. 10+ audio refs in equations with audio driving core motion/color = Reactive. 3 audio refs as minor modulation = probably something else.
3. Waveform is the MOST selective pack. Only classify as Waveform if the preset is fundamentally about displaying the audio signal as a visual shape. Custom waves that draw decorative patterns but aren't "the point" don't qualify.
4. Ethereal vs Ambient: both can be calm, but Ethereal has visible persistence (high decay + echo/blur creating dreamy layers). Ambient is cleaner, more about smooth motion than ghostly layering.
5. When genuinely uncertain, prefer Ambient as the safe fallback.

Respond with ONLY a JSON object mapping preset names to pack names. No explanation, no markdown fences, no extra text.
Example: {"Preset A": "Ambient", "Preset B": "Reactive"}`;

  return system;
}

const SYSTEM_PROMPT = buildSystemPrompt();

async function callClaude(userContent, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        }),
      });

      if (res.status === 429) {
        const wait = parseInt(res.headers.get('retry-after') || '30', 10);
        console.warn(`  Rate limited, waiting ${wait}s...`);
        await sleep(wait * 1000);
        continue;
      }
      if (res.status === 529) {
        console.warn(`  API overloaded, waiting 60s (attempt ${attempt}/${retries})...`);
        await sleep(60000);
        continue;
      }
      if (!res.ok) {
        throw new Error(`API ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      return data.content[0].text;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`  Attempt ${attempt} failed: ${err.message}. Retrying in ${5 * attempt}s...`);
      await sleep(5000 * attempt);
    }
  }
}

function buildBatchPrompt(features) {
  let prompt = 'Classify these presets:\n\n';
  for (const f of features) {
    prompt += `--- ${f.name} ---\n`;
    prompt += `baseVals: ${JSON.stringify(f.baseVals)}\n`;
    prompt += `audioRefs: ${f.audioRefCount}, eqLen: ${f.equationLength}, waves: ${f.waveCount}, shapes: ${f.shapeCount}\n`;
    if (f.frameEqs) prompt += `frameEqs: ${f.frameEqs}\n`;
    if (f.pixelEqs) prompt += `pixelEqs: ${f.pixelEqs}\n`;
    if (f.warpShader) prompt += `warpShader: ${f.warpShader}\n`;
    if (f.compShader) prompt += `compShader: ${f.compShader}\n`;
    prompt += '\n';
  }
  return prompt;
}

// ── TS codegen (shared with heuristic script) ───────────────────────────────

function quoteName(str) {
  const escaped = str.replace(/\\/g, '\\\\');
  if (escaped.includes("'")) {
    return `"${escaped.replace(/"/g, '\\"')}"`;
  }
  return `'${escaped}'`;
}

function generateTypeScript(classification) {
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

  const sorted = Object.entries(classification).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, pack] of sorted) {
    lines.push(`  ${quoteName(name)}: '${pack}',`);
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const partialPath = resolve(__dirname, 'llm-classification-partial.json');
  const jsonPath = resolve(__dirname, 'preset-classification.json');

  // Load partial results if resuming
  let classification = {};
  if (DO_RESUME && existsSync(partialPath)) {
    classification = JSON.parse(readFileSync(partialPath, 'utf8'));
    console.log(`Resuming: ${Object.keys(classification).length} already classified`);
  }

  const remaining = presetNames.filter((n) => !classification[n]);
  console.log(
    `${remaining.length} to classify (model: ${MODEL}, batch: ${BATCH_SIZE}, concurrency: ${CONCURRENCY})`,
  );

  if (remaining.length > 0) {
    // Extract features
    const featureMap = {};
    for (const name of remaining) {
      featureMap[name] = extractFeatures(name, allPresets[name]);
    }

    // Split into batches
    const batches = [];
    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
      batches.push(remaining.slice(i, i + BATCH_SIZE));
    }

    // Process with concurrency
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const chunk = batches.slice(i, i + CONCURRENCY);

      await Promise.all(
        chunk.map(async (batch, idx) => {
          const batchNum = i + idx + 1;
          const features = batch.map((n) => featureMap[n]);
          console.log(`  Batch ${batchNum}/${batches.length} (${batch.length} presets)...`);

          try {
            const response = await callClaude(buildBatchPrompt(features));

            // Parse — strip markdown fences if present
            let cleaned = response.trim();
            if (cleaned.startsWith('```')) {
              cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            const result = JSON.parse(cleaned);
            let valid = 0;
            for (const [name, pack] of Object.entries(result)) {
              if (PACK_NAMES.includes(pack)) {
                classification[name] = pack;
                valid++;
              } else {
                console.warn(`  Invalid pack "${pack}" for "${name}"`);
              }
            }
            console.log(`  Batch ${batchNum} done: ${valid} classified`);
          } catch (err) {
            console.error(`  Batch ${batchNum} failed: ${err.message}`);
          }
        }),
      );

      // Save progress after each concurrent chunk
      writeFileSync(partialPath, JSON.stringify(classification, null, 2) + '\n');
      console.log(`  Progress: ${Object.keys(classification).length}/${presetNames.length}`);
    }
  }

  // Default missing to Ambient
  const missing = presetNames.filter((n) => !classification[n]);
  if (missing.length > 0) {
    console.warn(`\n${missing.length} unclassified presets defaulted to Ambient.`);
    for (const name of missing) classification[name] = 'Ambient';
  }

  // Stats
  const packCounts = {};
  for (const pack of PACK_NAMES) packCounts[pack] = 0;
  for (const pack of Object.values(classification)) packCounts[pack]++;

  console.log('\nPack distribution:');
  for (const [pack, count] of Object.entries(packCounts)) {
    const pct = ((count / presetNames.length) * 100).toFixed(1);
    console.log(`  ${pack}: ${count} (${pct}%)`);
  }
  console.log(`  Total: ${Object.keys(classification).length}`);

  // Write final JSON
  writeFileSync(jsonPath, JSON.stringify(classification, null, 2) + '\n');
  console.log(`\nWrote ${jsonPath}`);

  // Clean up partial file
  if (existsSync(partialPath)) unlinkSync(partialPath);

  // ── Diff ────────────────────────────────────────────────────────────────

  if (DO_DIFF) {
    const heuristicPath = resolve(__dirname, 'preset-classification-heuristic.json');
    if (existsSync(heuristicPath)) {
      const heuristic = JSON.parse(readFileSync(heuristicPath, 'utf8'));
      let changes = 0;
      const changeCounts = {};
      for (const name of presetNames) {
        if (heuristic[name] && classification[name] && heuristic[name] !== classification[name]) {
          changes++;
          const key = `${heuristic[name]} → ${classification[name]}`;
          changeCounts[key] = (changeCounts[key] || 0) + 1;
        }
      }
      console.log(`\nDiff vs heuristic: ${changes} changes`);
      for (const [transition, count] of Object.entries(changeCounts).sort(
        ([, a], [, b]) => b - a,
      )) {
        console.log(`  ${transition}: ${count}`);
      }
    } else {
      console.log(`\nNo heuristic file at ${heuristicPath}`);
      console.log('Save current classification as preset-classification-heuristic.json first.');
    }
  }

  // ── Update TS ─────────────────────────────────────────────────────────

  if (DO_UPDATE) {
    const tsPath = resolve(__dirname, '..', 'packages/frontend/src/data/presetThematicPacks.ts');
    writeFileSync(tsPath, generateTypeScript(classification));
    console.log(`Wrote ${tsPath}`);
    console.log('Run: npx prettier --write packages/frontend/src/data/presetThematicPacks.ts');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
