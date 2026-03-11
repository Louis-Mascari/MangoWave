import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EQ_BANDS } from '../engine/AudioEngine.ts';

export interface PerformanceSettings {
  fpsCap: number; // 0 = uncapped, 30, 60
  resolutionScale: number; // 0.25 to 1.0
}

export interface EQSettings {
  preAmpGain: number; // 0.0 to 3.0 (linear gain)
  bandGains: number[]; // dB values for each of the 10 bands, -12 to +12
}

export interface AudioSettings {
  smoothingConstant: number; // 0–1
  fftSize: number; // 512, 1024, 2048, 4096
}

export interface AutopilotSettings {
  enabled: boolean;
  interval: number; // seconds
  favoritesOnly: boolean;
}

export interface SettingsState {
  // Performance
  performance: PerformanceSettings;
  setFpsCap: (fps: number) => void;
  setResolutionScale: (scale: number) => void;

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
  setAutopilotFavoritesOnly: (favoritesOnly: boolean) => void;

  // Presets
  blockedPresets: string[];
  favoritePresets: string[];
  blockPreset: (name: string) => void;
  unblockPreset: (name: string) => void;
  toggleBlockPreset: (name: string) => void;
  toggleFavoritePreset: (name: string) => void;

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
}

const DEFAULT_BAND_GAINS = EQ_BANDS.map(() => 0);

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Performance
      performance: {
        fpsCap: 0,
        resolutionScale: 1.0,
      },
      setFpsCap: (fps) =>
        set((state) => ({
          performance: { ...state.performance, fpsCap: fps },
        })),
      setResolutionScale: (scale) =>
        set((state) => ({
          performance: { ...state.performance, resolutionScale: scale },
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
        favoritesOnly: false,
      },
      setAutopilotEnabled: (enabled) =>
        set((state) => ({
          autopilot: { ...state.autopilot, enabled },
        })),
      setAutopilotInterval: (interval) =>
        set((state) => ({
          autopilot: { ...state.autopilot, interval },
        })),
      setAutopilotFavoritesOnly: (favoritesOnly) =>
        set((state) => ({
          autopilot: { ...state.autopilot, favoritesOnly },
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
    }),
    {
      name: 'mangowave-settings',
    },
  ),
);
