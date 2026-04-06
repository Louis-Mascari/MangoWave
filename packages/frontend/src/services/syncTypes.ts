import type {
  PerformanceSettings,
  EQSettings,
  AudioSettings,
  AutopilotSettings,
  CustomPack,
  ImportedPresetMeta,
  ImportedTextureMeta,
} from '../store/useSettingsStore.ts';

export interface SyncableSettings {
  performance?: PerformanceSettings;
  eq?: EQSettings;
  audio?: AudioSettings;
  autopilot?: AutopilotSettings;
  transitionTime?: number;
  blockedPresets?: string[];
  favoritePresets?: string[];
  enabledPacks?: string[];
  excludedOverrides?: string[];
  presetNameDisplay?: 'off' | 'always' | number;
  songInfoDisplay?: 'off' | number;
  volume?: number;
  brightness?: number;
  syncPerformance?: boolean;
  customPacks?: CustomPack[];
  activeCustomPackId?: string | null;
  importedPresets?: ImportedPresetMeta[];
  importedTextures?: ImportedTextureMeta[];
}

interface SyncMessageBase {
  senderId: string;
  timestamp: number;
}

export type SyncMessagePayload =
  | { type: 'preset-change'; presetName: string; transitionTime: number }
  | { type: 'settings-change'; settings: SyncableSettings }
  | { type: 'heartbeat'; isLeader: boolean }
  | { type: 'join' }
  | { type: 'welcome'; currentPreset: string }
  | { type: 'leave' }
  | { type: 'preset-redirect'; presetName: string; transitionTime: number; originalPreset: string };

export type SyncMessage = SyncMessageBase & SyncMessagePayload;

/** Validate that a message looks like a SyncMessage (guard against malformed data). */
export function isValidSyncMessage(data: unknown): data is SyncMessage {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const msg = data as Record<string, unknown>;
  if (typeof msg.senderId !== 'string' || typeof msg.timestamp !== 'number') return false;
  switch (msg.type) {
    case 'preset-change':
      return typeof msg.presetName === 'string' && typeof msg.transitionTime === 'number';
    case 'settings-change':
      return msg.settings !== null && typeof msg.settings === 'object';
    case 'heartbeat':
      return typeof msg.isLeader === 'boolean';
    case 'join':
    case 'leave':
      return true;
    case 'welcome':
      return typeof (msg as Record<string, unknown>).currentPreset === 'string';
    case 'preset-redirect':
      return (
        typeof msg.presetName === 'string' &&
        typeof msg.transitionTime === 'number' &&
        typeof msg.originalPreset === 'string'
      );
    default:
      return false;
  }
}
