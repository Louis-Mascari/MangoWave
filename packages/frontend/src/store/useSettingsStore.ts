import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EQ_BANDS } from '../engine/AudioEngine.ts';
import { quarantinedSet, mobileBlockedSet } from '../data/excludedPresets.ts';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import { THEMATIC_PACKS } from '../data/presetThematicPacks.ts';

export interface PerformanceSettings {
  fpsCap: number; // 0 = uncapped, 15–300
  resolutionScale: number; // 0.25 to 1.0
  meshWidth: number; // vertex grid width for warp distortions (default 48)
  meshHeight: number; // vertex grid height for warp distortions (default 36)
  textureRatio: number; // internal render resolution multiplier (default 1.0)
  fxaa: boolean; // fast anti-aliasing on output (default false)
}

export interface EQSettings {
  preAmpGain: number; // 0.0 to 3.0 (linear gain)
  bandGains: number[]; // dB values for each of the 10 bands, -12 to +12
}

export interface AudioSettings {
  smoothingConstant: number; // 0–1
  fftSize: number; // 512, 1024, 2048, 4096
}

export interface CustomPack {
  id: string; // crypto.randomUUID()
  name: string; // max 50 chars
  presets: string[]; // preset names (no duplicates)
  createdAt: number; // Date.now()
}

export interface ImportedPresetMeta {
  name: string; // display name (de-duplicated at import time)
  fileName: string; // original filename
  addedAt: number; // Date.now()
}

export interface ImportedTextureMeta {
  name: string; // texture name (lowercased filename stem)
  fileName: string; // original filename
  width: number;
  height: number;
  sizeBytes: number;
  addedAt: number; // Date.now()
}

export type AutopilotMode = 'all' | 'favorites';

export interface AutopilotSettings {
  enabled: boolean;
  interval: number; // seconds
  mode: AutopilotMode;
  favoriteWeight: number; // 1–10, weight for favorites in shuffle
}

export interface SettingsState {
  // Performance
  performance: PerformanceSettings;
  setFpsCap: (fps: number) => void;
  setResolutionScale: (scale: number) => void;
  setMeshSize: (width: number, height: number) => void;
  setTextureRatio: (ratio: number) => void;
  setFxaa: (enabled: boolean) => void;

  // EQ
  eq: EQSettings;
  setPreAmpGain: (gain: number) => void;
  setEQBandGain: (index: number, gainDb: number) => void;
  resetEQ: () => void;

  // Audio
  audio: AudioSettings;
  setSmoothingConstant: (value: number) => void;
  setFftSize: (size: number) => void;

  // Autopilot
  autopilot: AutopilotSettings;
  setAutopilotEnabled: (enabled: boolean) => void;
  setAutopilotInterval: (interval: number) => void;
  setAutopilotMode: (mode: AutopilotMode) => void;
  setAutopilotFavoriteWeight: (weight: number) => void;

  // Presets
  blockedPresets: string[];
  favoritePresets: string[];
  blockPreset: (name: string) => void;
  unblockPreset: (name: string) => void;
  toggleBlockPreset: (name: string) => void;
  toggleFavoritePreset: (name: string) => void;

  // Pack filtering (built-in butterchurn packs)
  enabledPacks: string[];
  setEnabledPacks: (packs: string[]) => void;
  togglePack: (pack: string) => void;

  // Custom packs
  customPacks: CustomPack[];
  activeCustomPackId: string | null;
  createCustomPack: (name: string, presets?: string[]) => string | null;
  renameCustomPack: (id: string, name: string) => void;
  deleteCustomPack: (id: string) => void;
  addPresetToCustomPack: (packId: string, presetName: string) => void;
  removePresetFromCustomPack: (packId: string, presetName: string) => void;
  setActiveCustomPackId: (id: string | null) => void;

  // Exclusions (quarantined + mobile-blocked preset overrides)
  excludedOverrides: string[];
  addExcludedOverride: (name: string) => void;
  removeExcludedOverride: (name: string) => void;

  // Display
  presetNameDisplay: 'off' | 'always' | number; // 'off', 'always', or seconds
  setPresetNameDisplay: (value: 'off' | 'always' | number) => void;
  songInfoDisplay: 'off' | number; // 'off' or duration in seconds (hardcoded to 5)
  setSongInfoDisplay: (value: 'off' | number) => void;

