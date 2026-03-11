import { scan as sjpScan } from 'secure-json-parse';

const MAX_MILK_FILE_SIZE = 512_000; // 500KB

// Allowlist of identifiers permitted in EEL equation strings.
// MilkDrop EEL uses math ops, trig functions, and preset variables.
const BLOCKED_IDENTIFIERS = [
  'fetch',
  'import',
  'require',
  'document',
  'window',
  'eval',
  'Function',
  'XMLHttpRequest',
  'WebSocket',
  'globalThis',
  'process',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'postMessage',
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'crypto',
  'Blob',
  'URL',
  'atob',
  'btoa',
];

const BLOCKED_PATTERN = new RegExp(`\\b(${BLOCKED_IDENTIFIERS.join('|')})\\b`, 'i');

function validateEquationStrings(preset: Record<string, unknown>): void {
  const eqFields = [
    'init_eqs_str',
    'frame_eqs_str',
    'pixel_eqs_str',
    'per_frame_init_eqs_str',
    'per_frame_eqs_str',
    'per_pixel_eqs_str',
  ];

  for (const field of eqFields) {
    const value = preset[field];
    if (typeof value === 'string' && BLOCKED_PATTERN.test(value)) {
      throw new Error(`Suspicious code detected in ${field}`);
    }
  }

  // Check shapes and waves arrays
  for (const arrayField of ['shapes', 'waves']) {
    const arr = preset[arrayField];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === 'object' && item !== null) {
          validateEquationStrings(item as Record<string, unknown>);
        }
      }
    }
  }
}

export async function convertMilkFile(file: File): Promise<{ name: string; preset: object }> {
  if (file.size > MAX_MILK_FILE_SIZE) {
    throw new Error(`File too large: ${file.name} (max 500KB)`);
  }

  const text = await file.text();

  // Lazy-load the converter (zero main bundle impact)
  const { convertPreset } = await import('milkdrop-preset-converter');

  const converted = convertPreset(text);

  // Sanitize against prototype pollution using secure-json-parse's scan.
  // scan() operates on an already-parsed object — it strips __proto__ and
  // constructor.prototype keys that could pollute Object.prototype.
  const sanitized = sjpScan(converted as Record<string, unknown>, {
    protoAction: 'remove',
    constructorAction: 'remove',
  }) as Record<string, unknown>;

  // Validate equation strings for suspicious code
  validateEquationStrings(sanitized);

  // Derive name from filename (strip .milk extension)
  const name = file.name.replace(/\.milk$/i, '');

  return { name, preset: sanitized };
}
