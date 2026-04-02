import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

const IDB_PREFIX = 'mw-tex:';

export interface TextureData {
  data: string;
  width: number;
  height: number;
}

export interface ImportedTexturesState {
  loaded: boolean;
  textures: Map<string, TextureData>;

  loadFromIdb: () => Promise<void>;
  addTexture: (name: string, data: TextureData) => Promise<void>;
  removeTexture: (name: string) => Promise<void>;
  removeAllTextures: () => Promise<void>;
  /** Returns a plain Record suitable for butterchurn's loadExtraImages. */
  getAllTextures: () => Record<string, TextureData>;
}

export const useImportedTexturesStore = create<ImportedTexturesState>()((set, get) => ({
  loaded: false,
  textures: new Map(),

  loadFromIdb: async () => {
    try {
      const allKeys = await idbKeys();
      const texKeys = (allKeys as string[]).filter((k) => k.startsWith(IDB_PREFIX));

      const textures = new Map<string, TextureData>();
      const entries = await Promise.all(
        texKeys.map(async (key) => {
          const name = key.slice(IDB_PREFIX.length);
          const data = await idbGet<TextureData>(key);
          return [name, data] as const;
        }),
      );
      for (const [name, data] of entries) {
        if (data) textures.set(name, data);
      }

      set({ textures, loaded: true });
    } catch (err) {
      console.error('Failed to load imported textures from IDB:', err);
      set({ loaded: true });
    }
  },

  addTexture: async (name, data) => {
    await idbSet(`${IDB_PREFIX}${name}`, data);
    set((state) => {
      const textures = new Map(state.textures);
      textures.set(name, data);
      return { textures };
    });
  },

  removeTexture: async (name) => {
    await idbDel(`${IDB_PREFIX}${name}`);
    set((state) => {
      const textures = new Map(state.textures);
      textures.delete(name);
      return { textures };
    });
  },

  removeAllTextures: async () => {
    const { textures } = get();
    await Promise.all([...textures.keys()].map((name) => idbDel(`${IDB_PREFIX}${name}`)));
    set({ textures: new Map() });
  },

  getAllTextures: () => {
    const { textures } = get();
    const result: Record<string, TextureData> = {};
    for (const [name, data] of textures) {
      result[name] = data;
    }
    return result;
  },
}));

// Eagerly load IDB data on module init so it's available before the renderer starts.
// This is a fire-and-forget promise — the store's `loaded` flag tracks completion.
useImportedTexturesStore.getState().loadFromIdb();
