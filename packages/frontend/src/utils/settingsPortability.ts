import sjson from 'secure-json-parse';
import type { SettingsState } from '../store/useSettingsStore.ts';

const EXPORT_VERSION = 1;
const MAX_IMPORT_SIZE = 1_000_000; // 1MB

export interface ExportCategory {
  key: string;
  label: string;
  fields: (keyof SettingsState)[];
}

export const EXPORT_CATEGORIES: ExportCategory[] = [
  {
    key: 'rendering',
    label: 'Rendering',
    fields: ['performance'],
  },
  {
    key: 'audioAnalysis',
    label: 'Audio Smoothing & FFT',
    fields: ['audio'],
  },
  {
    key: 'eq',
    label: 'EQ',
    fields: ['eq'],
  },
  {
    key: 'autopilot',
    label: 'Autopilot',
    fields: ['autopilot'],
  },
  {
    key: 'display',
    label: 'Display & Volume',
    fields: ['presetNameDisplay', 'songInfoDisplay', 'transitionTime', 'volume'],
  },
  {
    key: 'favorites',
    label: 'Favorites',
    fields: ['favoritePresets'],
  },
  {
    key: 'blocked',
    label: 'Blocked Presets',
    fields: ['blockedPresets'],
  },
  {
    key: 'packs',
    label: 'Packs & Quarantine',
    fields: ['enabledPacks', 'showQuarantined', 'quarantineOverrides'],
  },
];

interface ExportMeta {
  version: number;
  exportedAt: string;
  source: 'mangowave';
}

type ExportData = Record<string, unknown> & { _meta: ExportMeta };

export function buildExport(state: SettingsState, selectedCategories: Set<string>): ExportData {
  const data: Record<string, unknown> = {};

  for (const category of EXPORT_CATEGORIES) {
    if (!selectedCategories.has(category.key)) continue;
    for (const field of category.fields) {
      data[field] = state[field];
    }
  }

  return {
    _meta: {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      source: 'mangowave',
    },
    ...data,
  };
}

export function downloadExport(data: ExportData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mangowave-settings.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ParseResult =
  | { ok: true; data: ExportData; categories: string[] }
  | { ok: false; error: string };

export function parseImportFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      resolve({ ok: false, error: 'File must be a .json file' });
      return;
    }

    if (file.size > MAX_IMPORT_SIZE) {
      resolve({ ok: false, error: 'File too large' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = sjson(reader.result as string);

        if (!parsed._meta || parsed._meta.source !== 'mangowave') {
          resolve({ ok: false, error: 'Not a MangoWave settings file' });
          return;
        }

        if (parsed._meta.version > EXPORT_VERSION) {
          resolve({ ok: false, error: 'Settings file is from a newer version' });
          return;
        }

        const detected: string[] = [];
        for (const category of EXPORT_CATEGORIES) {
          const hasAny = category.fields.some((field) => field in parsed);
          if (hasAny) detected.push(category.key);
        }

        resolve({ ok: true, data: parsed, categories: detected });
      } catch {
        resolve({ ok: false, error: 'Invalid settings file' });
      }
    };
    reader.onerror = () => resolve({ ok: false, error: 'Invalid settings file' });
    reader.readAsText(file);
  });
}

function clamp(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

function sanitizePerformance(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const p = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if ('fpsCap' in p) out.fpsCap = clamp(p.fpsCap, 0, 240, 0);
  if ('resolutionScale' in p) out.resolutionScale = clamp(p.resolutionScale, 0.25, 1.0, 1.0);
  if ('meshWidth' in p) out.meshWidth = clamp(p.meshWidth, 16, 128, 48);
  if ('meshHeight' in p) out.meshHeight = clamp(p.meshHeight, 12, 96, 36);
  if ('textureRatio' in p) out.textureRatio = clamp(p.textureRatio, 0.25, 2.0, 1.0);
  if ('fxaa' in p) out.fxaa = typeof p.fxaa === 'boolean' ? p.fxaa : false;
  return out;
}

function sanitizeAudio(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const a = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if ('smoothingConstant' in a) out.smoothingConstant = clamp(a.smoothingConstant, 0, 1, 0.3);
  if ('fftSize' in a) {
    const valid = [512, 1024, 2048, 4096];
    out.fftSize = valid.includes(a.fftSize as number) ? a.fftSize : 1024;
  }
  return out;
}

function sanitizeEQ(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const e = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if ('preAmpGain' in e) out.preAmpGain = clamp(e.preAmpGain, 0, 3, 1.5);
  if ('bandGains' in e && Array.isArray(e.bandGains)) {
    const gains = e.bandGains.slice(0, 10).map((g) => clamp(g, -12, 12, 0));
    while (gains.length < 10) gains.push(0);
    out.bandGains = gains;
  }
  return out;
}

function sanitizeAutopilot(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const a = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if ('enabled' in a) out.enabled = typeof a.enabled === 'boolean' ? a.enabled : true;
  if ('interval' in a) out.interval = clamp(a.interval, 5, 120, 15);
  if ('mode' in a) out.mode = a.mode === 'favorites' ? 'favorites' : 'all';
  if ('favoriteWeight' in a) out.favoriteWeight = clamp(a.favoriteWeight, 1, 10, 2);
  return out;
}

function sanitizeStringArray(raw: unknown, maxLength: number): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((s): s is string => typeof s === 'string').slice(0, maxLength);
}

const SANITIZERS: Record<string, (val: unknown) => unknown> = {
  performance: sanitizePerformance,
  audio: sanitizeAudio,
  eq: sanitizeEQ,
  autopilot: sanitizeAutopilot,
  favoritePresets: (v) => sanitizeStringArray(v, 10_000),
  blockedPresets: (v) => sanitizeStringArray(v, 10_000),
  enabledPacks: (v) => sanitizeStringArray(v, 100),
  quarantineOverrides: (v) => sanitizeStringArray(v, 10_000),
  presetNameDisplay: (v) => {
    if (v === 'off' || v === 'always') return v;
    if (typeof v === 'number' && isFinite(v)) return Math.min(10, Math.max(1, Math.round(v)));
    return 5;
  },
  songInfoDisplay: (v) => {
    if (v === 'off' || v === 'always') return v;
    if (typeof v === 'number' && isFinite(v)) return Math.min(10, Math.max(1, Math.round(v)));
    return 5;
  },
  transitionTime: (v) => clamp(v, 0, 10, 2.0),
  volume: (v) => clamp(v, 0, 1, 0.5),
  showQuarantined: (v) => (typeof v === 'boolean' ? v : false),
};

export function buildImportPayload(
  data: ExportData,
  selectedCategories: Set<string>,
): Partial<SettingsState> {
  const payload: Record<string, unknown> = {};

  for (const category of EXPORT_CATEGORIES) {
    if (!selectedCategories.has(category.key)) continue;
    for (const field of category.fields) {
      if (field in data) {
        const sanitizer = SANITIZERS[field];
        const sanitized = sanitizer ? sanitizer(data[field]) : undefined;
        if (sanitized !== undefined) {
          payload[field] = sanitized;
        }
      }
    }
  }

  return payload as Partial<SettingsState>;
}
