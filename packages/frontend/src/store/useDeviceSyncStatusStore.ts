import { create } from 'zustand';
import type { DeviceSyncErrorCode, DeviceSyncStatus } from '../services/DeviceSyncService.ts';

interface DeviceSyncStatusState {
  status: DeviceSyncStatus;
  peerCount: number;
  roomCode: string;
  isHost: boolean;
  /** Set while `status` is `error`; null when the service gave no specific reason. */
  errorCode: DeviceSyncErrorCode | null;
  // Actions set by useDeviceSync hook, called by UI
  actions: {
    createRoom: () => Promise<string>;
    joinRoom: (code: string) => Promise<void>;
    leaveRoom: () => void;
  };
}

/** Translation key (`settings` namespace) for each error code — resolve at display time. */
const DEVICE_SYNC_ERROR_KEYS: Record<DeviceSyncErrorCode, string> = {
  roomNotFound: 'sync.deviceSync.roomNotFound',
  signalingTimeout: 'sync.deviceSync.signalingTimeout',
  joinTimeout: 'sync.deviceSync.joinTimeout',
  connectionLost: 'sync.deviceSync.connectionLost',
  connectionFailed: 'sync.deviceSync.connectionFailed',
};

/** Key for the message to show for an error status; generic when there is no code. */
export function deviceSyncErrorKey(errorCode: DeviceSyncErrorCode | null): string {
  return errorCode ? DEVICE_SYNC_ERROR_KEYS[errorCode] : 'sync.deviceSync.error';
}

const noop = () => Promise.resolve('' as string);
const noopVoid = () => Promise.resolve();
const noopSync = () => {};

/**
 * Lightweight store for device sync status. Written by useDeviceSync hook,
 * read by SyncTab in SettingsPanel. Not persisted — ephemeral runtime state.
 */
export const useDeviceSyncStatusStore = create<DeviceSyncStatusState>(() => ({
  status: 'idle',
  peerCount: 0,
  roomCode: '',
  isHost: false,
  errorCode: null,
  actions: {
    createRoom: noop,
    joinRoom: noopVoid,
    leaveRoom: noopSync,
  },
}));
