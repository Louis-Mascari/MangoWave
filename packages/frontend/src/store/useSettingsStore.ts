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

  // Presets
  blockedPresets: string[];
  favoritePresets: string[];
  blockPreset: (name: string) => void;
  unblockPreset: (name: string) => void;
  toggleFavoritePreset: (name: string) => void;

  // Transitions
  transitionTime: number; // seconds for preset blend
  setTransitionTime: (seconds: number) => void;
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
        })),
      unblockPreset: (name) =>
        set((state) => ({
          blockedPresets: state.blockedPresets.filter((p) => p !== name),
        })),
      toggleFavoritePreset: (name) =>
        set((state) => ({
          favoritePresets: state.favoritePresets.includes(name)
            ? state.favoritePresets.filter((p) => p !== name)
            : [...state.favoritePresets, name],
        })),

      // Transitions
      transitionTime: 2.0,
      setTransitionTime: (seconds) => set({ transitionTime: seconds }),
    }),
    {
      name: 'mangowave-settings',
    },
  ),
);
