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
    label: 'Audio Analysis',
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
    label: 'Display',
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
    label: 'Pack Settings',
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
    if (file.size > MAX_IMPORT_SIZE) {
      resolve({ ok: false, error: 'File too large' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);

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

export function buildImportPayload(
  data: ExportData,
  selectedCategories: Set<string>,
): Partial<SettingsState> {
  const payload: Record<string, unknown> = {};

  for (const category of EXPORT_CATEGORIES) {
    if (!selectedCategories.has(category.key)) continue;
    for (const field of category.fields) {
      if (field in data) {
        payload[field] = data[field];
      }
    }
  }

  return payload as Partial<SettingsState>;
}
