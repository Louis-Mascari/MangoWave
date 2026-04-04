import posthog from 'posthog-js';
import * as Sentry from '@sentry/react';
import sjson from 'secure-json-parse';
import { get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';
import type { SettingsState } from '../store/useSettingsStore.ts';
import i18n from '../i18n/index.ts';

const EXPORT_VERSION = 1;
const MAX_IMPORT_SIZE = 50_000_000; // 50MB (accommodates exported texture data)

export interface ExportCategory {
  key: string;
  labelKey: string;
  fields: (keyof SettingsState)[];
}

export const EXPORT_CATEGORIES: ExportCategory[] = [
  {
    key: 'rendering',
    labelKey: 'data.categoryRendering',
    fields: ['performance'],
  },
  {
    key: 'audioAnalysis',
    labelKey: 'data.categoryAudioAnalysis',
    fields: ['audio'],
  },
  {
    key: 'eq',
    labelKey: 'data.categoryEq',
    fields: ['eq'],
  },
  {
    key: 'autopilot',
    labelKey: 'data.categoryAutopilot',
    fields: ['autopilot'],
  },
  {
    key: 'display',
    labelKey: 'data.categoryDisplay',
    fields: ['presetNameDisplay', 'songInfoDisplay', 'transitionTime', 'volume', 'brightness'],
  },
  {
    key: 'favorites',
    labelKey: 'data.categoryFavorites',
    fields: ['favoritePresets'],
  },
  {
    key: 'blocked',
    labelKey: 'data.categoryBlocked',
    fields: ['blockedPresets'],
  },
  {
    key: 'packs',
    labelKey: 'data.categoryPacks',
    fields: ['enabledPacks', 'excludedOverrides', 'customPacks', 'activeCustomPackId'],
  },
  {
    key: 'sync',
    labelKey: 'data.categorySync',
    fields: ['windowSyncEnabled', 'syncPerformance'],
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

/**
 * Build an export with optional embedded imported preset/texture data from IDB.
 * When includeImported is true, raw .milk texts and texture data URIs are embedded
 * alongside their metadata, enabling cross-device transfer.
 */
export async function buildExportWithImportedData(
  state: SettingsState,
  selectedCategories: Set<string>,
  includeImported: boolean,
): Promise<ExportData> {
  const data = buildExport(state, selectedCategories);

  if (!includeImported) return data;

  const allIdbKeys = await idbKeys();
  const presetData: Record<string, string> = {};
  const textureData: Record<string, unknown> = {};

  for (const key of allIdbKeys as string[]) {
    if (key.startsWith('mw-milk:')) {
      const name = key.slice(8);
      const text = await idbGet<string>(key);
      if (text) presetData[name] = text;
    } else if (key.startsWith('mw-tex:')) {
      const name = key.slice(7);
      const val = await idbGet(key);
      if (val) textureData[name] = val;
    }
  }

  data.importedPresets = state.importedPresets;
  data.importedTextures = state.importedTextures;
  data._importedData = { presets: presetData, textures: textureData };

  return data;
}

/** Estimate the byte size of all imported preset and texture data in IDB. */
export async function estimateImportedDataSize(): Promise<number> {
  const allIdbKeys = await idbKeys();
  let total = 0;

  for (const key of allIdbKeys as string[]) {
    if (key.startsWith('mw-milk:')) {
      const text = await idbGet<string>(key);
      if (text) total += new Blob([text]).size;
    } else if (key.startsWith('mw-tex:')) {
      const val = await idbGet(key);
      if (val) total += new Blob([JSON.stringify(val)]).size;
    }
  }

  return total;
}

/**
 * Restore imported preset and texture data from a settings export.
 * Writes raw .milk texts to IDB, converts each via Worker, and restores texture data.
 */
export async function restoreImportedData(
  data: Record<string, unknown>,
  _state: SettingsState,
): Promise<void> {
  const imported = data._importedData as {
    presets?: Record<string, string>;
    textures?: Record<string, unknown>;
  };
  if (!imported) return;

  const { convertInWorker } = await import('../engine/conversionWorkerManager.ts');

  // Restore presets
  if (imported.presets) {
    for (const [name, text] of Object.entries(imported.presets)) {
      if (typeof text !== 'string') continue;
      await idbSet(`mw-milk:${name}`, text);
      try {
        const converted = await convertInWorker(name, text);
        await idbSet(`mw-conv:${name}`, converted);
      } catch {
        // Conversion failure is non-fatal — user can trigger re-conversion on selection
      }
    }
  }

  // Restore textures — validate shape matches what textureLoader produces
  if (imported.textures) {
    for (const [name, val] of Object.entries(imported.textures)) {
      if (
        !val ||
        typeof val !== 'object' ||
        typeof (val as Record<string, unknown>).data !== 'string' ||
        typeof (val as Record<string, unknown>).width !== 'number' ||
        typeof (val as Record<string, unknown>).height !== 'number'
      )
        continue;
      await idbSet(`mw-tex:${name}`, val);
    }
  }

  // Restore metadata to settings store
  const { useSettingsStore } = await import('../store/useSettingsStore.ts');
  const metaPayload: Record<string, unknown> = {};
  if (data.importedPresets) {
    const sanitized = SANITIZERS.importedPresets(data.importedPresets);
    if (sanitized) metaPayload.importedPresets = sanitized;
  }
  if (data.importedTextures) {
    const sanitized = SANITIZERS.importedTextures(data.importedTextures);
    if (sanitized) metaPayload.importedTextures = sanitized;
  }
  if (Object.keys(metaPayload).length > 0) {
    useSettingsStore.getState().importSettings(metaPayload as Partial<SettingsState>);
  }
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
  | { ok: true; data: ExportData; categories: string[]; versionWarning?: string }
  | { ok: false; error: string };

export function parseImportFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const t = i18n.getFixedT(null, 'messages');

    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      captureImportFailure('File must be a .json file');
      resolve({ ok: false, error: t('settingsImport.mustBeJson') });
      return;
    }

    if (file.size > MAX_IMPORT_SIZE) {
      captureImportFailure('File too large');
      resolve({ ok: false, error: t('settingsImport.fileTooLarge') });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = sjson(reader.result as string);

        if (!parsed._meta || parsed._meta.source !== 'mangowave') {
          const isPackFile = parsed._meta?.source === 'mangowave-pack';
          captureImportFailure(isPackFile ? 'Pack file, not settings' : 'Not a MangoWave file');
          resolve({
            ok: false,
            error: isPackFile ? t('customPacks.notPackFile') : t('settingsImport.notMangoWaveFile'),
          });
          return;
        }

        // Map renamed fields from older exports
        if ('quarantineOverrides' in parsed && !('excludedOverrides' in parsed)) {
          parsed.excludedOverrides = parsed.quarantineOverrides;
          delete parsed.quarantineOverrides;
        }

        const detected: string[] = [];
        for (const category of EXPORT_CATEGORIES) {
          const hasAny = category.fields.some((field) => field in parsed);
          if (hasAny) detected.push(category.key);
        }
        // Detect embedded imported data (cross-device transfer)
        if ('_importedData' in parsed) {
          if (!detected.includes('packs')) detected.push('packs');
        }

        const versionWarning =
          parsed._meta.version > EXPORT_VERSION ? t('settingsImport.newerVersion') : undefined;

        resolve({ ok: true, data: parsed, categories: detected, versionWarning });
      } catch {
        captureImportFailure('Invalid settings file');
        resolve({ ok: false, error: t('settingsImport.invalidFile') });
      }
    };
    reader.onerror = () => {
      captureImportFailure(t('settingsImport.invalidFile'));
      resolve({ ok: false, error: t('settingsImport.invalidFile') });
    };
    reader.readAsText(file);
  });
}

