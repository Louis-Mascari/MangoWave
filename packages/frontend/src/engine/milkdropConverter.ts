import { getNames as getMilkdropTextureNames } from 'milkdrop-textures';
import sjson from 'secure-json-parse';

const MAX_FILE_SIZE = 500_000; // 500KB
const VALID_EXTENSIONS = ['.milk'];

/** Read a .milk file, validate size/extension, return raw text + derived name.
 *  Throws short error codes ('invalidFileType', 'fileTooLarge', 'emptyFile')
 *  for i18n resolution in the UI layer. */
export async function readMilkFile(file: File): Promise<{ name: string; text: string }> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!VALID_EXTENSIONS.includes(ext)) {
    throw new Error('invalidFileType');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('fileTooLarge');
  }
  if (file.size === 0) {
    throw new Error('emptyFile');
  }

  const text = await file.text();
  const name = file.name.replace(/\.milk$/i, '');
  return { name, text };
}

// Built-in sampler names that butterchurn always provides (no user texture needed)
const BUILTIN_SAMPLERS = new Set([
  'main',
  'fw_main',
  'fc_main',
  'pw_main',
  'pc_main',
  'noise_lq',
  'noise_lq_lite',
  'noise_mq',
  'noise_hq',
  'noisevol_lq',
  'noisevol_hq',
  'pw_noise_lq',
  'blur',
  'blur1',
  'blur2',
  'blur3',
]);

// Extra images: 6 from butterchurnExtraImages + 66 from milkdrop-textures (with case variants)
export const BUILTIN_EXTRA_IMAGES = new Set([
  'cells',
  'lichen',
  'mage',
  'prayerwheel',
  'seaweed',
  'smalltiled_lizard_scales',
  ...getMilkdropTextureNames(),
]);

/** Parse PSVERSION from raw .milk text. Returns the max of warp/comp/global versions, or 0 if absent. */
export function parsePsVersion(milkText: string): number {
  let max = 0;
  const re = /^PSVERSION(?:_WARP|_COMP)?=(\d+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(milkText)) !== null) {
    const v = parseInt(m[1], 10);
    if (v > max) max = v;
  }
  return max;
}

// Wrap/clamp filter prefixes: fw_ (bilinear+wrap), fc_ (bilinear+clamp),
// pw_ (point+wrap), pc_ (point+clamp). Strip before texture lookup.
const WRAP_PREFIX_RE = /^(?:fw|fc|pw|pc)_/;
// Random texture selectors (rand00–rand15). butterchurn doesn't implement these,
// but they're not real texture files — exclude from missing warnings.
const RAND_TEXTURE_RE = /^rand\d{2}/;

/** Extract custom texture names from a converted preset object's shader code.
 *  Returns texture names that aren't built-in and aren't in the provided loaded set.
 *  Handles case-insensitive matching, wrap/clamp prefixes, and rand selectors. */
export function findMissingTextures(preset: object, loadedTextures: ReadonlySet<string>): string[] {
  const content = JSON.stringify(preset);
  const refs = new Set<string>();
  const re = /sampler_(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    refs.add(m[1]);
  }

  // Build case-insensitive lookup set from all known textures
  const knownLower = new Set<string>();
  for (const s of BUILTIN_SAMPLERS) knownLower.add(s.toLowerCase());
  for (const s of BUILTIN_EXTRA_IMAGES) knownLower.add(s.toLowerCase());
  for (const s of loadedTextures) knownLower.add(s.toLowerCase());

  const missing: string[] = [];
  for (const name of refs) {
    // Skip random texture selectors (butterchurn doesn't support them)
    if (RAND_TEXTURE_RE.test(name)) continue;

    // Strip wrap/clamp prefix for lookup: fw_fire_base → fire_base
    const baseName = name.replace(WRAP_PREFIX_RE, '');
    const lookupKey = baseName.toLowerCase();

    if (!knownLower.has(lookupKey)) {
      missing.push(baseName);
    }
  }
  // Deduplicate (fw_X and pc_X → one entry for X) and sort
  return [...new Set(missing)].sort();
}

/** Security scan of a converted preset object. Throws on suspicious content. */
export function validatePreset(preset: object): void {
  // Run secure-json-parse scan for prototype pollution.
  // EEL string scanning is no longer needed — eel-wasm compiles EEL to a WASM
  // sandbox that cannot access JS globals, DOM, or network APIs.
  sjson.scan(preset);
}
