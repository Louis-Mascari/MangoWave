import type { SyncableSettings, SyncMessagePayload } from './syncTypes.ts';

export type DeviceSyncStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

type PresetChangeHandler = (presetName: string, transitionTime: number) => void;
type PresetRedirectHandler = (
  presetName: string,
  transitionTime: number,
  originalPreset: string,
) => void;
type SettingsChangeHandler = (settings: SyncableSettings) => void;
type StatusChangeHandler = (status: DeviceSyncStatus, errorMessage?: string) => void;
type PeerCountChangeHandler = (count: number) => void;

/** Characters used in room codes (no I/O to avoid ambiguity). */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

interface PeerConnection {
  conn: import('peerjs').DataConnection;
  lastSeen: number;
}

const HEARTBEAT_INTERVAL_MS = 3000;
const PEER_TIMEOUT_MS = 6000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];
const CONNECTION_TIMEOUT_MS = 15000;

/** ICE servers for NAT traversal — Google STUN servers are free and widely available. */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/** Validate PeerJS DataChannel messages (same shape as sync messages but parsed from JSON). */
function isValidDeviceMessage(
  data: unknown,
): data is SyncMessagePayload & { senderId: string; timestamp: number } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const msg = data as Record<string, unknown>;
  if (typeof msg.senderId !== 'string' || typeof msg.timestamp !== 'number') return false;
  switch (msg.type) {
    case 'preset-change':
      return typeof msg.presetName === 'string' && typeof msg.transitionTime === 'number';
    case 'settings-change':
      return msg.settings !== null && typeof msg.settings === 'object';
    case 'heartbeat':
      return true;
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

/**
 * PeerJS-based service for syncing preset changes and settings across devices via WebRTC.
 * Star topology: room creator = host, all peers connect to host, host relays.
 */
export class DeviceSyncService {
  private peer: import('peerjs').Peer | null = null;
  private connections = new Map<string, PeerConnection>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _isHost = false;
  private _status: DeviceSyncStatus = 'idle';
  private _roomCode = '';
  private _peerId = '';
  private _retryCount = 0;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _destroyed = false;
  private _codeRetries = 0;
  private _prevPeerCount = 0;

  // Callbacks
  private _onPresetChange: PresetChangeHandler | null = null;
  private _onPresetRedirect: PresetRedirectHandler | null = null;
  private _onSettingsChange: SettingsChangeHandler | null = null;
  private _onStatusChange: StatusChangeHandler | null = null;
  private _onPeerCountChange: PeerCountChangeHandler | null = null;

  get isHost(): boolean {
    return this._isHost;
  }
  get status(): DeviceSyncStatus {
    return this._status;
  }
  get roomCode(): string {
    return this._roomCode;
  }
  get peerCount(): number {
    return this.connections.size;
  }

  // Callback setters
  set onPresetChange(handler: PresetChangeHandler | null) {
    this._onPresetChange = handler;
  }
  set onPresetRedirect(handler: PresetRedirectHandler | null) {
    this._onPresetRedirect = handler;
  }
  set onSettingsChange(handler: SettingsChangeHandler | null) {
    this._onSettingsChange = handler;
  }
  set onStatusChange(handler: StatusChangeHandler | null) {
    this._onStatusChange = handler;
  }
  set onPeerCountChange(handler: PeerCountChangeHandler | null) {
    this._onPeerCountChange = handler;
  }

  /** Generate a MANGO-XXXX room code. */
  private static generateCode(): string {
    const chars: string[] = [];
    for (let i = 0; i < 4; i++) {
      chars.push(CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]);
    }
    return `MANGO-${chars.join('')}`;
  }

  /** Create a room as host. Returns the room code. */
  async createRoom(): Promise<string> {
    const code = DeviceSyncService.generateCode();
    this._isHost = true;
    this._roomCode = code;
    this.setStatus('connecting');

    const { Peer } = await import('peerjs');
    if (this._destroyed) return '';

    return new Promise<string>((resolve, reject) => {
      // Host's peer ID IS the room code
      this.peer = new Peer(code, { config: { iceServers: ICE_SERVERS } });

      const timeout = setTimeout(() => {
        if (this._destroyed) return;
        this.setStatus('error', 'Connection timed out — could not reach signaling server');
        this.peer?.destroy();
        this.peer = null;
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT_MS);

      this.peer.on('open', () => {
        clearTimeout(timeout);
        if (this._destroyed) return;
        this._peerId = code;
        this.setStatus('connected');
        this.startHeartbeat();
        resolve(code);
      });

      this.peer.on('connection', (conn) => {
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        if (this._destroyed) return;
        const peerError = err as import('peerjs').PeerError<string>;
        if (peerError.type === 'unavailable-id' && this._codeRetries < 5) {
          // Room code collision — try again with different code
          this._codeRetries++;
          this.peer?.destroy();
          this.peer = null;
          this.createRoom().then(resolve).catch(reject);
        } else {
          this.setStatus('error', peerError.message);
          reject(err);
        }
      });

      this.peer.on('disconnected', () => {
        if (this._destroyed) return;
        // Try to reconnect to signaling server
        this.peer?.reconnect();
      });
    });
  }

  /** Join an existing room as a non-host peer. */
  async joinRoom(code: string): Promise<void> {
    this._isHost = false;
    this._roomCode = code.toUpperCase();
    this._retryCount = 0;
    this.setStatus('connecting');

    await this.connectToHost();
  }

  private async connectToHost(): Promise<void> {
    const { Peer } = await import('peerjs');
    if (this._destroyed) return;

    return new Promise<void>((resolve, reject) => {
      this.peer = new Peer({ config: { iceServers: ICE_SERVERS } });

      const timeout = setTimeout(() => {
        if (this._destroyed) return;
        this.setStatus('error', 'Connection timed out — could not connect to room');
        this.peer?.destroy();
        this.peer = null;
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT_MS);

      this.peer.on('open', (id) => {
        if (this._destroyed) {
          clearTimeout(timeout);
          return;
        }
        this._peerId = id;

        const conn = this.peer!.connect(this._roomCode, {
          reliable: true,
          serialization: 'json',
        });
        this.setupConnection(conn);

        conn.on('open', () => {
          clearTimeout(timeout);
          if (this._destroyed) return;
          this._retryCount = 0;
          this.setStatus('connected');
          this.startHeartbeat();
          resolve();
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          if (this._destroyed) return;
          this.handleConnectionError(err);
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        if (this._destroyed) return;
        const peerError = err as import('peerjs').PeerError<string>;
        if (peerError.type === 'peer-unavailable') {
          this.setStatus('error', 'Room not found');
          reject(err);
        } else {
          this.handleConnectionError(err);
          reject(err);
        }
      });
    });
  }

  /** Send a preset change to all connected peers. */
  sendPresetChange(presetName: string, transitionTime: number): void {
    this.broadcast({ type: 'preset-change', presetName, transitionTime });
  }

  /** Send a preset redirect (mobile blocked preset substitution). */
  sendPresetRedirect(presetName: string, transitionTime: number, originalPreset: string): void {
    this.broadcast({ type: 'preset-redirect', presetName, transitionTime, originalPreset });
  }

  /** Send settings to all connected peers. */
  sendSettingsChange(settings: SyncableSettings): void {
    this.broadcast({ type: 'settings-change', settings });
  }

  /** Disconnect and clean up all resources. */
  destroy(): void {
    this._destroyed = true;

    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const { conn } of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    this._onPresetChange = null;
    this._onPresetRedirect = null;
    this._onSettingsChange = null;
    this._onStatusChange = null;
    this._onPeerCountChange = null;
  }

  private setupConnection(conn: import('peerjs').DataConnection): void {
    conn.on('open', () => {
      if (this._destroyed) return;
      this.connections.set(conn.peer, { conn, lastSeen: Date.now() });
      this.notifyPeerCount();
    });

    conn.on('data', (raw) => {
      if (this._destroyed) return;
      if (!isValidDeviceMessage(raw)) {
        console.warn('[DeviceSync] invalid message received:', raw);
        return;
      }

      // Update last-seen
      const peer = this.connections.get(conn.peer);
      if (peer) peer.lastSeen = Date.now();

      if ((raw as { type: string }).type !== 'heartbeat') {
        console.log('[DeviceSync] received', (raw as { type: string }).type, 'from', conn.peer);
      }

      // Host relays to all other peers (skip heartbeats — O(N²) waste)
      if (this._isHost && raw.type !== 'heartbeat') {
        this.relayToOthers(raw, conn.peer);
      }

      this.handleMessage(raw);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.notifyPeerCount();

      // Non-host: host disconnected
      if (!this._isHost && this.connections.size === 0) {
        this.setStatus('disconnected');
        this.stopHeartbeat();
        this.attemptReconnect();
      }
    });

    conn.on('error', (err) => {
      if (this._destroyed) return;
      this.connections.delete(conn.peer);
      this.notifyPeerCount();
      console.warn('[DeviceSync] Connection error:', err);
    });
  }

  private handleMessage(msg: SyncMessagePayload & { senderId: string; timestamp: number }): void {
    switch (msg.type) {
      case 'preset-change':
        this._onPresetChange?.(msg.presetName, msg.transitionTime);
        break;
      case 'preset-redirect':
        this._onPresetRedirect?.(msg.presetName, msg.transitionTime, msg.originalPreset);
        break;
      case 'settings-change':
        this._onSettingsChange?.(msg.settings);
        break;
      case 'heartbeat':
        // Already tracked via lastSeen update above
        break;
    }
  }

  private broadcast(message: SyncMessagePayload): void {
    const payload = { ...message, senderId: this._peerId, timestamp: Date.now() };
    let sent = 0;
    for (const { conn } of this.connections.values()) {
      if (conn.open) {
        conn.send(payload);
        sent++;
      }
    }
    if (message.type !== 'heartbeat') {
      console.log('[DeviceSync] broadcast', message.type, `to ${sent}/${this.connections.size}`);
    }
  }

  /** Host-only: relay a received message to all peers except the sender. */
  private relayToOthers(
    msg: SyncMessagePayload & { senderId: string; timestamp: number },
    fromPeerId: string,
  ): void {
    for (const [peerId, { conn }] of this.connections) {
      if (peerId !== fromPeerId && conn.open) {
        conn.send(msg);
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.broadcast({ type: 'heartbeat', isLeader: this._isHost });
      if (this._isHost) {
        this.pruneStalePeers();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private pruneStalePeers(): void {
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    for (const [peerId, { lastSeen, conn }] of this.connections) {
      if (lastSeen < cutoff) {
        conn.close();
        this.connections.delete(peerId);
      }
    }
    this.notifyPeerCount();
  }

  private handleConnectionError(_err: unknown): void {
    this.attemptReconnect();
  }

  private attemptReconnect(): void {
    if (this._destroyed || this._isHost) return;
    // Guard against duplicate calls (e.g., both conn and peer error fire)
    if (this._retryTimer) return;
    if (this._retryCount >= MAX_RETRIES) {
      this.setStatus('error', 'Connection lost');
      return;
    }

    const delay = RETRY_DELAYS[this._retryCount] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
    this._retryCount++;
    this.setStatus('connecting');

    this._retryTimer = setTimeout(async () => {
      this._retryTimer = null;
      if (this._destroyed) return;
      // Clean up old peer before reconnecting
      if (this.peer) {
        this.peer.destroy();
        this.peer = null;
      }
      this.connections.clear();
      try {
        await this.connectToHost();
      } catch {
        // connectToHost will call handleConnectionError or setStatus on failure
      }
    }, delay);
  }

  private setStatus(status: DeviceSyncStatus, errorMessage?: string): void {
    this._status = status;
    this._onStatusChange?.(status, errorMessage);
  }

  private notifyPeerCount(): void {
    const count = this.connections.size;
    if (count !== this._prevPeerCount) {
      this._prevPeerCount = count;
      this._onPeerCountChange?.(count);
    }
  }
}
