import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

const IDB_MILK_PREFIX = 'mw-milk:';

export interface ImportedPresetsState {
  loaded: boolean;

  loadFromIdb: () => Promise<void>;
  addPreset: (name: string, milkText: string) => Promise<void>;
  removePreset: (name: string) => Promise<void>;
  removeAllPresets: () => Promise<void>;
  getMilkText: (name: string) => Promise<string | null>;
}

export const useImportedPresetsStore = create<ImportedPresetsState>()((set, _get) => ({
  loaded: false,

  loadFromIdb: async () => {
    try {
      // Clean up legacy mw-conv:* entries from the butterchurn era
      const allKeys = await idbKeys();
      const legacyKeys = (allKeys as string[]).filter((k) => k.startsWith('mw-conv:'));
      if (legacyKeys.length > 0) {
        await Promise.all(legacyKeys.map((k) => idbDel(k)));
        localStorage.removeItem('mw-conv-version');
      }

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
  },

  removeAllPresets: async () => {
    const allKeys = await idbKeys();
    const toDelete = (allKeys as string[]).filter((key) => key.startsWith(IDB_MILK_PREFIX));
    await Promise.all(toDelete.map((key) => idbDel(key)));
  },

  getMilkText: async (name: string) => {
    try {
      const text = await idbGet<string>(`${IDB_MILK_PREFIX}${name}`);
      return text ?? null;
    } catch (err) {
      console.error(`Failed to read .milk text for "${name}":`, err);
      return null;
    }
  },
}));

// Eagerly mark as loaded on module init.
useImportedPresetsStore.getState().loadFromIdb();
