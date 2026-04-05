import { create } from 'zustand';
import type { DeviceSyncStatus } from '../services/DeviceSyncService.ts';

interface DeviceSyncStatusState {
  status: DeviceSyncStatus;
  peerCount: number;
  roomCode: string;
  isHost: boolean;
  errorMessage: string;
  // Actions set by useDeviceSync hook, called by UI
  actions: {
    createRoom: () => Promise<string>;
    joinRoom: (code: string) => Promise<void>;
    leaveRoom: () => void;
  };
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
  errorMessage: '',
  actions: {
    createRoom: noop,
    joinRoom: noopVoid,
    leaveRoom: noopSync,
  },
}));
