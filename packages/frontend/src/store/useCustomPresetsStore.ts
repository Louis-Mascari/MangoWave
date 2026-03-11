import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

const IDB_PREFIX = 'mw-preset:';

export interface CustomPresetMeta {
  name: string;
  source: 'milk-import' | 'json-import';
  addedAt: number;
}

interface CustomPresetsState {
  /** Metadata only — preset JSON blobs live in IndexedDB */
  presets: CustomPresetMeta[];
  loaded: boolean;

  loadFromIdb: () => Promise<void>;
  addPreset: (name: string, preset: object, source: CustomPresetMeta['source']) => Promise<void>;
  removePreset: (name: string) => Promise<void>;
  getPresetData: (name: string) => Promise<object | undefined>;
  getAllPresetData: () => Promise<Map<string, object>>;
}

function deduplicateName(name: string, existing: Set<string>): string {
  if (!existing.has(name)) return name;
  let counter = 2;
  while (existing.has(`${name} (${counter})`)) counter++;
  return `${name} (${counter})`;
}

export const useCustomPresetsStore = create<CustomPresetsState>((set, get) => ({
  presets: [],
  loaded: false,

  loadFromIdb: async () => {
    const allKeys = await idbKeys();
    const presetKeys = (allKeys as string[]).filter((k) => k.startsWith(IDB_PREFIX));

    const metas: CustomPresetMeta[] = [];
    for (const key of presetKeys) {
      const data = await idbGet(key);
      if (data && typeof data === 'object' && 'meta' in data) {
        metas.push((data as { meta: CustomPresetMeta }).meta);
      }
    }

    set({ presets: metas, loaded: true });
  },

  addPreset: async (name, preset, source) => {
    const state = get();
    const existingNames = new Set(state.presets.map((p) => p.name));
    const finalName = deduplicateName(name, existingNames);

    const meta: CustomPresetMeta = {
      name: finalName,
      source,
      addedAt: Date.now(),
    };

    await idbSet(`${IDB_PREFIX}${finalName}`, { meta, preset });
    set((s) => ({ presets: [...s.presets, meta] }));
  },

  removePreset: async (name) => {
    await idbDel(`${IDB_PREFIX}${name}`);
    set((s) => ({ presets: s.presets.filter((p) => p.name !== name) }));
  },

  getPresetData: async (name) => {
    const data = await idbGet(`${IDB_PREFIX}${name}`);
    if (data && typeof data === 'object' && 'preset' in data) {
      return (data as { preset: object }).preset;
    }
    return undefined;
  },

  getAllPresetData: async () => {
    const allKeys = await idbKeys();
    const presetKeys = (allKeys as string[]).filter((k) => k.startsWith(IDB_PREFIX));
    const result = new Map<string, object>();

    for (const key of presetKeys) {
      const data = await idbGet(key);
      if (data && typeof data === 'object' && 'meta' in data && 'preset' in data) {
        const entry = data as { meta: CustomPresetMeta; preset: object };
        result.set(entry.meta.name, entry.preset);
      }
    }

    return result;
  },
}));
