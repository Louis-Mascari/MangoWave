import sjson from 'secure-json-parse';

const MAX_FILE_SIZE = 500_000; // 500KB
const VALID_EXTENSIONS = ['.milk'];

// Blocked identifiers in EEL equation strings — prevents script injection
const BLOCKED_IDENTIFIERS =
  /\b(fetch|eval|Function|WebSocket|localStorage|sessionStorage|indexedDB|XMLHttpRequest|importScripts|document|window|globalThis|self|top|parent|frames)\b/;

// EEL equation fields to scan (top-level + nested shapes/waves)
const EEL_FIELDS = [
  'init_eqs_str',
  'frame_eqs_str',
  'pixel_eqs_str',
  'per_frame_init_eqs_str',
  'per_frame_eqs_str',
  'per_pixel_eqs_str',
];

// Vite 8 CJS interop — same pattern as VisualizerRenderer.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = <T>(mod: T): T => (mod as any).default ?? mod;

let converterPromise: Promise<(text: string) => object> | null = null;

/** Lazy-load milkdrop-preset-converter (zero main-bundle cost). */
function getConverter(): Promise<(text: string) => object> {
  if (!converterPromise) {
    converterPromise = import('milkdrop-preset-converter').then(
      (mod) => unwrap(mod) as unknown as (text: string) => object,
    );
  }
  return converterPromise!;
}

/** Convert raw .milk text to a butterchurn preset object. */
export async function convertMilkText(text: string): Promise<object> {
  const convertPreset = await getConverter();
  return convertPreset(text);
}

/** Read a .milk file, validate size/extension, return raw text + derived name. */
export async function readMilkFile(file: File): Promise<{ name: string; text: string }> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!VALID_EXTENSIONS.includes(ext)) {
    throw new Error(`Invalid file type: ${ext}. Expected .milk`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${Math.round(file.size / 1024)}KB). Maximum is 500KB.`);
  }
  if (file.size === 0) {
    throw new Error('File is empty');
  }

  const text = await file.text();
  const name = file.name.replace(/\.milk$/i, '');
  return { name, text };
}

/** Scan EEL equation strings in a preset for blocked identifiers. Throws on suspicious content. */
function scanEelStrings(obj: Record<string, unknown>, path: string): void {
  for (const field of EEL_FIELDS) {
    const val = obj[field];
    if (typeof val === 'string' && BLOCKED_IDENTIFIERS.test(val)) {
      throw new Error(`Blocked identifier found in ${path}.${field}`);
    }
  }
}

/** Security scan of a converted preset object. Throws on suspicious content. */
export function validatePreset(preset: object): void {
  // Run secure-json-parse scan for prototype pollution
  sjson.scan(preset);

  const p = preset as Record<string, unknown>;

  // Scan top-level EEL fields
  scanEelStrings(p, 'preset');

  // Scan nested shapes and waves arrays
  for (const container of ['shapes', 'waves']) {
    const arr = p[container];
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] && typeof arr[i] === 'object') {
          scanEelStrings(arr[i] as Record<string, unknown>, `preset.${container}[${i}]`);
        }
      }
    }
  }
}
