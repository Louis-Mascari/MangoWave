import { create } from 'zustand';

interface WindowSyncStatusState {
  isLeader: boolean;
  peerCount: number;
  isSyncAvailable: boolean;
}

/**
 * Lightweight store for window sync status. Written by useWindowSync hook,
 * read by SyncTab in SettingsPanel. Not persisted — ephemeral runtime state.
 */
export const useWindowSyncStatusStore = create<WindowSyncStatusState>(() => ({
  isLeader: false,
  peerCount: 0,
  isSyncAvailable: typeof BroadcastChannel !== 'undefined',
}));
