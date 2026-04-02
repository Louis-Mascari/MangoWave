import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

const IDB_MILK_PREFIX = 'mw-milk:';
const IDB_CONV_PREFIX = 'mw-conv:';

export interface ImportedPresetsState {
  loaded: boolean;

  loadFromIdb: () => Promise<void>;
  addPreset: (name: string, milkText: string) => Promise<void>;
  removePreset: (name: string) => Promise<void>;
  removeAllPresets: () => Promise<void>;
  getConvertedPreset: (name: string) => Promise<object | null>;
}

export const useImportedPresetsStore = create<ImportedPresetsState>()((set, _get) => ({
  loaded: false,

  loadFromIdb: async () => {
    try {
      // Just mark as loaded — raw texts and converted results stay in IDB, read on demand
      set({ loaded: true });
    } catch (err) {
      console.error('Failed to load imported presets from IDB:', err);
      set({ loaded: true });
    }
  },

  addPreset: async (name, milkText) => {
    await idbSet(`${IDB_MILK_PREFIX}${name}`, milkText);
  },

  removePreset: async (name) => {
    await idbDel(`${IDB_MILK_PREFIX}${name}`);
    await idbDel(`${IDB_CONV_PREFIX}${name}`);
  },

  removeAllPresets: async () => {
    const allKeys = await idbKeys();
    const toDelete = (allKeys as string[]).filter(
      (key) => key.startsWith(IDB_MILK_PREFIX) || key.startsWith(IDB_CONV_PREFIX),
    );
    await Promise.all(toDelete.map((key) => idbDel(key)));
  },

  getConvertedPreset: async (name: string) => {
    try {
      // Try cached converted result first
      const cached = await idbGet<object>(`${IDB_CONV_PREFIX}${name}`);
      if (cached) return cached;

      // Fallback: convert from raw .milk text (backwards compat + first access after import)
      const text = await idbGet<string>(`${IDB_MILK_PREFIX}${name}`);
      if (!text) return null;

      const { convertInWorker } = await import('../engine/conversionWorkerManager.ts');
      const { validatePreset } = await import('../engine/milkdropConverter.ts');
      const preset = await convertInWorker(name, text);
      validatePreset(preset);

      // Persist converted result for instant future access
      await idbSet(`${IDB_CONV_PREFIX}${name}`, preset);
      return preset;
    } catch (err) {
      console.error(`Failed to convert preset "${name}":`, err);
      return null;
    }
  },
}));

// Eagerly mark as loaded on module init.
// This is a fire-and-forget promise — the store's `loaded` flag tracks completion.
useImportedPresetsStore.getState().loadFromIdb();
