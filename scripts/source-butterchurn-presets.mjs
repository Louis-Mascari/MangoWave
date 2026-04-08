#!/usr/bin/env node
/**
 * One-time sourcing script: find .milk files for all butterchurn presets.
 *
 * Strategy:
 * 1. Extract all preset names from butterchurn-presets packs
 * 2. For each name, search for a matching .milk file in projectM repos
 * 3. Matching: exact name match (filename without .milk extension)
 * 4. Copy matched .milk files to a unified output directory
 * 5. Report unmatched presets
 *
 * Usage:
 *   node scripts/source-butterchurn-presets.mjs [--copy]
 *
 *   Without --copy: dry run, just reports matches
 *   With --copy: copies matched .milk files to packages/milkdrop-presets/presets/
 */

import {
  readFileSync,
  readdirSync,
  copyFileSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  statSync,
} from 'fs';
import { join, basename, resolve } from 'path';

// Directories to search for .milk files (priority order — first match wins)
const SEARCH_DIRS = [
  resolve(process.env.HOME, 'Downloads/milkdrop-qa/presets-milkdrop-original/Milkdrop-Original'),
  resolve(process.env.HOME, 'Downloads/milkdrop-qa/presets'),
  resolve(process.env.HOME, 'presets-cream-of-the-crop'),
  resolve(process.env.HOME, 'presets-projectm-classic'),
];

const OUT_DIR = resolve('packages/milkdrop-presets/presets');
const doCopy = process.argv.includes('--copy');

// ── Step 1: Extract butterchurn preset names from thematicPacks.ts ──
// This contains ALL classified presets (butterchurn + MilkDrop)
const thematicSrc = readFileSync('packages/frontend/src/data/presetThematicPacks.ts', 'utf-8');
const mapMatch = thematicSrc.match(
  /export const presetThematicMap: Record<string, ThematicPack> = \{([\s\S]*?)\n\};/,
);
if (!mapMatch) {
  console.error('Could not parse presetThematicMap');
  process.exit(1);
}
const thematicNames = [...mapMatch[1].matchAll(/'([^']+)':/g)].map((m) => m[1]);
console.log(`Thematic map: ${thematicNames.length} presets`);

// ── Step 2: Get MilkDrop-Original names (these already have .milk sources) ──
const mdNames = JSON.parse(readFileSync('packages/milkdrop-presets/lib/presetNames.json', 'utf-8'));
const mdNameSet = new Set(mdNames);
console.log(`MilkDrop-Original: ${mdNames.length} presets (already have .milk sources)`);

// ── Step 3: Identify butterchurn-only presets that need sourcing ──
// All thematic names minus the MilkDrop names already sourced
const butterchurnOnly = thematicNames.filter((n) => !mdNameSet.has(n));
console.log(`Butterchurn-only (need .milk source): ${butterchurnOnly.length} presets`);

// ── Step 4: Build index of available .milk files ──
const milkFileIndex = new Map(); // name → full path (first match wins)

function indexDir(dir, depth = 0) {
  if (!existsSync(dir)) {
    if (depth === 0) console.warn(`  Warning: search dir not found: ${dir}`);
    return 0;
  }
  let count = 0;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (entry.endsWith('.milk')) {
      const name = entry.replace(/\.milk$/i, '');
      if (!milkFileIndex.has(name)) {
        milkFileIndex.set(name, fullPath);
        count++;
      }
    } else if (depth < 3) {
      try {
        if (statSync(fullPath).isDirectory() && !entry.startsWith('.')) {
          count += indexDir(fullPath, depth + 1);
        }
      } catch {
        // Permission errors etc
      }
    }
  }
  return count;
}

for (const dir of SEARCH_DIRS) {
  const count = indexDir(dir);
  console.log(`  Indexed ${count} new .milk files from ${dir}`);
}
console.log(`Total indexed: ${milkFileIndex.size} unique .milk files\n`);

// ── Step 4b: Build normalized index for fuzzy matching ──
// Handle: leading underscores, unicode apostrophes (′ vs '), trailing spaces
const normalizedIndex = new Map(); // normalizedName → original name in milkFileIndex
for (const name of milkFileIndex.keys()) {
  const norm = name
    .replace(/^_+/, '')
    .replace(/[\u2018\u2019\u2032\u2033]/g, "'")
    .trim();
  if (!normalizedIndex.has(norm)) normalizedIndex.set(norm, name);
  // Also index without leading underscore
  if (!normalizedIndex.has(name)) normalizedIndex.set(name, name);
}

function findMilkFile(presetName) {
  // Exact match
  if (milkFileIndex.has(presetName)) return milkFileIndex.get(presetName);
  // Without leading underscore
  const noUnderscore = presetName.replace(/^_+/, '');
  if (milkFileIndex.has(noUnderscore)) return milkFileIndex.get(noUnderscore);
  // Unicode apostrophe normalization
  const normalized = presetName
    .replace(/^_+/, '')
    .replace(/[\u2018\u2019\u2032\u2033]/g, "'")
    .trim();
  const indexedName = normalizedIndex.get(normalized);
  if (indexedName) return milkFileIndex.get(indexedName);
  return null;
}

// ── Step 5: Match butterchurn presets to .milk files ──
const matched = [];
const unmatched = [];

for (const name of butterchurnOnly) {
  const path = findMilkFile(name);
  if (path) {
    matched.push({ name, path });
  } else {
    unmatched.push(name);
  }
}

console.log(`\n=== RESULTS ===`);
console.log(`Matched: ${matched.length} / ${butterchurnOnly.length}`);
console.log(`Unmatched: ${unmatched.length}`);

if (unmatched.length > 0) {
  console.log(`\nUnmatched presets (no .milk source found):`);
  for (const name of unmatched) {
    console.log(`  - ${name}`);
  }
}

// ── Step 6: Also verify all MilkDrop-Original presets have .milk files ──
const mdMissing = mdNames.filter((n) => !milkFileIndex.has(n));
if (mdMissing.length > 0) {
  console.log(`\nWarning: ${mdMissing.length} MilkDrop-Original presets missing .milk files:`);
  for (const name of mdMissing) {
    console.log(`  - ${name}`);
  }
}

// ── Step 7: Copy if requested ──
if (doCopy) {
  mkdirSync(OUT_DIR, { recursive: true });
  let copied = 0;

  // Copy all matched butterchurn .milk files
  for (const { name, path } of matched) {
    const dest = join(OUT_DIR, `${name}.milk`);
    if (!existsSync(dest)) {
      copyFileSync(path, dest);
      copied++;
    }
  }

  // Also copy all MilkDrop-Original .milk files
  for (const name of mdNames) {
    const srcPath = findMilkFile(name);
    if (srcPath) {
      const dest = join(OUT_DIR, `${name}.milk`);
      if (!existsSync(dest)) {
        copyFileSync(srcPath, dest);
        copied++;
      }
    }
  }

  console.log(`\nCopied ${copied} .milk files to ${OUT_DIR}`);
} else {
  console.log(`\nDry run. Use --copy to copy matched .milk files.`);
}

// ── Step 8: Write report ──
const report = {
  totalThematic: thematicNames.length,
  milkdropOriginal: mdNames.length,
  butterchurnOnly: butterchurnOnly.length,
  matched: matched.length,
  unmatched: unmatched.length,
  unmatchedNames: unmatched,
  mdMissing: mdMissing,
};
writeFileSync('/tmp/preset-sourcing-report.json', JSON.stringify(report, null, 2));
console.log('\nReport written to /tmp/preset-sourcing-report.json');
