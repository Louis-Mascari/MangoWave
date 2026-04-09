#!/usr/bin/env node
/**
 * Build script for bundled MilkDrop-Original presets.
 *
 * Reads .milk files from a source directory, deduplicates against existing
 * butterchurn packs, converts via milkdrop-preset-converter, and outputs
 * a JSON map (preset name → converted object with _eelFormat: true).
 *
 * Usage:
 *   node scripts/build-milkdrop-presets.mjs <path-to-milk-directory>
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// 1. Parse CLI args
// ---------------------------------------------------------------------------

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('Usage: node scripts/build-milkdrop-presets.mjs <path-to-milk-directory>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Load existing butterchurn preset names for deduplication
// ---------------------------------------------------------------------------

/** Evaluate a UMD butterchurn preset pack file and return the module exports. */
async function loadUmdPack(filePath) {
  const code = await readFile(filePath, 'utf-8');
  const exports = {};
  const module = { exports };
  const sandbox = { module, exports, self: {}, define: undefined };
  vm.runInNewContext(code, sandbox);
  const mod = module.exports.default ?? module.exports;
  return Object.keys(mod.getPresets());
}

const packDir = join(import.meta.dirname, '..', 'packages', 'butterchurn-presets', 'lib');
const packFiles = [
  'butterchurnPresetsMinimal.min.js',
  'butterchurnPresetsNonMinimal.min.js',
  'butterchurnPresetsExtra.min.js',
  'butterchurnPresetsExtra2.min.js',
  'butterchurnPresetsMD1.min.js',
];

const existingNames = new Set();
for (const file of packFiles) {
  const names = await loadUmdPack(join(packDir, file));
  for (const name of names) existingNames.add(name);
}
console.log(`Loaded ${existingNames.size} existing butterchurn preset names for dedup`);

// ---------------------------------------------------------------------------
// 3. Blocked presets (QA failures / content issues)
// ---------------------------------------------------------------------------

const BLOCKED = new Set([
  'Bmelgren & Flexi - what the heck (Jelly) [fixed aspect ratio]',
  'Eo.S. + Phat - cubetrace - v2',
  'Fvese - 0 runknown [acid mix]',
  'Geiss - Approach',
  'Geiss - Feedback',
  'Geiss - Swirl 1',
  'Geiss - Tokamak',
  'Goody - The Wild Vort',
  'Martin - liquid circles',
  'Martin - slow shift',
  'Rozzor & Eo.S+Phat - Cubetrace waveform [flexi - broken neon] v2',
  'Unchained - Picture Of Poison',
  'Unchained - Unclaimed Property',
  "Unchained - Morat's Final Trainer2",
  'flexi - predator-prey ecosystem [Geiss - Cauldron remix]',
  'Zylot - Building Block of color - Bitcore Tweak',
  'Rovastar & Zylot - Crystal Ball (Many Visions Mix)',
]);

// ---------------------------------------------------------------------------
// 4. Read and filter .milk files
// ---------------------------------------------------------------------------

const files = (await readdir(sourceDir)).filter((f) => extname(f).toLowerCase() === '.milk');
console.log(`Found ${files.length} .milk files in source directory`);

// ---------------------------------------------------------------------------
// 5. Load converter — milkdrop-preset-converter is ESM but imports CJS packages
//    (milkdrop-preset-utils, lodash) with named exports, which only works under
//    Vite's pre-bundling. We shim the CJS deps via a temporary wrapper module.
// ---------------------------------------------------------------------------

import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

// Resolve CJS deps from the converter package's node_modules
const converterPkg = join(
  import.meta.dirname,
  '..',
  'packages',
  'milkdrop-preset-converter',
  'package.json',
);

// Create temporary ESM shim for milkdrop-preset-utils (UMD/CJS → named ESM exports)
const mpuShimPath = join(import.meta.dirname, '_mpu_shim.mjs');
writeFileSync(
  mpuShimPath,
  `import { createRequire } from 'node:module';
const require = createRequire('${converterPkg.replace(/\\/g, '/')}');
const mod = require('milkdrop-preset-utils');
const m = mod.default ?? mod;
export const splitPreset = m.splitPreset;
export const prepareShader = m.prepareShader;
export const processUnOptimizedShader = m.processUnOptimizedShader;
export const createBasePresetFuns = m.createBasePresetFuns;
`,
);

