import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useDeviceSyncStatusStore } from '../store/useDeviceSyncStatusStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import type { DeviceSyncService } from '../services/DeviceSyncService.ts';
import { getDeviceSyncSnapshot, applyDeviceSyncSettings } from '../services/syncUtils.ts';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import { mobileBlockedSet } from '../data/excludedPresets.ts';
import i18n from '../i18n/index.ts';
import type { VisualizerRenderer } from '../engine/VisualizerRenderer.ts';

const SETTINGS_DEBOUNCE_MS = 500;

export interface DeviceSyncState {
  status: string;
  peerCount: number;
  roomCode: string;
  isHost: boolean;
  createRoom: () => Promise<string>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => void;
  broadcastPreset: (name: string, transitionTime: number) => void;
  broadcastPresetRedirect: (
    presetName: string,
    transitionTime: number,
    originalPreset: string,
  ) => void;
  isRemotePresetRef: React.RefObject<boolean>;
}

function updateStatusStore(
  partial: Partial<
    Pick<
      ReturnType<typeof useDeviceSyncStatusStore.getState>,
      'status' | 'peerCount' | 'roomCode' | 'isHost' | 'errorMessage'
    >
  >,
) {
  useDeviceSyncStatusStore.setState(partial);
}

/**
 * Pick a substitute preset when a mobile-blocked preset is synced from another device.
 * Returns a random preset from the renderer's available pool that isn't blocked.
 */
