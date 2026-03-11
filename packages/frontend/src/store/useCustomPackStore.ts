import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import sjp from 'secure-json-parse';

export interface CustomPack {
  id: string;
  name: string;
  presets: string[];
  createdAt: number;
}

interface ImportedPack {
  mangowave_pack: number;
  name: string;
  presets: string[];
  exportedAt?: string;
}

const MAX_FILE_SIZE = 1_048_576; // 1MB
const MAX_STRING_LENGTH = 200;

function sanitizeString(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  if (s.length > MAX_STRING_LENGTH) return null;
  // Strip HTML/script tags
  return s.replace(/<[^>]*>/g, '');
}

function generateId(): string {
  return `pack_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface CustomPackState {
  packs: CustomPack[];

  createPack: (name: string) => string;
  deletePack: (id: string) => void;
  renamePack: (id: string, name: string) => void;
  addPresetToPack: (id: string, presetName: string) => void;
  removePresetFromPack: (id: string, presetName: string) => void;
  exportPack: (id: string) => void;
  importPack: (file: File) => Promise<{ success: boolean; error?: string }>;
}

export const useCustomPackStore = create<CustomPackState>()(
  persist(
    (set, get) => ({
      packs: [],

      createPack: (name) => {
        const id = generateId();
        set((state) => ({
          packs: [...state.packs, { id, name, presets: [], createdAt: Date.now() }],
        }));
        return id;
      },

      deletePack: (id) => {
        set((state) => ({
          packs: state.packs.filter((p) => p.id !== id),
        }));
      },

      renamePack: (id, name) => {
        set((state) => ({
          packs: state.packs.map((p) => (p.id === id ? { ...p, name } : p)),
        }));
      },

      addPresetToPack: (id, presetName) => {
        set((state) => ({
          packs: state.packs.map((p) =>
            p.id === id && !p.presets.includes(presetName)
              ? { ...p, presets: [...p.presets, presetName] }
              : p,
          ),
        }));
      },

      removePresetFromPack: (id, presetName) => {
        set((state) => ({
          packs: state.packs.map((p) =>
            p.id === id ? { ...p, presets: p.presets.filter((n) => n !== presetName) } : p,
          ),
        }));
      },

      exportPack: (id) => {
        const pack = get().packs.find((p) => p.id === id);
        if (!pack) return;

        const data: ImportedPack = {
          mangowave_pack: 1,
          name: pack.name,
          presets: pack.presets,
          exportedAt: new Date().toISOString(),
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pack.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },

      importPack: async (file) => {
        if (file.size > MAX_FILE_SIZE) {
          return { success: false, error: 'File too large (max 1MB)' };
        }

        try {
          const text = await file.text();
          const raw = sjp.parse(text, {
            protoAction: 'remove',
            constructorAction: 'remove',
          }) as unknown;

          // Schema validation
          if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            return { success: false, error: 'Invalid pack format' };
          }

          const obj = raw as Record<string, unknown>;
          if (typeof obj.mangowave_pack !== 'number') {
            return { success: false, error: 'Not a MangoWave pack file' };
          }

          const name = sanitizeString(obj.name);
          if (!name) {
            return { success: false, error: 'Invalid or missing pack name' };
          }

          if (!Array.isArray(obj.presets)) {
            return { success: false, error: 'Invalid presets array' };
          }

          // Only allow expected keys
          const allowedKeys = new Set(['mangowave_pack', 'name', 'presets', 'exportedAt']);
          for (const key of Object.keys(obj)) {
            if (!allowedKeys.has(key)) {
              return { success: false, error: `Unexpected key: ${key}` };
            }
          }

          const presets: string[] = [];
          for (const p of obj.presets) {
            const sanitized = sanitizeString(p);
            if (sanitized) presets.push(sanitized);
          }

          const id = generateId();
          set((state) => ({
            packs: [...state.packs, { id, name, presets, createdAt: Date.now() }],
          }));

          return { success: true };
        } catch {
          return { success: false, error: 'Failed to parse pack file' };
        }
      },
    }),
    {
      name: 'mangowave-custom-packs',
    },
  ),
);