  // Transitions
  transitionTime: number; // seconds for preset blend
  setTransitionTime: (seconds: number) => void;

  // Onboarding
  onboardingShown: boolean;
  setOnboardingShown: (shown: boolean) => void;

  // Window sync
  windowSyncEnabled: boolean;
  setWindowSyncEnabled: (enabled: boolean) => void;
  syncPerformance: boolean;
  setSyncPerformance: (enabled: boolean) => void;

  // Imported presets (metadata only — raw .milk text lives in IDB)
  importedPresets: ImportedPresetMeta[];
  addImportedPresetMeta: (meta: ImportedPresetMeta) => void;
  removeImportedPresetMeta: (name: string) => void;
  clearImportedPresetsMeta: () => void;

  // Imported textures (metadata only — raw image data lives in IDB)
  importedTextures: ImportedTextureMeta[];
  addImportedTextureMeta: (meta: ImportedTextureMeta) => void;
  removeImportedTextureMeta: (name: string) => void;
  clearImportedTexturesMeta: () => void;

  // Volume (persisted for local file playback)
  volume: number; // 0.0 to 1.0
  setVolume: (volume: number) => void;

  // Reset actions
  resetRendering: () => void;
  resetPresets: () => void;
  clearBlocked: () => void;
  clearFavorites: () => void;

  // Import
  importSettings: (partial: Partial<SettingsState>) => void;
}

const DEFAULT_BAND_GAINS = EQ_BANDS.map(() => 0);

const DESKTOP_PERFORMANCE: PerformanceSettings = {
  fpsCap: 60,
  resolutionScale: 1.0,
  meshWidth: 48,
  meshHeight: 36,
  textureRatio: 1.0,
  fxaa: false,
};

const DEFAULT_AUDIO: AudioSettings = {
  smoothingConstant: 0.3,
  fftSize: 1024,
};

const DEFAULT_AUTOPILOT: AutopilotSettings = {
  enabled: true,
  interval: 15,
  mode: 'all',
  favoriteWeight: 2,
};