function pickMobileSubstitute(renderer: VisualizerRenderer): string | null {
  const presetNames = renderer.presetList;
  const overrideSet = new Set(useSettingsStore.getState().excludedOverrides);
  const available = presetNames.filter((p) => !mobileBlockedSet.has(p) || overrideSet.has(p));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * React bridge for DeviceSyncService. Manages the service lifecycle,
 * inbound/outbound message handling, and exposes sync state to components.
 */
export function useDeviceSync(
  rendererRef: React.RefObject<VisualizerRenderer | null>,
  resetAutopilotRef: React.RefObject<() => void>,
): DeviceSyncState {
  const deviceSyncEnabled = useSettingsStore((s) => s.deviceSyncEnabled);
  const deviceSyncSettingsSync = useSettingsStore((s) => s.deviceSyncSettingsSync);
  const status = useDeviceSyncStatusStore((s) => s.status);
  const peerCount = useDeviceSyncStatusStore((s) => s.peerCount);
  const roomCode = useDeviceSyncStatusStore((s) => s.roomCode);
  const isHost = useDeviceSyncStatusStore((s) => s.isHost);
  const serviceRef = useRef<DeviceSyncService | null>(null);
  const isSyncingRef = useRef(false);
  const isRemotePresetRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationInFlightRef = useRef(false);
  const deviceSyncSettingsSyncRef = useRef(deviceSyncSettingsSync);

  // Keep refs up to date
  useEffect(() => {
    deviceSyncSettingsSyncRef.current = deviceSyncSettingsSync;
  }, [deviceSyncSettingsSync]);

  // Wire up callbacks when service exists
  const setupCallbacks = useCallback(
    (service: DeviceSyncService) => {
      // Inbound: preset change
      service.onPresetChange = (presetName, transitionTime) => {
        const renderer = rendererRef.current;
        if (!renderer) return;

        // Mobile: check if preset is blocked, substitute if needed
        if (isMobileDevice && mobileBlockedSet.has(presetName)) {
          const overrideSet = new Set(useSettingsStore.getState().excludedOverrides);
          if (!overrideSet.has(presetName)) {
            const substitute = pickMobileSubstitute(renderer);
            if (substitute) {
              isRemotePresetRef.current = true;
              renderer.loadPreset(substitute, transitionTime);
              resetAutopilotRef.current();
              // Broadcast redirect so other devices know we substituted
              service.sendPresetRedirect(substitute, transitionTime, presetName);
            }
            return;
          }
        }

        // Check if preset exists on this device (imported presets are local to IDB)
        if (!renderer.presetList.includes(presetName)) {
          const t = i18n.getFixedT(null, 'messages');
          useToastStore.getState().show(t('toasts.presetNotFound', { name: presetName }));
          return;
        }

        isRemotePresetRef.current = true;
        renderer.loadPreset(presetName, transitionTime);
        // Reset host's autopilot timer on remote preset change
        resetAutopilotRef.current();
      };

      // Inbound: preset redirect — desktops ignore (prevents loops)
      service.onPresetRedirect = () => {
        // Intentionally ignored on all platforms to prevent redirect loops.
        // Mobile devices only generate redirects, they don't consume them.
      };

      // Inbound: settings change
      service.onSettingsChange = (settings) => {
        isSyncingRef.current = true;
        // Always apply autopilot settings regardless of deviceSyncSettingsSync toggle
        if (settings.autopilot) {
          useSettingsStore.setState({ autopilot: { ...settings.autopilot } });
        }
        // Apply EQ/performance/audio only if settings sync is enabled
        if (deviceSyncSettingsSyncRef.current) {
          applyDeviceSyncSettings({ ...settings, autopilot: undefined });
        }
        isSyncingRef.current = false;
      };

      service.onStatusChange = (newStatus, errorMessage) => {
        updateStatusStore({
          status: newStatus,
          errorMessage: errorMessage ?? '',
        });
      };

      service.onPeerCountChange = (count) => {
        updateStatusStore({ peerCount: count });
      };
    },
    [rendererRef, resetAutopilotRef],
  );

  // Clean up service when device sync is disabled
  useEffect(() => {
    if (!deviceSyncEnabled && serviceRef.current) {
      serviceRef.current.destroy();
      serviceRef.current = null;
      updateStatusStore({
        status: 'idle',
        peerCount: 0,
        roomCode: '',
        isHost: false,
        errorMessage: '',
      });
    }
  }, [deviceSyncEnabled]);

  // Clean up service on unmount (prevents PeerJS/WebRTC/heartbeat leaks)
  useEffect(() => {
    return () => {
      serviceRef.current?.destroy();
      serviceRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  // Outbound: debounced settings sync (autopilot always, EQ/perf gated)
  useEffect(() => {
    if (!deviceSyncEnabled) return;

    const unsubscribe = useSettingsStore.subscribe(() => {
      if (isSyncingRef.current) return;
      const service = serviceRef.current;
      if (!service || service.status !== 'connected') return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        const snapshot = getDeviceSyncSnapshot();
        service.sendSettingsChange(snapshot);
      }, SETTINGS_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [deviceSyncEnabled]);

  // Imperative actions — exposed via status store for UI to call
  const createRoom = useCallback(async (): Promise<string> => {
    if (operationInFlightRef.current) return '';
    operationInFlightRef.current = true;
    try {
      // Destroy any existing service before creating a new one
      if (serviceRef.current) {
        serviceRef.current.destroy();
        serviceRef.current = null;
      }
      const { DeviceSyncService: DSS } = await import('../services/DeviceSyncService.ts');
      const service = new DSS();
      serviceRef.current = service;
      setupCallbacks(service);
      const code = await service.createRoom();
      updateStatusStore({ roomCode: code, isHost: true });
      return code;
    } finally {
      operationInFlightRef.current = false;
    }
  }, [setupCallbacks]);

  const joinRoom = useCallback(
    async (code: string): Promise<void> => {
      if (operationInFlightRef.current) return;
      operationInFlightRef.current = true;
      try {
        // Destroy any existing service before joining a new room
        if (serviceRef.current) {
          serviceRef.current.destroy();
          serviceRef.current = null;
        }
        const { DeviceSyncService: DSS } = await import('../services/DeviceSyncService.ts');
        const service = new DSS();
        serviceRef.current = service;
        setupCallbacks(service);
        await service.joinRoom(code);
        updateStatusStore({ roomCode: code.toUpperCase(), isHost: false });
      } finally {
        operationInFlightRef.current = false;
      }
    },
    [setupCallbacks],
  );

  const leaveRoom = useCallback(() => {
    serviceRef.current?.destroy();
    serviceRef.current = null;
    updateStatusStore({
      status: 'idle',
      peerCount: 0,
      roomCode: '',
      isHost: false,
      errorMessage: '',
    });
  }, []);

  // Register actions on the store so UI components can call them
  useEffect(() => {
    useDeviceSyncStatusStore.setState({
      actions: { createRoom, joinRoom, leaveRoom },
    });
    return () => {
      useDeviceSyncStatusStore.setState({
        actions: {
          createRoom: () => Promise.resolve(''),
          joinRoom: () => Promise.resolve(),
          leaveRoom: () => {},
        },
      });
    };
  }, [createRoom, joinRoom, leaveRoom]);

  const broadcastPreset = useCallback((name: string, transitionTime: number) => {
    serviceRef.current?.sendPresetChange(name, transitionTime);
  }, []);

  const broadcastPresetRedirect = useCallback(
    (presetName: string, transitionTime: number, originalPreset: string) => {
      serviceRef.current?.sendPresetRedirect(presetName, transitionTime, originalPreset);
    },
    [],
  );

  return {
    status,
    peerCount,
    roomCode,
    isHost,
    createRoom,
    joinRoom,
    leaveRoom,
    broadcastPreset,
    broadcastPresetRedirect,
    isRemotePresetRef,
  };
}