function captureImportFailure(reason: string): void {
  if (posthog.__loaded) {
    posthog.capture('settings_import_failed', { reason });
  }
  Sentry.captureMessage('settings_import_failed', {
    level: 'warning',
    extra: { reason },
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
  if ('fpsCap' in p) {
    const clamped = Math.round(clamp(p.fpsCap, 0, 300, 0));
    out.fpsCap = clamped > 0 && clamped < 15 ? 15 : clamped;
  }
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
  favoritePresets: (v) => sanitizeStringArray(v, 500),
  blockedPresets: (v) => sanitizeStringArray(v, 500),
  enabledPacks: (v) => sanitizeStringArray(v, 100),
  excludedOverrides: (v) => sanitizeStringArray(v, 500),
  presetNameDisplay: (v) => {
    if (v === 'off' || v === 'always') return v;
    if (typeof v === 'number' && isFinite(v)) return Math.min(10, Math.max(1, Math.round(v)));
    return 5;
  },
  songInfoDisplay: (v) => {
    if (v === 'off') return v;
    // Accept 'always' from older exports gracefully — treat as enabled (5s)
    if (v === 'always') return 5;
    if (typeof v === 'number' && isFinite(v)) return Math.min(10, Math.max(1, Math.round(v)));
    return 5;
  },
  transitionTime: (v) => clamp(v, 0, 10, 2.0),
  volume: (v) => clamp(v, 0, 1, 0.5),
  brightness: (v) => clamp(v, 0.1, 1, 1.0),
  customPacks: (v) => {
    if (!Array.isArray(v)) return undefined;
    return v
      .filter(
        (p): p is Record<string, unknown> =>
          !!p && typeof p === 'object' && !Array.isArray(p) && typeof p.id === 'string',
      )
      .slice(0, 50)
      .map((p) => ({
        id: typeof p.id === 'string' ? p.id : crypto.randomUUID(),
        name: typeof p.name === 'string' ? (p.name as string).slice(0, 50) : 'Imported Pack',
        presets: Array.isArray(p.presets)
          ? (p.presets as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 500)
          : [],
        createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
      }));
  },
  activeCustomPackId: (v) => (typeof v === 'string' || v === null ? v : null),
  importedPresets: (v) => {
    if (!Array.isArray(v)) return undefined;
    return v
      .filter(
        (p): p is Record<string, unknown> =>
          !!p && typeof p === 'object' && !Array.isArray(p) && typeof p.name === 'string',
      )
      .map((p) => ({
        name: (p.name as string).slice(0, 200),
        fileName: typeof p.fileName === 'string' ? (p.fileName as string).slice(0, 200) : '',
        addedAt: typeof p.addedAt === 'number' ? p.addedAt : Date.now(),
      }));
  },
  importedTextures: (v) => {
    if (!Array.isArray(v)) return undefined;
    return v
      .filter(
        (p): p is Record<string, unknown> =>
          !!p && typeof p === 'object' && !Array.isArray(p) && typeof p.name === 'string',
      )
      .map((p) => ({
        name: (p.name as string).slice(0, 200),
        fileName: typeof p.fileName === 'string' ? (p.fileName as string).slice(0, 200) : '',
        width: typeof p.width === 'number' && isFinite(p.width as number) ? p.width : 0,
        height: typeof p.height === 'number' && isFinite(p.height as number) ? p.height : 0,
        sizeBytes:
          typeof p.sizeBytes === 'number' && isFinite(p.sizeBytes as number) ? p.sizeBytes : 0,
        addedAt: typeof p.addedAt === 'number' ? p.addedAt : Date.now(),
      }));
  },
  windowSyncEnabled: (v) => (typeof v === 'boolean' ? v : false),
  syncPerformance: (v) => (typeof v === 'boolean' ? v : true),
};

export interface ImportResult {
  payload: Partial<SettingsState>;
  warnings: string[];
}

export function buildImportPayload(
  data: ExportData,
  selectedCategories: Set<string>,
): ImportResult {
  const payload: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const category of EXPORT_CATEGORIES) {
    if (!selectedCategories.has(category.key)) continue;
    for (const field of category.fields) {
      if (field in data) {
        const sanitizer = SANITIZERS[field];
        const sanitized = sanitizer ? sanitizer(data[field]) : undefined;
        if (sanitized !== undefined) {
          payload[field] = sanitized;
        } else {
          warnings.push(i18n.t('settingsImport.fieldNotApplied', { field, ns: 'messages' }));
        }
      }
    }
  }

  return { payload: payload as Partial<SettingsState>, warnings };
}

// --- Standalone pack export/import ---

interface PackExportMeta {
  version: number;
  exportedAt: string;
  source: 'mangowave-pack';
}

export interface PackExportData {
  _meta: PackExportMeta;
  name: string;
  presets: string[];
}

export function buildPackExport(pack: { name: string; presets: string[] }): PackExportData {
  return {
    _meta: {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: 'mangowave-pack',
    },
    name: pack.name,
    presets: pack.presets,
  };
}

export function downloadPackExport(data: PackExportData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mangowave-pack-${data.name
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type PackParseResult =
  | { ok: true; name: string; presets: string[] }
  | { ok: false; error: string };

export function parsePackImportFile(file: File): Promise<PackParseResult> {
  return new Promise((resolve) => {
    const t = i18n.getFixedT(null, 'messages');

    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      resolve({ ok: false, error: t('settingsImport.mustBeJson') });
      return;
    }

    if (file.size > MAX_IMPORT_SIZE) {
      resolve({ ok: false, error: t('settingsImport.fileTooLarge') });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = sjson(reader.result as string);

        if (!parsed._meta || parsed._meta.source !== 'mangowave-pack') {
          const isSettingsFile = parsed._meta?.source === 'mangowave';
          resolve({
            ok: false,
            error: isSettingsFile
              ? t('customPacks.settingsFileNotPack')
              : t('customPacks.notPackFile'),
          });
          return;
        }

        const name =
          typeof parsed.name === 'string' ? (parsed.name as string).slice(0, 50) : 'Imported Pack';
        const presets = Array.isArray(parsed.presets)
          ? parsed.presets.filter((s: unknown): s is string => typeof s === 'string').slice(0, 500)
          : [];

        resolve({ ok: true, name, presets });
      } catch {
        resolve({ ok: false, error: t('settingsImport.invalidFile') });
      }
    };
    reader.onerror = () => {
      resolve({ ok: false, error: t('settingsImport.invalidFile') });
    };
    reader.readAsText(file);
  });
}
