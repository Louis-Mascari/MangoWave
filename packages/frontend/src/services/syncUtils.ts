import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useImportedPresetsStore } from '../store/useImportedPresetsStore.ts';
import { useImportedTexturesStore } from '../store/useImportedTexturesStore.ts';
import type { EQSettings, PerformanceSettings } from '../store/useSettingsStore.ts';
import type { SyncableSettings } from './syncTypes.ts';
import {
  sanitizeAudio,
  sanitizeAutopilot,
  sanitizeEQ,
  sanitizePerformance,
} from '../utils/settingsPortability.ts';

// Auto Gain and Auto Quality tune these values to each device's own audio level and
// GPU load, so while an auto mode is on they are not shared: the receiver keeps its own
// value, and a change to them alone is not worth sending.
const QUALITY_KEYS = ['meshWidth', 'meshHeight', 'textureRatio', 'resolutionScale'] as const;

/** Merge inbound performance settings over local ones, keeping local Auto Quality values. */
export function mergeInboundPerformance(
  local: PerformanceSettings,
  inbound: Partial<PerformanceSettings>,
): PerformanceSettings {
  const merged = { ...local, ...inbound };
  if (merged.autoQuality) {
    for (const key of QUALITY_KEYS) merged[key] = local[key];
  }
  return merged;
}

/** Merge inbound EQ settings over local ones, keeping the local Auto Gain value. */
export function mergeInboundEq(local: EQSettings, inbound: Partial<EQSettings>): EQSettings {
  const merged = {
    ...local,
    ...inbound,
    bandGains: [...(inbound.bandGains ?? local.bandGains)],
  };
  if (merged.autoGain) merged.preAmpGain = local.preAmpGain;
  return merged;
}

/**
 * Identity of an outbound snapshot with auto-driven values ignored. Senders skip a
 * snapshot whose key matches the last one sent, so an Auto Gain or Auto Quality step
 * does not broadcast the whole settings state (or cost a cloud save) every few seconds.
 */
export function outboundKey(snapshot: {
  performance?: PerformanceSettings;
  eq?: EQSettings;
  eqSettings?: Partial<EQSettings>;
}): string {
  const { performance } = snapshot;
  const eq = snapshot.eq ?? snapshot.eqSettings;
  return JSON.stringify({
    ...snapshot,
    ...(performance?.autoQuality && {
      performance: {
        ...performance,
        meshWidth: 0,
        meshHeight: 0,
        textureRatio: 0,
        resolutionScale: 0,
      },
    }),
    ...(eq?.autoGain && { eq: { ...eq, preAmpGain: 0 }, eqSettings: undefined }),
  });
}

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
  const current = useSettingsStore.getState();
  const syncPerf =
    settings.syncPerformance !== undefined ? settings.syncPerformance : current.syncPerformance;
  useSettingsStore.setState({
    ...(settings.syncPerformance !== undefined && { syncPerformance: settings.syncPerformance }),
    ...(syncPerf &&
      settings.performance && {
        performance: mergeInboundPerformance(current.performance, settings.performance),
      }),
    ...(settings.eq && { eq: mergeInboundEq(current.eq, settings.eq) }),
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
    ...(performance && {
      performance: mergeInboundPerformance(current.performance, performance),
    }),
    ...(eq && { eq: mergeInboundEq(current.eq, eq) }),
    ...(audio && { audio: { ...current.audio, ...audio } }),
    ...(autopilot && { autopilot: { ...current.autopilot, ...autopilot } }),
    ...(typeof brightness === 'number' && brightness >= 0.1 && brightness <= 1.0 && { brightness }),
  });
}