// Only these keys can be set via importSettings — prevents overwriting store actions
const IMPORTABLE_KEYS: (keyof SettingsState)[] = [
  'performance',
  'eq',
  'audio',
  'autopilot',
  'blockedPresets',
  'favoritePresets',
  'enabledPacks',
  'excludedOverrides',
  'presetNameDisplay',
  'songInfoDisplay',
  'transitionTime',
  'volume',
  'customPacks',
  'activeCustomPackId',
  'importedPresets',
  'importedTextures',
  'windowSyncEnabled',
  'syncPerformance',
];

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Performance
      performance: { ...DESKTOP_PERFORMANCE },
      setFpsCap: (fps) =>
        set((state) => ({
          performance: {
            ...state.performance,
            fpsCap: fps <= 0 ? 0 : Math.round(Math.min(300, Math.max(15, fps))),
          },
        })),
      setResolutionScale: (scale) =>
        set((state) => ({
          performance: { ...state.performance, resolutionScale: scale },
        })),
      setMeshSize: (width, height) =>
        set((state) => ({
          performance: { ...state.performance, meshWidth: width, meshHeight: height },
        })),
      setTextureRatio: (ratio) =>
        set((state) => ({
          performance: { ...state.performance, textureRatio: ratio },
        })),
      setFxaa: (enabled) =>
        set((state) => ({
          performance: { ...state.performance, fxaa: enabled },
        })),

      // Audio
      audio: { ...DEFAULT_AUDIO },
      setSmoothingConstant: (value) =>
        set((state) => ({
          audio: { ...state.audio, smoothingConstant: value },
        })),
      setFftSize: (size) =>
        set((state) => ({
          audio: { ...state.audio, fftSize: size },
        })),

      // Autopilot
      autopilot: { ...DEFAULT_AUTOPILOT },
      setAutopilotEnabled: (enabled) =>
        set((state) => ({
          autopilot: { ...state.autopilot, enabled },
        })),
      setAutopilotInterval: (interval) =>
        set((state) => ({
          autopilot: { ...state.autopilot, interval },
        })),
      setAutopilotMode: (mode) =>
        set((state) => ({
          autopilot: { ...state.autopilot, mode },
        })),
      setAutopilotFavoriteWeight: (weight) =>
        set((state) => ({
          autopilot: { ...state.autopilot, favoriteWeight: weight },
        })),

      // EQ
      eq: {
        preAmpGain: 1.5,
        bandGains: [...DEFAULT_BAND_GAINS],
      },
      setPreAmpGain: (gain) =>
        set((state) => ({
          eq: { ...state.eq, preAmpGain: gain },
        })),
      setEQBandGain: (index, gainDb) =>
        set((state) => {
          const bandGains = [...state.eq.bandGains];
          if (index >= 0 && index < bandGains.length) {
            bandGains[index] = gainDb;
          }
          return { eq: { ...state.eq, bandGains } };
        }),
      resetEQ: () =>
        set(() => ({
          eq: { preAmpGain: 1.5, bandGains: [...DEFAULT_BAND_GAINS] },
        })),

      // Presets
      blockedPresets: [],
      favoritePresets: [],
      blockPreset: (name) =>
        set((state) => ({
          blockedPresets: state.blockedPresets.includes(name)
            ? state.blockedPresets
            : [...state.blockedPresets, name],
          favoritePresets: state.favoritePresets.filter((p) => p !== name),
        })),
      unblockPreset: (name) =>
        set((state) => ({
          blockedPresets: state.blockedPresets.filter((p) => p !== name),
        })),
      toggleBlockPreset: (name) =>
        set((state) => ({
          blockedPresets: state.blockedPresets.includes(name)
            ? state.blockedPresets.filter((p) => p !== name)
            : [...state.blockedPresets, name],
          favoritePresets: state.blockedPresets.includes(name)
            ? state.favoritePresets
            : state.favoritePresets.filter((p) => p !== name),
        })),
      toggleFavoritePreset: (name) =>
        set((state) => ({
          favoritePresets: state.favoritePresets.includes(name)
            ? state.favoritePresets.filter((p) => p !== name)
            : [...state.favoritePresets, name],
          blockedPresets: state.favoritePresets.includes(name)
            ? state.blockedPresets
            : state.blockedPresets.filter((p) => p !== name),
        })),

      // Pack filtering (built-in butterchurn packs)
      enabledPacks: [],
      setEnabledPacks: (packs) => set({ enabledPacks: packs }),
      togglePack: (pack) =>
        set((state) => ({
          enabledPacks: state.enabledPacks.includes(pack)
            ? state.enabledPacks.filter((p) => p !== pack)
            : [...state.enabledPacks, pack],
        })),

      // Custom packs
      customPacks: [],
      activeCustomPackId: null,
      createCustomPack: (name, presets) => {
        let newId: string | null = null;
        set((state) => {
          if (state.customPacks.length >= 50) return state;
          const id = crypto.randomUUID();
          newId = id;
          return {
            customPacks: [
              ...state.customPacks,
              {
                id,
                name: name.slice(0, 50),
                presets: presets ?? [],
                createdAt: Date.now(),
              },
            ],
          };
        });
        return newId;
      },
      renameCustomPack: (id, name) =>
        set((state) => ({
          customPacks: state.customPacks.map((p) =>
            p.id === id ? { ...p, name: name.slice(0, 50) } : p,
          ),
        })),
      deleteCustomPack: (id) =>
        set((state) => ({
          customPacks: state.customPacks.filter((p) => p.id !== id),
          activeCustomPackId: state.activeCustomPackId === id ? null : state.activeCustomPackId,
        })),
      addPresetToCustomPack: (packId, presetName) =>
        set((state) => ({
          customPacks: state.customPacks.map((p) =>
            p.id === packId && !p.presets.includes(presetName)
              ? { ...p, presets: [...p.presets, presetName] }
              : p,
          ),
        })),
      removePresetFromCustomPack: (packId, presetName) =>
        set((state) => ({
          customPacks: state.customPacks.map((p) =>
            p.id === packId ? { ...p, presets: p.presets.filter((n) => n !== presetName) } : p,
          ),
        })),
      setActiveCustomPackId: (id) =>
        set((state) => ({
          activeCustomPackId: id,
          autopilot:
            id !== null && state.autopilot.mode === 'favorites'
              ? { ...state.autopilot, mode: 'all' }
              : state.autopilot,
        })),

      // Exclusions (quarantined + mobile-blocked preset overrides)
      excludedOverrides: [],
      addExcludedOverride: (name) =>
        set((state) => ({
          excludedOverrides: state.excludedOverrides.includes(name)
            ? state.excludedOverrides
            : [...state.excludedOverrides, name],
        })),
      removeExcludedOverride: (name) =>
        set((state) => ({
          excludedOverrides: state.excludedOverrides.filter((p) => p !== name),
        })),

      // Onboarding
      onboardingShown: false,
      setOnboardingShown: (shown) => set({ onboardingShown: shown }),

      // Display
      presetNameDisplay: 5,
      setPresetNameDisplay: (value) => set({ presetNameDisplay: value }),
      songInfoDisplay: 5,
      setSongInfoDisplay: (value) => set({ songInfoDisplay: value }),

      // Transitions
      transitionTime: 2.0,
      setTransitionTime: (seconds) => set({ transitionTime: seconds }),

      // Window sync
      windowSyncEnabled: false,
      setWindowSyncEnabled: (enabled) => set({ windowSyncEnabled: enabled }),
      syncPerformance: true,
      setSyncPerformance: (enabled) => set({ syncPerformance: enabled }),

      // Imported presets
      importedPresets: [],
      addImportedPresetMeta: (meta) =>
        set((state) => ({
          importedPresets: [...state.importedPresets, meta],
        })),
      removeImportedPresetMeta: (name) =>
        set((state) => ({
          importedPresets: state.importedPresets.filter((p) => p.name !== name),
          customPacks: state.customPacks.map((pack) => ({
            ...pack,
            presets: pack.presets.filter((n) => n !== name),
          })),
        })),
      clearImportedPresetsMeta: () =>
        set((state) => {
          const importedNames = new Set(state.importedPresets.map((p) => p.name));
          return {
            importedPresets: [],
            customPacks: state.customPacks.map((pack) => ({
              ...pack,
              presets: pack.presets.filter((n) => !importedNames.has(n)),
            })),
          };
        }),

      // Imported textures
      importedTextures: [],
      addImportedTextureMeta: (meta) =>
        set((state) => ({
          importedTextures: [...state.importedTextures, meta],
        })),
      removeImportedTextureMeta: (name) =>
        set((state) => ({
          importedTextures: state.importedTextures.filter((t) => t.name !== name),
        })),
      clearImportedTexturesMeta: () => set({ importedTextures: [] }),

      // Volume
      volume: 0.5,
      setVolume: (volume) => set({ volume }),

      // Reset actions
      resetRendering: () =>
        set(() => ({
          performance: { ...DESKTOP_PERFORMANCE },
          audio: { ...DEFAULT_AUDIO },
        })),
      resetPresets: () =>
        set(() => ({
          transitionTime: 2.0,
          presetNameDisplay: 5,
          songInfoDisplay: 5,
          autopilot: { ...DEFAULT_AUTOPILOT },
          activeCustomPackId: null,
        })),
      clearBlocked: () =>
        set((s) => ({
          blockedPresets: s.blockedPresets.filter((p) => {
            return quarantinedSet.has(p) || (isMobileDevice && mobileBlockedSet.has(p));
          }),
        })),
      clearFavorites: () => set({ favoritePresets: [] }),

      // Import — whitelist data keys only (never overwrite store actions/functions)
      importSettings: (partial) =>
        set((state) => {
          const safe: Record<string, unknown> = {};
          for (const key of IMPORTABLE_KEYS) {
            if (key in partial) {
              // Deep-merge nested objects to preserve defaults for missing fields
              const val = partial[key as keyof typeof partial];
              const cur = state[key as keyof typeof state];
              const isObj = val && typeof val === 'object' && !Array.isArray(val);
              const curIsObj = cur && typeof cur === 'object' && !Array.isArray(cur);
              if (isObj && curIsObj) {
                safe[key] = { ...cur, ...val };
              } else {
                safe[key] = val;
              }
            }
          }
          return { ...state, ...safe };
        }),
    }),
    {
      name: 'mangowave-settings',
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        // v0 → v1: Migrate from favoritesOnly boolean to mode enum
        if (version === 0 || version === undefined) {
          const autopilot = state.autopilot as Record<string, unknown> | undefined;
          if (autopilot && 'favoritesOnly' in autopilot) {
            autopilot.mode = autopilot.favoritesOnly ? 'favorites' : 'all';
            autopilot.favoriteWeight = autopilot.favoriteWeight ?? 2;
            delete autopilot.favoritesOnly;
            delete autopilot.packId;
          }
          // Clean up removed pack fields
          if (autopilot && 'packId' in autopilot) {
            delete autopilot.packId;
            if (autopilot.mode === 'pack') autopilot.mode = 'all';
          }
        }
        // v1 → v2: Backfill butterchurn config defaults
        if ((version ?? 0) < 2) {
          const perf = state.performance as Record<string, unknown> | undefined;
          if (perf) {
            perf.meshWidth = perf.meshWidth ?? 48;
            perf.meshHeight = perf.meshHeight ?? 36;
            perf.textureRatio = perf.textureRatio ?? 1.0;
            perf.fxaa = perf.fxaa ?? false;
          }
        }
        // v2 → v3: songInfoDisplay no longer supports 'always' — convert to 5s
        if ((version ?? 0) < 3) {
          if (state.songInfoDisplay === 'always') {
            state.songInfoDisplay = 5;
          }
        }
        // v3 → v4: (was: mobile performance defaults — now undone by v5)
        // v4 → v5: Remove mobile performance popup; reset mobile users to desktop defaults
        if ((version ?? 0) < 5) {
          delete state.mobileNoticeShown;
          const perf = state.performance as Record<string, unknown> | undefined;
          if (
            perf &&
            perf.fpsCap === 30 &&
            perf.resolutionScale === 0.75 &&
            perf.meshWidth === 32 &&
            perf.meshHeight === 24 &&
            perf.textureRatio === 0.5
          ) {
            state.performance = { ...DESKTOP_PERFORMANCE };
          }
        }
        // v5 → v6: Rename quarantineOverrides → excludedOverrides, remove showQuarantined
        if ((version ?? 0) < 6) {
          if (Array.isArray(state.quarantineOverrides)) {
            state.excludedOverrides = state.quarantineOverrides;
            delete state.quarantineOverrides;
          }
          delete state.showQuarantined;
        }
        // v6 → v7: Add windowSyncEnabled, syncPerformance
        if ((version ?? 0) < 7) {
          state.windowSyncEnabled = state.windowSyncEnabled ?? false;
          state.syncPerformance = state.syncPerformance ?? true;
        }
        // v7 → v8: Add custom packs
        if ((version ?? 0) < 8) {
          state.customPacks = state.customPacks ?? [];
          state.activeCustomPackId = state.activeCustomPackId ?? null;
        }
        // v8 → v9: Add imported presets metadata
        if ((version ?? 0) < 9) {
          state.importedPresets = state.importedPresets ?? [];
        }
        // v9 → v10: Add imported textures metadata
        if ((version ?? 0) < 10) {
          state.importedTextures = state.importedTextures ?? [];
        }
        // v10 → v11: Add 'MilkDrop' pack to enabledPacks for existing users
        if ((version ?? 0) < 11) {
          const packs = (state.enabledPacks as string[]) ?? [];
          if (packs.length > 0 && !packs.includes('MilkDrop')) {
            state.enabledPacks = [...packs, 'MilkDrop'];
          }
        }
        // v11 → v12: Remap old source-based enabledPacks to thematic pack names
        if ((version ?? 0) < 12) {
          const OLD_PACKS = ['Minimal', 'Non-Minimal', 'Extra', 'Extra 2', 'MD1', 'MilkDrop'];
          const packs = (state.enabledPacks as string[]) ?? [];
          if (packs.length > 0 && packs.some((p) => OLD_PACKS.includes(p))) {
            // Old pack names are non-descriptive — no meaningful 1:1 mapping possible.
            // Enable all thematic packs; preserve 'Imported' if present.
            const newPacks: string[] = [...THEMATIC_PACKS];
            if (packs.includes('Imported')) newPacks.push('Imported');
            state.enabledPacks = newPacks;
          }
        }
        return state as unknown as SettingsState;
      },
      version: 12,
    },
  ),
);
