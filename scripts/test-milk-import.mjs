#!/usr/bin/env node
/**
 * Test .milk preset EEL parsing without a browser.
 * Runs all .milk files through the EEL preprocessor + parser pipeline.
 *
 * Usage:  node scripts/test-milk-import.mjs <directory-of-milk-files>
 * Output: console summary + mw-import-errors.json
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

// --- Load CJS/UMD packages via vm (Node 24 ESM breaks createRequire for these) ---
function loadUmd(filePath) {
  const src = await_readFileSync(filePath);
  const mod = { exports: {} };
  const ctx = vm.createContext({
    module: mod,
    exports: mod.exports,
    require: () => {
      throw new Error('nested require not supported');
    },
    define: undefined,
    self: undefined,
    global: globalThis,
    console,
  });
  vm.runInContext(src, ctx, { filename: filePath });
  return mod.exports.default ?? mod.exports;
}

// Sync readFile for loadUmd (called at top level before async)
import { readFileSync } from 'node:fs';
function await_readFileSync(p) {
  return readFileSync(p, 'utf-8');
}

const parserPath = resolve('packages/milkdrop-eel-parser/lib/md-parser.min.js');
const utilsPath = resolve('node_modules/milkdrop-preset-utils/dist/milkdrop-preset-utils.min.js');

// Load milkdrop-eel-parser (UMD — needs `this` context trick)
function loadParser() {
  const src = readFileSync(parserPath, 'utf-8');
  const mod = { exports: {} };
  const sandbox = { module: mod, exports: mod.exports, define: undefined, self: undefined };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: parserPath });
  const raw = mod.exports.default ?? mod.exports;
  return raw.core ?? raw;
}

function loadPresetUtils() {
  const src = readFileSync(utilsPath, 'utf-8');
  const mod = { exports: {} };
  const sandbox = {
    module: mod,
    exports: mod.exports,
    define: undefined,
    self: typeof globalThis !== 'undefined' ? globalThis : {},
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: utilsPath });
  const raw = mod.exports.default ?? mod.exports;
  return raw;
}

const milkdropParser = loadParser();
const presetUtils = loadPresetUtils();
const splitPreset = presetUtils.splitPreset;

if (!splitPreset) {
  console.error('Failed to load splitPreset from milkdrop-preset-utils');
  console.error('Exports:', Object.keys(presetUtils));
  process.exit(1);
}
if (!milkdropParser.convert_preset_wave_and_shape) {
  console.error('Failed to load milkdrop-eel-parser');
  console.error('Exports:', Object.keys(milkdropParser));
  process.exit(1);
}

// Build EEL preprocessor from converter source
const converterSrc = readFileSync(
  resolve('packages/milkdrop-preset-converter/src/index.js'),
  'utf-8',
);

function buildPreprocessor() {
  // Extract complete functions by brace-counting (non-greedy regex truncates multi-brace fns)
  function extractFunction(src, name) {
    const re = new RegExp(`(/\\*\\*[\\s\\S]*?\\*/\\s*)?function ${name}\\b`);
    const m = re.exec(src);
    if (!m) return null;
    const start = m.index;
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
  console.error('Usage: node scripts/test-milk-import.mjs <directory-of-milk-files>');
  process.exit(1);
}

const absDir = resolve(dir);
const entries = await readdir(absDir);
const milkFiles = entries.filter((f) => f.endsWith('.milk')).sort();

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
  const filePath = join(absDir, fileName);
  try {
    const text = await readFile(filePath, 'utf-8');

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
      let snippet = '';
      const colMatch = msg.match(/column (\d+)/);
      const caretIdx = msg.indexOf('^');
      if (colMatch && caretIdx > -1) {
        const col = parseInt(colMatch[1], 10);
        const eqStart = msg.lastIndexOf(': ', caretIdx);
        if (eqStart > -1) {
          const eqText = msg.substring(eqStart + 2, caretIdx).trim();
          const s = Math.max(0, col - 50);
          const e = Math.min(eqText.length, col + 50);
          snippet =
            (s > 0 ? '...' : '') +
            eqText.substring(s, e) +
            (e < eqText.length ? '...' : '');
        }
      }

      console.error(`FAIL: ${fileName}`);
      console.error(`  ${msg.substring(0, 300)}`);
      if (snippet) console.error(`  Near: ${snippet}`);
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
    (r) => r.status === 'failed' && r.dedupe && r.error?.substring(0, 120) === key,
  );
  if (dupes.length > 0) {
    console.log(`  ${firstFile} (+${dupes.length} dupes):`);
    for (const d of dupes) console.log(`    - ${d.fileName}`);
  }
}

// Write error log
const logPath = resolve('mw-import-errors.json');
const uniqueFailures = results.filter((r) => r.status === 'failed' && !r.dedupe);
const errorLog = {
  timestamp: new Date().toISOString(),
  sourceDir: absDir,
  total: milkFiles.length,
  passed,
  failed,
  uniqueErrors: uniqueFailures.length,
  failures: uniqueFailures.map((f) => ({
    fileName: f.fileName,
    error: f.error?.substring(0, 500),
  })),
  duplicates: results
    .filter((r) => r.status === 'failed' && r.dedupe)
    .map((r) => r.fileName),
};
await writeFile(logPath, JSON.stringify(errorLog, null, 2));
console.log(`\nError log: ${logPath}`);

process.exit(failed > 0 ? 1 : 0);
