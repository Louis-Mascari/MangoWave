import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useImportedPresetsStore } from '../store/useImportedPresetsStore.ts';
import { useImportedTexturesStore } from '../store/useImportedTexturesStore.ts';
import type { SyncableSettings } from './syncTypes.ts';
import {
  sanitizeAudio,
  sanitizeAutopilot,
  sanitizeEQ,
  sanitizePerformance,
} from '../utils/settingsPortability.ts';

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
 * WebRTC data comes from remote peers (not same-origin, possibly a different app version), so
 * every field goes through the same sanitizers as a settings file import. Fields the peer
 * omitted keep their current value.
 */
export function applyDeviceSyncSettings(settings: SyncableSettings): void {
  if (!settings || typeof settings !== 'object') return;
  const current = useSettingsStore.getState();
  const syncPerf =
    typeof settings.syncPerformance === 'boolean'
      ? settings.syncPerformance
      : current.syncPerformance;
  const performance = syncPerf ? sanitizePerformance(settings.performance) : undefined;
  const eq = sanitizeEQ(settings.eq);
  const audio = sanitizeAudio(settings.audio);
  const autopilot = sanitizeAutopilot(settings.autopilot);
  const { brightness } = settings;
  useSettingsStore.setState({
    ...(typeof settings.syncPerformance === 'boolean' && {
      syncPerformance: settings.syncPerformance,
    }),
    ...(performance && { performance: { ...current.performance, ...performance } }),
    ...(eq && { eq: { ...current.eq, ...eq } }),
    ...(audio && { audio: { ...current.audio, ...audio } }),
    ...(autopilot && { autopilot: { ...current.autopilot, ...autopilot } }),
    ...(typeof brightness === 'number' && brightness >= 0.1 && brightness <= 1.0 && { brightness }),
  });
}
