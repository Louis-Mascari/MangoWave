import type {
  PerformanceSettings,
  EQSettings,
  AudioSettings,
  AutopilotSettings,
  CustomPack,
} from '../store/useSettingsStore.ts';

const CHANNEL_NAME = 'mangowave-sync';
const HEARTBEAT_INTERVAL_MS = 2000;
const PEER_TIMEOUT_MS = 4000;

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
  syncPerformance?: boolean;
  customPacks?: CustomPack[];
  activeCustomPackId?: string | null;
}

interface SyncMessageBase {
  senderId: string;
  timestamp: number;
}

type SyncMessagePayload =
  | { type: 'preset-change'; presetName: string; transitionTime: number }
  | { type: 'settings-change'; settings: SyncableSettings }
  | { type: 'heartbeat'; isLeader: boolean }
  | { type: 'join' }
  | { type: 'welcome'; currentPreset: string }
  | { type: 'leave' };

type SyncMessage = SyncMessageBase & SyncMessagePayload;

type PresetChangeHandler = (presetName: string, transitionTime: number) => void;
type SettingsChangeHandler = (settings: SyncableSettings) => void;
type JoinHandler = () => void;
type WelcomeHandler = (currentPreset: string) => void;
type LeaderChangeHandler = (isLeader: boolean) => void;
type PeerCountChangeHandler = (count: number) => void;

/** Validate that a message looks like a SyncMessage (guard against malformed data). */
function isValidSyncMessage(data: unknown): data is SyncMessage {
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
    default:
      return false;
  }
}

/**
 * BroadcastChannel-based service for syncing preset changes and settings
 * across browser windows on the same origin. Plain class (no React dependency).
 *
 * Gracefully degrades to no-op if BroadcastChannel is unavailable.
 */
export class WindowSyncService {
  private channel: BroadcastChannel | null = null;
  readonly tabId: string;
  private peers = new Map<string, number>(); // peerId → last-seen timestamp
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _isLeader = false;
  private _prevPeerCount = 0;

  // Callbacks
  private _onPresetChange: PresetChangeHandler | null = null;
  private _onSettingsChange: SettingsChangeHandler | null = null;
  private _onJoin: JoinHandler | null = null;
  private _onWelcome: WelcomeHandler | null = null;
  private _onLeaderChange: LeaderChangeHandler | null = null;
  private _onPeerCountChange: PeerCountChangeHandler | null = null;

  constructor() {
    this.tabId = crypto.randomUUID();

    if (typeof BroadcastChannel === 'undefined') return;

    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event: MessageEvent) => {
      if (isValidSyncMessage(event.data)) {
        this.handleMessage(event.data);
      }
    };

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
      this.pruneStalePeers();
      this.electLeader();
      this.notifyPeerCount();
    }, HEARTBEAT_INTERVAL_MS);

    // Initial heartbeat
    this.sendHeartbeat();
  }

  get isLeader(): boolean {
    return this._isLeader;
  }
  get peerCount(): number {
    return this.peers.size;
  }
  get isAvailable(): boolean {
    return this.channel !== null;
  }

  // Callback setters
  set onPresetChange(handler: PresetChangeHandler | null) {
    this._onPresetChange = handler;
  }
  set onSettingsChange(handler: SettingsChangeHandler | null) {
    this._onSettingsChange = handler;
  }
  set onJoin(handler: JoinHandler | null) {
    this._onJoin = handler;
  }
  set onWelcome(handler: WelcomeHandler | null) {
    this._onWelcome = handler;
  }
  set onLeaderChange(handler: LeaderChangeHandler | null) {
    this._onLeaderChange = handler;
  }
  set onPeerCountChange(handler: PeerCountChangeHandler | null) {
    this._onPeerCountChange = handler;
  }

  // Send methods
  sendPresetChange(presetName: string, transitionTime: number): void {
    this.send({ type: 'preset-change', presetName, transitionTime });
  }

  sendSettingsChange(settings: SyncableSettings): void {
    this.send({ type: 'settings-change', settings });
  }

  sendHeartbeat(): void {
    this.send({ type: 'heartbeat', isLeader: this._isLeader });
  }

  sendJoin(): void {
    this.send({ type: 'join' });
  }

  sendWelcome(currentPreset: string): void {
    this.send({ type: 'welcome', currentPreset });
  }

  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    // Notify peers before closing
    this.send({ type: 'leave' });
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.peers.clear();
    this._onPresetChange = null;
    this._onSettingsChange = null;
    this._onJoin = null;
    this._onWelcome = null;
    this._onLeaderChange = null;
    this._onPeerCountChange = null;
  }

  private send(message: SyncMessagePayload): void {
    this.channel?.postMessage({
      ...message,
      senderId: this.tabId,
      timestamp: Date.now(),
    });
  }

  private handleMessage(msg: SyncMessage): void {
    // Echo suppression
    if (msg.senderId === this.tabId) return;

    // Leave: remove peer immediately and re-elect
    if (msg.type === 'leave') {
      this.peers.delete(msg.senderId);
      this.electLeader();
      this.notifyPeerCount();
      return;
    }

    // Track peer
    this.peers.set(msg.senderId, msg.timestamp);
    this.electLeader();
    this.notifyPeerCount();

    switch (msg.type) {
      case 'preset-change':
        this._onPresetChange?.(msg.presetName, msg.transitionTime);
        break;
      case 'settings-change':
        this._onSettingsChange?.(msg.settings);
        break;
      case 'heartbeat':
        // Peer already tracked above
        break;
      case 'join':
        this._onJoin?.();
        break;
      case 'welcome':
        this._onWelcome?.(msg.currentPreset);
        break;
    }
  }

  private pruneStalePeers(): void {
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    for (const [peerId, lastSeen] of this.peers) {
      if (lastSeen < cutoff) {
        this.peers.delete(peerId);
      }
    }
  }

  private electLeader(): void {
    // Leader = lowest tabId among all alive tabs (including self)
    const allIds = [this.tabId, ...this.peers.keys()];
    allIds.sort();
    const newIsLeader = allIds[0] === this.tabId;

    if (newIsLeader !== this._isLeader) {
      this._isLeader = newIsLeader;
      this._onLeaderChange?.(newIsLeader);
    }
  }

  private notifyPeerCount(): void {
    const count = this.peers.size;
    if (count !== this._prevPeerCount) {
      this._prevPeerCount = count;
      this._onPeerCountChange?.(count);
    }
  }
}
