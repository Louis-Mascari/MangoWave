import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

const IDB_MILK_PREFIX = 'mw-milk:';
const IDB_CONV_PREFIX = 'mw-conv:';
const CONV_VERSION_KEY = 'mw-conv-version';
const CONV_VERSION = 23; // v23 = bare int→float declaration conversion in hlslparser output

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
      // Invalidate old JS-format cached conversions (pre-eel-wasm)
      const version = localStorage.getItem(CONV_VERSION_KEY);
      if (!version || parseInt(version, 10) < CONV_VERSION) {
        const allKeys = await idbKeys();
        const convKeys = (allKeys as string[]).filter((k) => k.startsWith(IDB_CONV_PREFIX));
        await Promise.all(convKeys.map((k) => idbDel(k)));
        localStorage.setItem(CONV_VERSION_KEY, String(CONV_VERSION));
      }

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
      let preset = await idbGet<Record<string, unknown>>(`${IDB_CONV_PREFIX}${name}`);

      if (!preset) {
        // Fallback: convert from raw .milk text (backwards compat + first access after import)
        const text = await idbGet<string>(`${IDB_MILK_PREFIX}${name}`);
        if (!text) return null;

        const { convertInWorker } = await import('../engine/conversionWorkerManager.ts');
        const { validatePreset } = await import('../engine/milkdropConverter.ts');
        preset = (await convertInWorker(name, text)) as Record<string, unknown>;
        validatePreset(preset);

        // Persist converted result for instant future access
        await idbSet(`${IDB_CONV_PREFIX}${name}`, preset);
      }

      // Compile EEL source strings to WASM adapter functions
      if (preset._eelFormat) {
        const { compilePresetEel } = await import('../engine/eelWasmAdapter.ts');
        await compilePresetEel(preset as Parameters<typeof compilePresetEel>[0]);
      }

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
