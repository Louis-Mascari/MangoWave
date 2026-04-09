import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useImportedPresetsStore } from '../store/useImportedPresetsStore.ts';
import { useImportedTexturesStore } from '../store/useImportedTexturesStore.ts';
import type { SyncableSettings } from './syncTypes.ts';

/** Snapshot the syncable subset of settings from the store. */
export function getSettingsSnapshot(): SyncableSettings {
  const {
    performance,
    eq,
    audio,
    autopilot,
    transitionTime,
    blockedPresets,
    favoritePresets,
    enabledPacks,
    excludedOverrides,
    presetNameDisplay,
    songInfoDisplay,
    volume,
    brightness,
    syncPerformance,
    customPacks,
    activeCustomPackId,
    importedPresets,
    importedTextures,
  } = useSettingsStore.getState();
  return {
    ...(syncPerformance && { performance: { ...performance } }),
    eq: { preAmpGain: eq.preAmpGain, bandGains: [...eq.bandGains], autoGain: eq.autoGain },
    audio: { ...audio },
    autopilot: { ...autopilot },
    transitionTime,
    blockedPresets: [...blockedPresets],
    favoritePresets: [...favoritePresets],
    enabledPacks: [...enabledPacks],
    excludedOverrides: [...excludedOverrides],
    presetNameDisplay,
    songInfoDisplay,
    volume,
    brightness,
    syncPerformance,
    customPacks: customPacks.map((p) => ({ ...p, presets: [...p.presets] })),
    activeCustomPackId,
    importedPresets: importedPresets.map((p) => ({ ...p })),
    importedTextures: importedTextures.map((t) => ({ ...t })),
  };
}

/**
 * Apply inbound settings to the store (shallow spread for nested objects).
 * Unlike settingsPortability.ts (file import), we skip full sanitization here because
 * BroadcastChannel uses the structured clone algorithm (strips __proto__, functions, etc.)
 * and is same-origin only — an attacker with same-origin access already has full JS execution.
 */
export function applyInboundSettings(settings: SyncableSettings): void {
  // Apply syncPerformance first so the performance gate uses the incoming value
  const syncPerf =
    settings.syncPerformance !== undefined
      ? settings.syncPerformance
      : useSettingsStore.getState().syncPerformance;
  useSettingsStore.setState({
    ...(settings.syncPerformance !== undefined && { syncPerformance: settings.syncPerformance }),
    ...(syncPerf && settings.performance && { performance: { ...settings.performance } }),
    ...(settings.eq && {
      eq: {
        preAmpGain: settings.eq.preAmpGain,
        bandGains: [...settings.eq.bandGains],
        autoGain: settings.eq.autoGain ?? useSettingsStore.getState().eq.autoGain,
      },
    }),
    ...(settings.audio && { audio: { ...settings.audio } }),
    ...(settings.autopilot && { autopilot: { ...settings.autopilot } }),
    ...(settings.transitionTime !== undefined && { transitionTime: settings.transitionTime }),
    ...(settings.blockedPresets && { blockedPresets: [...settings.blockedPresets] }),
    ...(settings.favoritePresets && { favoritePresets: [...settings.favoritePresets] }),
    ...(settings.enabledPacks && { enabledPacks: [...settings.enabledPacks] }),
    ...(settings.excludedOverrides && { excludedOverrides: [...settings.excludedOverrides] }),
    ...(settings.presetNameDisplay !== undefined && {
      presetNameDisplay: settings.presetNameDisplay,
    }),
    ...(settings.songInfoDisplay !== undefined && { songInfoDisplay: settings.songInfoDisplay }),
    ...(settings.volume !== undefined && { volume: settings.volume }),
    ...(settings.brightness !== undefined && { brightness: settings.brightness }),
    ...(settings.customPacks && {
      customPacks: settings.customPacks.map((p) => ({ ...p, presets: [...p.presets] })),
    }),
    ...(settings.activeCustomPackId !== undefined && {
      activeCustomPackId: settings.activeCustomPackId,
    }),
    ...(settings.importedPresets && {
      importedPresets: settings.importedPresets.map((p) => ({ ...p })),
    }),
    ...(settings.importedTextures && {
      importedTextures: settings.importedTextures.map((t) => ({ ...t })),
    }),
  });

  // All windows share same-origin IDB — reload to pick up any new imported presets/textures
  if (settings.importedPresets) {
    useImportedPresetsStore.getState().loadFromIdb();
  }
  if (settings.importedTextures) {
    useImportedTexturesStore.getState().loadFromIdb();
  }
}

/** Snapshot a smaller subset for device sync optional settings sync (EQ, pre-amp, performance, brightness, autopilot). */
export function getDeviceSyncSnapshot(): SyncableSettings {
  const { performance, eq, audio, autopilot, brightness, syncPerformance } =
    useSettingsStore.getState();
  return {
    ...(syncPerformance && { performance: { ...performance } }),
    eq: { preAmpGain: eq.preAmpGain, bandGains: [...eq.bandGains], autoGain: eq.autoGain },
    audio: { ...audio },
    autopilot: { ...autopilot },
    brightness,
    syncPerformance,
  };
}

/**
 * Apply inbound device sync settings (subset — only EQ, performance, audio, brightness, autopilot).
 * Does NOT apply the full window sync settings (favorites, blocked, packs, etc.).
 * Includes basic validation since WebRTC data comes from remote peers (not same-origin).
 */
export function applyDeviceSyncSettings(settings: SyncableSettings): void {
  if (!settings || typeof settings !== 'object') return;
  const syncPerf =
    settings.syncPerformance !== undefined
      ? settings.syncPerformance
      : useSettingsStore.getState().syncPerformance;
  useSettingsStore.setState({
    ...(typeof settings.syncPerformance === 'boolean' && {
      syncPerformance: settings.syncPerformance,
    }),
    ...(syncPerf &&
      settings.performance &&
      typeof settings.performance === 'object' && { performance: { ...settings.performance } }),
    ...(settings.eq &&
      typeof settings.eq === 'object' &&
      typeof settings.eq.preAmpGain === 'number' &&
      Array.isArray(settings.eq.bandGains) && {
        eq: {
          preAmpGain: settings.eq.preAmpGain,
          bandGains: [...settings.eq.bandGains],
          autoGain:
            typeof settings.eq.autoGain === 'boolean'
              ? settings.eq.autoGain
              : useSettingsStore.getState().eq.autoGain,
        },
      }),
    ...(settings.audio &&
      typeof settings.audio === 'object' && {
        audio: { ...settings.audio },
      }),
    ...(settings.autopilot &&
      typeof settings.autopilot === 'object' && { autopilot: { ...settings.autopilot } }),
    ...(typeof settings.brightness === 'number' &&
      settings.brightness >= 0.1 &&
      settings.brightness <= 1.0 && { brightness: settings.brightness }),
  });
}
