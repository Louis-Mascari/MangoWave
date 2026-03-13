import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EQ_BANDS } from '../engine/AudioEngine.ts';
import { isMobileDevice } from '../utils/isMobileDevice.ts';

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
  songInfoDisplay: 'off' | number; // 'off' or duration in seconds (hardcoded to 5)
  setSongInfoDisplay: (value: 'off' | number) => void;

  // Transitions
  transitionTime: number; // seconds for preset blend
  setTransitionTime: (seconds: number) => void;

  // Mobile
  mobileNoticeShown: boolean;
  setMobileNoticeShown: (shown: boolean) => void;
  resetToDesktopPerformance: () => void;
  resetToMobilePerformance: () => void;

  // Volume (persisted for local file playback)
  volume: number; // 0.0 to 1.0
  setVolume: (volume: number) => void;

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

const MOBILE_PERFORMANCE: PerformanceSettings = {
  fpsCap: 30,
  resolutionScale: 0.75,
  meshWidth: 32,
  meshHeight: 24,
  textureRatio: 0.5,
  fxaa: false,
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
  'showQuarantined',
  'quarantineOverrides',
  'mobileNoticeShown',
  'presetNameDisplay',
  'songInfoDisplay',
  'transitionTime',
  'volume',
];

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Performance
      performance: isMobileDevice ? { ...MOBILE_PERFORMANCE } : { ...DESKTOP_PERFORMANCE },
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

      // Mobile
      mobileNoticeShown: false,
      setMobileNoticeShown: (shown) => set({ mobileNoticeShown: shown }),
      resetToDesktopPerformance: () => set({ performance: { ...DESKTOP_PERFORMANCE } }),
      resetToMobilePerformance: () => set({ performance: { ...MOBILE_PERFORMANCE } }),

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
        // v3 → v4: Apply mobile performance defaults for existing mobile users
        if ((version ?? 0) < 4) {
          if (isMobileDevice) {
            state.performance = { ...MOBILE_PERFORMANCE };
          }
        }
        return state as unknown as SettingsState;
      },
      version: 4,
    },
  ),
);
