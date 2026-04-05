import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useWindowSyncStatusStore } from '../store/useWindowSyncStatusStore.ts';
import { WindowSyncService } from '../services/WindowSyncService.ts';
import { getSettingsSnapshot, applyInboundSettings } from '../services/syncUtils.ts';
import type { VisualizerRenderer } from '../engine/VisualizerRenderer.ts';

const SETTINGS_DEBOUNCE_MS = 200;

export interface WindowSyncState {
  isLeader: boolean;
  peerCount: number;
  isSyncEnabled: boolean;
  isSyncAvailable: boolean;
  broadcastPreset: (name: string, transitionTime: number) => void;
  isRemotePresetRef: React.RefObject<boolean>;
}

/** Update the shared status store (read by SyncTab in SettingsPanel). */
function updateStatusStore(isLeader: boolean, peerCount: number): void {
  useWindowSyncStatusStore.setState({ isLeader, peerCount });
}

/**
 * React bridge for WindowSyncService. Manages the service lifecycle,
 * inbound/outbound message handling, and exposes sync state to components.
 */
export function useWindowSync(
  rendererRef: React.RefObject<VisualizerRenderer | null>,
  currentPreset: string,
): WindowSyncState {
  const windowSyncEnabled = useSettingsStore((s) => s.windowSyncEnabled);
  const isLeader = useWindowSyncStatusStore((s) => s.isLeader);
  const peerCount = useWindowSyncStatusStore((s) => s.peerCount);
  const serviceRef = useRef<WindowSyncService | null>(null);
  const isSyncingRef = useRef(false);
  const isRemotePresetRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPresetRef = useRef(currentPreset);

  // Keep currentPreset ref up to date for join/welcome handler
  useEffect(() => {
    currentPresetRef.current = currentPreset;
  });

  // Service lifecycle — create when enabled, destroy when disabled or on unmount
  useEffect(() => {
    if (!windowSyncEnabled) {
      if (serviceRef.current) {
        serviceRef.current.destroy();
        serviceRef.current = null;
        updateStatusStore(false, 0);
      }
      return;
    }

    const service = new WindowSyncService();
    serviceRef.current = service;

    if (!service.isAvailable) {
      return;
    }

    // Inbound: preset change
    service.onPresetChange = (presetName, transitionTime) => {
      isRemotePresetRef.current = true;
      rendererRef.current?.loadPreset(presetName, transitionTime);
    };

    // Inbound: settings change
    service.onSettingsChange = (settings) => {
      isSyncingRef.current = true;
      applyInboundSettings(settings);
      isSyncingRef.current = false;
    };

    // Inbound: join request — leader responds with current preset + settings
    service.onJoin = () => {
      if (service.isLeader && currentPresetRef.current) {
        service.sendWelcome(currentPresetRef.current);
        service.sendSettingsChange(getSettingsSnapshot());
      }
    };

    // Inbound: welcome response — load the leader's current preset
    service.onWelcome = (preset) => {
      if (preset && rendererRef.current) {
        isRemotePresetRef.current = true;
        rendererRef.current.loadPreset(preset, 0);
      }
    };

    // Leader/peer count state updates → write to shared status store
    service.onLeaderChange = (leader) => {
      updateStatusStore(leader, service.peerCount);
    };
    service.onPeerCountChange = (count) => {
      updateStatusStore(service.isLeader, count);
    };

    // Request current state from existing peers
    service.sendJoin();

    // Outbound: debounce settings changes to peers
    const unsubscribe = useSettingsStore.subscribe(() => {
      if (isSyncingRef.current) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        service.sendSettingsChange(getSettingsSnapshot());
      }, SETTINGS_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      service.destroy();
      serviceRef.current = null;
      updateStatusStore(false, 0);
    };
  }, [windowSyncEnabled, rendererRef]);

  // Outbound: broadcast preset change to peers
  const broadcastPreset = useCallback((name: string, transitionTime: number) => {
    serviceRef.current?.sendPresetChange(name, transitionTime);
  }, []);

  const isSyncAvailable = typeof BroadcastChannel !== 'undefined';

  return {
    isLeader,
    peerCount,
    isSyncEnabled: windowSyncEnabled,
    isSyncAvailable,
    broadcastPreset,
    isRemotePresetRef,
  };
}
