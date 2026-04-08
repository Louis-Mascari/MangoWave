#!/usr/bin/env node
/**
 * Build script for bundled presets.
 *
 * Reads .milk files from packages/milkdrop-presets/presets/, produces:
 *   - lib/presets.json      — { name: milkText } map (all preset .milk content)
 *   - lib/presetNames.json  — string[] of preset names (lightweight manifest for init)
 *
 * With projectM WASM, no conversion is needed — raw .milk text is loaded directly
 * into projectm_load_preset_data(). This replaces the old butterchurn-era build
 * that ran the conversion pipeline.
 *
 * Usage:
 *   node scripts/build-milkdrop-presets.mjs [path-to-milk-directory]
 *
 * If no directory is given, defaults to packages/milkdrop-presets/presets/
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

const sourceDir =
  process.argv[2] || join(import.meta.dirname, '..', 'packages', 'milkdrop-presets', 'presets');

// ---------------------------------------------------------------------------
// 1. Blocked presets (QA failures / content issues from prior testing)
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
// 2. Read .milk files
// ---------------------------------------------------------------------------

const files = (await readdir(sourceDir)).filter((f) => extname(f).toLowerCase() === '.milk');
console.log(`Found ${files.length} .milk files in ${sourceDir}`);

// ---------------------------------------------------------------------------
// 3. Build preset map { name: milkText }
// ---------------------------------------------------------------------------

const results = {};
let included = 0;
let skippedBlocked = 0;

for (const file of files) {
  const name = basename(file, '.milk');

  if (BLOCKED.has(name)) {
    skippedBlocked++;
    continue;
  }

  try {
    const text = await readFile(join(sourceDir, file), 'utf-8');
    results[name] = text;
    included++;
  } catch (err) {
    console.warn(`  FAILED to read: ${name}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Write output
// ---------------------------------------------------------------------------

const outDir = join(import.meta.dirname, '..', 'packages', 'milkdrop-presets', 'lib');
await mkdir(outDir, { recursive: true });

const outPath = join(outDir, 'presets.json');
const json = JSON.stringify(results);
await writeFile(outPath, json, 'utf-8');

const namesPath = join(outDir, 'presetNames.json');
const namesJson = JSON.stringify(Object.keys(results).sort());
await writeFile(namesPath, namesJson, 'utf-8');

const sizeMB = (Buffer.byteLength(json, 'utf-8') / 1024 / 1024).toFixed(2);

console.log('\n--- Summary ---');
console.log(`Total .milk files:  ${files.length}`);
console.log(`Included:           ${included}`);
console.log(`Skipped (blocked):  ${skippedBlocked}`);
console.log(`Output:             ${outPath} (${sizeMB} MB)`);
console.log(`Names:              ${namesPath}`);
console.log(`Preset count:       ${Object.keys(results).length}`);
