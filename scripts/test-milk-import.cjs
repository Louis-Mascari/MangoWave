#!/usr/bin/env node
/**
 * Test .milk preset EEL parsing without a browser.
 * Usage:  node scripts/test-milk-import.cjs <directory-of-milk-files>
 * Output: console summary + mw-import-errors.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Load UMD/CJS packages by evaling them (Node 24 require() breaks on "type":"module" packages)
function loadCjsModule(filePath) {
  const src = fs.readFileSync(filePath, 'utf-8');
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', src);
  fn(mod, mod.exports, require, filePath, path.dirname(filePath));
  return mod.exports.default ?? mod.exports;
}

const parserPath = path.resolve(__dirname, '../packages/milkdrop-eel-parser/lib/md-parser.min.js');
const utilsPath = path.resolve(__dirname, '../node_modules/milkdrop-preset-utils/dist/milkdrop-preset-utils.min.js');

const parserMod = loadCjsModule(parserPath);
const milkdropParser = parserMod.core ?? parserMod;

const utilsMod = loadCjsModule(utilsPath);
const splitPreset = utilsMod.splitPreset ?? utilsMod.default?.splitPreset;

if (!splitPreset) { console.error('Failed to load splitPreset. Keys:', Object.keys(utilsMod)); process.exit(1); }
if (!milkdropParser.convert_preset_wave_and_shape) {
  console.error('Failed to load parser. Keys:', Object.keys(milkdropParser).slice(0, 10));
  process.exit(1);
}

// Build EEL preprocessor from converter source
const converterSrc = fs.readFileSync(
  path.resolve(__dirname, '../packages/milkdrop-preset-converter/src/index.js'),
  'utf-8',
);

function buildPreprocessor() {
  // Extract complete functions by brace-counting (non-greedy regex truncates multi-brace fns)
  function extractFunction(src, name) {
    const re = new RegExp(`(/\\*\\*[\\s\\S]*?\\*/\\s*)?function ${name}\\b`);
    const m = re.exec(src);
    if (!m) return null;
    const start = m.index;
    // Find opening brace
    let i = src.indexOf('{', start + m[0].length);
    if (i === -1) return null;
    let depth = 1;
    i++;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    return src.substring(start, i);
  }

  const fns = [
    'fixStarVariableNames',
    'insertImplicitOps',
    'stripUnaryPlus',
    'preprocessEel',
    'deepPreprocessEel',
  ];
  let code = '';
  for (const name of fns) {
    const fn = extractFunction(converterSrc, name);
    if (fn) code += fn + '\n\n';
    else console.warn(`WARNING: could not extract function ${name}`);
  }
  code += 'return { preprocessEel, deepPreprocessEel };\n';
  return new Function(code)();
}

const { preprocessEel, deepPreprocessEel } = buildPreprocessor();

// --- CLI ---
const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/test-milk-import.cjs <directory-of-milk-files>');
  process.exit(1);
}

const absDir = path.resolve(dir);
const milkFiles = fs.readdirSync(absDir).filter(f => f.endsWith('.milk')).sort();

if (milkFiles.length === 0) {
  console.error(`No .milk files found in ${absDir}`);
  process.exit(1);
}

console.log(`Testing ${milkFiles.length} .milk files from ${absDir}\n`);

const results = [];
let passed = 0;
let failed = 0;
const warnFiles = [];
const seenErrors = new Map();

for (const fileName of milkFiles) {
  const filePath = path.join(absDir, fileName);
  try {
    const text = fs.readFileSync(filePath, 'utf-8');

    const mainPresetText = text.split('[preset00]')[1];
    if (!mainPresetText) throw new Error('No [preset00] section found');

    const parts = splitPreset(mainPresetText);

    const pInit = preprocessEel(parts.presetInit);
    const pFrame = preprocessEel(parts.perFrame);
    const pVertex = preprocessEel(parts.perVertex);
    const pShapes = deepPreprocessEel(parts.shapes);
    const pWaves = deepPreprocessEel(parts.waves);

    const warns = [];
    const origWarn = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));

    milkdropParser.convert_preset_wave_and_shape(
      parts.presetVersion,
      pInit,
      pFrame,
      pVertex,
      pShapes,
      pWaves,
    );
    console.warn = origWarn;

    passed++;
    if (warns.length > 0) warnFiles.push({ fileName, warnings: warns });
    results.push({ fileName, status: 'success', warnings: warns });
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);

    const key = msg.substring(0, 120);
    const isDupe = seenErrors.has(key);
    if (!isDupe) seenErrors.set(key, fileName);

    results.push({ fileName, status: 'failed', error: msg, dedupe: isDupe });

    if (!isDupe) {
      console.error(`FAIL: ${fileName}`);
      console.error(`  ${msg.substring(0, 300)}`);
      console.error();
    }
  }
}

// Summary
console.log('='.repeat(60));
console.log(
  `Results: ${passed} passed, ${failed} failed (${seenErrors.size} unique), ${warnFiles.length} warnings`,
);
console.log(`Total: ${milkFiles.length}\n`);

for (const [key, firstFile] of seenErrors) {
  const dupes = results.filter(
    r => r.status === 'failed' && r.dedupe && r.error?.substring(0, 120) === key,
  );
  if (dupes.length > 0) {
    console.log(`  ${firstFile} (+${dupes.length} dupes):`);
    for (const d of dupes.slice(0, 5)) console.log(`    - ${d.fileName}`);
    if (dupes.length > 5) console.log(`    ... and ${dupes.length - 5} more`);
  }
}

// Write error log
const logPath = path.resolve('mw-import-errors.json');
const uniqueFailures = results.filter(r => r.status === 'failed' && !r.dedupe);
const errorLog = {
  timestamp: new Date().toISOString(),
  sourceDir: absDir,
  total: milkFiles.length,
  passed,
  failed,
  uniqueErrors: uniqueFailures.length,
  failures: uniqueFailures.map(f => ({
    fileName: f.fileName,
    error: f.error?.substring(0, 500),
  })),
  duplicates: results
    .filter(r => r.status === 'failed' && r.dedupe)
    .map(r => r.fileName),
};
fs.writeFileSync(logPath, JSON.stringify(errorLog, null, 2));
console.log(`\nError log: ${logPath}`);

process.exit(failed > 0 ? 1 : 0);