// Create temporary ESM shim for lodash (CJS → default ESM export)
const lodashShimPath = join(import.meta.dirname, '_lodash_shim.mjs');
writeFileSync(
  lodashShimPath,
  `import { createRequire } from 'node:module';
const require = createRequire('${converterPkg.replace(/\\/g, '/')}');
const _ = require('lodash');
export default _;
`,
);

// Create a temporary converter wrapper that re-routes CJS imports through the shims
const converterSrc = await readFile(
  join(import.meta.dirname, '..', 'packages', 'milkdrop-preset-converter', 'src', 'index.js'),
  'utf-8',
);

const hlslparserPath = join(
  import.meta.dirname,
  '..',
  'packages',
  'hlslparser-wasm',
  'src',
  'index.js',
);
const shimmedSrc = converterSrc
  .replace(/from 'milkdrop-preset-utils'/, `from '${mpuShimPath.replace(/\\/g, '/')}'`)
  .replace(/from 'lodash'/, `from '${lodashShimPath.replace(/\\/g, '/')}'`)
  .replace(/from 'hlslparser-wasm'/, `from '${hlslparserPath.replace(/\\/g, '/')}'`);

const converterShimPath = join(import.meta.dirname, '_converter_shim.mjs');
writeFileSync(converterShimPath, shimmedSrc);

let convertPreset;
try {
  const converter = await import(converterShimPath);
  convertPreset = converter.convertPreset;
} finally {
  // Clean up temp files
  if (existsSync(mpuShimPath)) unlinkSync(mpuShimPath);
  if (existsSync(lodashShimPath)) unlinkSync(lodashShimPath);
  if (existsSync(converterShimPath)) unlinkSync(converterShimPath);
}

// ---------------------------------------------------------------------------
// 6. Convert presets
// ---------------------------------------------------------------------------

const results = {};
let converted = 0;
let skippedBlocked = 0;
let skippedDedup = 0;
let failed = 0;
let warnings = 0;

for (const file of files) {
  const name = basename(file, '.milk');

  if (BLOCKED.has(name)) {
    skippedBlocked++;
    continue;
  }

  if (existingNames.has(name)) {
    skippedDedup++;
    continue;
  }

  try {
    const text = await readFile(join(sourceDir, file), 'utf-8');
    const preset = await convertPreset(text);

    // Check for missing textures (non-blocking warning)
    const content = JSON.stringify(preset);
    const texRefs = content.match(/"sampler_\w+"/g);
    if (texRefs) {
      const builtinSamplers = new Set([
        'sampler_main',
        'sampler_fw_main',
        'sampler_fc_main',
        'sampler_pw_main',
        'sampler_pc_main',
        'sampler_blur1',
        'sampler_blur2',
        'sampler_blur3',
        'sampler_noise_lq',
        'sampler_noise_lq_lite',
        'sampler_noise_mq',
        'sampler_noise_hq',
        'sampler_pw_noise_lq',
        'sampler_noisevol_lq',
        'sampler_noisevol_hq',
      ]);
      for (const ref of texRefs) {
        const samplerName = ref.slice(1, -1); // strip quotes
        if (!builtinSamplers.has(samplerName)) {
          warnings++;
        }
      }
    }

    results[name] = preset;
    converted++;
    if (converted % 50 === 0) {
      process.stdout.write(`  Converted ${converted}...\n`);
    }
  } catch (err) {
    failed++;
    console.warn(`  FAILED: ${name}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 7. Write output
// ---------------------------------------------------------------------------

const outDir = join(import.meta.dirname, '..', 'packages', 'milkdrop-presets', 'lib');
await mkdir(outDir, { recursive: true });

const outPath = join(outDir, 'presets.json');
const json = JSON.stringify(results);
await writeFile(outPath, json, 'utf-8');

// Write a lightweight names-only manifest for eager registration (avoids parsing the 5MB data)
const namesPath = join(outDir, 'presetNames.json');
const namesJson = JSON.stringify(Object.keys(results), null, 2) + '\n';
await writeFile(namesPath, namesJson, 'utf-8');

const sizeMB = (Buffer.byteLength(json, 'utf-8') / 1024 / 1024).toFixed(2);

console.log('\n--- Summary ---');
console.log(`Total .milk files:  ${files.length}`);
console.log(`Converted:          ${converted}`);
console.log(`Skipped (blocked):  ${skippedBlocked}`);
console.log(`Skipped (dedup):    ${skippedDedup}`);
console.log(`Failed:             ${failed}`);
console.log(`Texture warnings:   ${warnings}`);
console.log(`Output:             ${outPath} (${sizeMB} MB)`);
console.log(`Preset count:       ${Object.keys(results).length}`);
