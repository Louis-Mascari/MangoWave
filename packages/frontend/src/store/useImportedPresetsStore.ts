import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';
import { convertMilkText, validatePreset } from '../engine/milkdropConverter.ts';

const IDB_PREFIX = 'mw-milk:';
const LRU_CAPACITY = 200;

export interface ImportedPresetsState {
  loaded: boolean;
  milkTexts: Map<string, string>;
  convertedCache: Map<string, object>;

  loadFromIdb: () => Promise<void>;
  addPreset: (name: string, milkText: string) => Promise<void>;
  removePreset: (name: string) => Promise<void>;
  removeAllPresets: () => Promise<void>;
  getConvertedPreset: (name: string) => Promise<object | null>;
}

/** Track insertion order for LRU eviction. */
const lruOrder: string[] = [];

function touchLru(name: string, cache: Map<string, object>): void {
  const idx = lruOrder.indexOf(name);
  if (idx !== -1) lruOrder.splice(idx, 1);
  lruOrder.push(name);

  // Evict oldest entries if over capacity
  while (lruOrder.length > LRU_CAPACITY) {
    const evict = lruOrder.shift()!;
    cache.delete(evict);
  }
}

export const useImportedPresetsStore = create<ImportedPresetsState>()((set, get) => ({
  loaded: false,
  milkTexts: new Map(),
  convertedCache: new Map(),

  loadFromIdb: async () => {
    try {
      const allKeys = await idbKeys();
      const milkKeys = (allKeys as string[]).filter((k) => k.startsWith(IDB_PREFIX));

      const texts = new Map<string, string>();
      for (const key of milkKeys) {
        const name = key.slice(IDB_PREFIX.length);
        const text = await idbGet<string>(key);
        if (text) texts.set(name, text);
      }

      set({ milkTexts: texts, loaded: true });
    } catch (err) {
      console.error('Failed to load imported presets from IDB:', err);
      set({ loaded: true });
    }
  },

  addPreset: async (name, milkText) => {
    await idbSet(`${IDB_PREFIX}${name}`, milkText);
    set((state) => {
      const texts = new Map(state.milkTexts);
      texts.set(name, milkText);
      return { milkTexts: texts };
    });
  },

  removePreset: async (name) => {
    await idbDel(`${IDB_PREFIX}${name}`);
    set((state) => {
      const texts = new Map(state.milkTexts);
      texts.delete(name);
      const cache = new Map(state.convertedCache);
      cache.delete(name);
      const idx = lruOrder.indexOf(name);
      if (idx !== -1) lruOrder.splice(idx, 1);
      return { milkTexts: texts, convertedCache: cache };
    });
  },

  removeAllPresets: async () => {
    const { milkTexts } = get();
    for (const name of milkTexts.keys()) {
      await idbDel(`${IDB_PREFIX}${name}`);
    }
    lruOrder.length = 0;
    set({ milkTexts: new Map(), convertedCache: new Map() });
  },

  getConvertedPreset: async (name: string) => {
    const { convertedCache, milkTexts } = get();

    // Check LRU cache
    if (convertedCache.has(name)) {
      touchLru(name, convertedCache);
      return convertedCache.get(name)!;
    }

    // Get raw text
    const text = milkTexts.get(name);
    if (!text) return null;

    try {
      const preset = await convertMilkText(text);
      validatePreset(preset);

      // Cache the result
      const cache = new Map(get().convertedCache);
      cache.set(name, preset);
      touchLru(name, cache);
      set({ convertedCache: cache });

      return preset;
    } catch (err) {
      console.error(`Failed to convert preset "${name}":`, err);
      return null;
    }
  },
}));

// Eagerly load IDB data on module init so it's available before the renderer starts.
// This is a fire-and-forget promise — the store's `loaded` flag tracks completion.
useImportedPresetsStore.getState().loadFromIdb();
