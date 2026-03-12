import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EQ_BANDS } from '../engine/AudioEngine.ts';

export interface PerformanceSettings {
  fpsCap: number; // 0 = uncapped, 30, 60
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

export type AutopilotMode = 'all' | 'favorites';

export interface AutopilotSettings {
  enabled: boolean;
  interval: number; // seconds
  mode: AutopilotMode;
  favoriteWeight: number; // 1–5, weight for favorites in shuffle
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

  // Quarantine
  showQuarantined: boolean;
  setShowQuarantined: (show: boolean) => void;
  quarantineOverrides: string[];
  addQuarantineOverride: (name: string) => void;
  removeQuarantineOverride: (name: string) => void;

  // Display
  presetNameDisplay: 'off' | 'always' | number; // 'off', 'always', or seconds
  setPresetNameDisplay: (value: 'off' | 'always' | number) => void;
  songInfoDisplay: 'off' | 'always' | number; // 'off', 'always', or seconds
  setSongInfoDisplay: (value: 'off' | 'always' | number) => void;

  // Transitions
  transitionTime: number; // seconds for preset blend
  setTransitionTime: (seconds: number) => void;

  // Volume (persisted for local file playback)
  volume: number; // 0.0 to 1.0
  setVolume: (volume: number) => void;

  // Import
  importSettings: (partial: Partial<SettingsState>) => void;
}

const DEFAULT_BAND_GAINS = EQ_BANDS.map(() => 0);

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Performance
      performance: {
        fpsCap: 0,
        resolutionScale: 1.0,
        meshWidth: 48,
        meshHeight: 36,
        textureRatio: 1.0,
        fxaa: false,
      },
      setFpsCap: (fps) =>
        set((state) => ({
          performance: { ...state.performance, fpsCap: fps },
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
      audio: {
        smoothingConstant: 0.3,
        fftSize: 1024,
      },
      setSmoothingConstant: (value) =>
        set((state) => ({
          audio: { ...state.audio, smoothingConstant: value },
        })),
      setFftSize: (size) =>
        set((state) => ({
          audio: { ...state.audio, fftSize: size },
        })),

      // Autopilot
      autopilot: {
        enabled: true,
        interval: 15,
        mode: 'all',
        favoriteWeight: 2,
      },
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
        preAmpGain: 1.0,
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
          eq: { preAmpGain: 1.0, bandGains: [...DEFAULT_BAND_GAINS] },
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

      // Quarantine
      showQuarantined: false,
      setShowQuarantined: (show) => set({ showQuarantined: show }),
      quarantineOverrides: [],
      addQuarantineOverride: (name) =>
        set((state) => ({
          quarantineOverrides: state.quarantineOverrides.includes(name)
            ? state.quarantineOverrides
            : [...state.quarantineOverrides, name],
        })),
      removeQuarantineOverride: (name) =>
        set((state) => ({
          quarantineOverrides: state.quarantineOverrides.filter((p) => p !== name),
        })),

      // Display
      presetNameDisplay: 5,
      setPresetNameDisplay: (value) => set({ presetNameDisplay: value }),
      songInfoDisplay: 5,
      setSongInfoDisplay: (value) => set({ songInfoDisplay: value }),

      // Transitions
      transitionTime: 2.0,
      setTransitionTime: (seconds) => set({ transitionTime: seconds }),

      // Volume
      volume: 0.5,
      setVolume: (volume) => set({ volume }),

      // Import
      importSettings: (partial) => set((state) => ({ ...state, ...partial })),
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
        return state as unknown as SettingsState;
      },
      version: 2,
    },
  ),
);
