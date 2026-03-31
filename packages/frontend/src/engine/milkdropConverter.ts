import sjson from 'secure-json-parse';

const MAX_FILE_SIZE = 500_000; // 500KB
const VALID_EXTENSIONS = ['.milk'];

// Blocked identifiers in EEL equation strings — prevents script injection
const BLOCKED_IDENTIFIERS =
  /\b(fetch|eval|Function|WebSocket|localStorage|sessionStorage|indexedDB|XMLHttpRequest|importScripts|document|window|globalThis|self|top|parent|frames)\b/;

// Vite 8 CJS interop — same pattern as VisualizerRenderer.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = <T>(mod: T): T => (mod as any).default ?? mod;

let converterPromise: Promise<(text: string) => object> | null = null;

/** Lazy-load milkdrop-preset-converter (zero main-bundle cost). */
function getConverter(): Promise<(text: string) => object> {
  if (!converterPromise) {
    converterPromise = import('milkdrop-preset-converter').then((mod) => {
      const resolved = unwrap(mod);
      // The module exports { convertPreset, convertShader, ... } — extract the function
      const fn =
        typeof resolved === 'function'
          ? resolved
          : (resolved as Record<string, unknown>).convertPreset;
      if (typeof fn !== 'function') {
        throw new Error('milkdrop-preset-converter: convertPreset not found');
      }
      return fn as (text: string) => object;
    });
  }
  return converterPromise!;
}

/** Convert raw .milk text to a butterchurn preset object. */
export async function convertMilkText(text: string): Promise<object> {
  const convertPreset = await getConverter();
  return convertPreset(text);
}

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

/** Recursively scan all string values in an object for blocked identifiers. Throws on suspicious content. */
function scanAllStrings(obj: unknown): void {
  if (typeof obj === 'string') {
    if (BLOCKED_IDENTIFIERS.test(obj)) {
      throw new Error('securityBlocked');
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) scanAllStrings(item);
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const val of Object.values(obj)) scanAllStrings(val);
  }
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

// Extra images bundled with butterchurnExtraImages
export const BUILTIN_EXTRA_IMAGES = new Set([
  'cells',
  'lichen',
  'mage',
  'prayerwheel',
  'seaweed',
  'smalltiled_lizard_scales',
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

/** Extract custom texture names from a converted preset object's shader code.
 *  Returns texture names that aren't built-in and aren't in the provided loaded set. */
export function findMissingTextures(preset: object, loadedTextures: ReadonlySet<string>): string[] {
  const content = JSON.stringify(preset);
  const refs = new Set<string>();
  const re = /sampler_(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    refs.add(m[1]);
  }

  const missing: string[] = [];
  for (const name of refs) {
    if (
      !BUILTIN_SAMPLERS.has(name) &&
      !BUILTIN_EXTRA_IMAGES.has(name) &&
      !loadedTextures.has(name)
    ) {
      missing.push(name);
    }
  }
  return missing.sort();
}

/** Security scan of a converted preset object. Throws on suspicious content. */
export function validatePreset(preset: object): void {
  // Run secure-json-parse scan for prototype pollution
  sjson.scan(preset);

  // Recursively scan all string values for blocked identifiers
  scanAllStrings(preset);
}
