import { useEffect, useRef } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { saveSettings, loadSettings } from '../services/spotifyApi.ts';
import type { CloudSettings } from '../services/spotifyApi.ts';

const DEBOUNCE_MS = 2000;

function getSettingsSnapshot(): CloudSettings {
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
    customPacks,
    activeCustomPackId,
    importedPresets,
  } = useSettingsStore.getState();
  return {
    performance: { ...performance },
    eqSettings: { preAmpGain: eq.preAmpGain, bandGains: [...eq.bandGains] },
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
    customPacks: customPacks.map((p) => ({ ...p, presets: [...p.presets] })),
    activeCustomPackId,
    importedPresets: importedPresets.map((p) => ({ ...p })),
  };
}

function applyCloudSettings(cloud: CloudSettings): void {
  useSettingsStore.setState({
    ...(cloud.performance && { performance: { ...cloud.performance } }),
    ...(cloud.eqSettings && {
      eq: { preAmpGain: cloud.eqSettings.preAmpGain, bandGains: [...cloud.eqSettings.bandGains] },
    }),
    ...(cloud.audio && { audio: { ...cloud.audio } }),
    ...(cloud.autopilot && { autopilot: { ...cloud.autopilot } }),
    ...(cloud.transitionTime !== undefined && { transitionTime: cloud.transitionTime }),
    ...(cloud.blockedPresets && { blockedPresets: [...cloud.blockedPresets] }),
    ...(cloud.favoritePresets && { favoritePresets: [...cloud.favoritePresets] }),
    ...(cloud.enabledPacks && { enabledPacks: [...cloud.enabledPacks] }),
    ...(cloud.excludedOverrides && { excludedOverrides: [...cloud.excludedOverrides] }),
    ...(cloud.presetNameDisplay !== undefined && { presetNameDisplay: cloud.presetNameDisplay }),
    ...(cloud.songInfoDisplay !== undefined && { songInfoDisplay: cloud.songInfoDisplay }),
    ...(cloud.volume !== undefined && { volume: cloud.volume }),
    ...(cloud.customPacks && {
      customPacks: cloud.customPacks.map((p) => ({ ...p, presets: [...p.presets] })),
    }),
    ...(cloud.activeCustomPackId !== undefined && {
      activeCustomPackId: cloud.activeCustomPackId,
    }),
    ...(cloud.importedPresets && {
      importedPresets: cloud.importedPresets.map((p) => ({ ...p })),
    }),
  });
}

/**
 * Syncs settings to/from the cloud when a Spotify session is active.
 * - On login: loads cloud settings (if they exist) and applies them locally.
 *   If no cloud settings exist, uploads local settings as the initial backup.
 * - On settings change while logged in: debounce-saves to cloud.
 */
export function useSettingsSync() {
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const hasSyncedRef = useRef(false);
  const isSyncingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load cloud settings on login
  useEffect(() => {
    if (!sessionId) {
      hasSyncedRef.current = false;
      return;
    }

    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    loadSettings(sessionId)
      .then((cloud) => {
        if (cloud) {
          isSyncingRef.current = true;
          applyCloudSettings(cloud);
          isSyncingRef.current = false;
        } else {
          // No cloud settings — upload local as initial backup
          const local = getSettingsSnapshot();
          saveSettings(sessionId, local).catch((err) => {
            console.error('Failed to upload initial settings:', err);
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load cloud settings:', err);
      });
  }, [sessionId]);

  // Debounce-save settings changes to cloud
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = useSettingsStore.subscribe(() => {
      if (isSyncingRef.current) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        const snapshot = getSettingsSnapshot();
        saveSettings(sessionId, snapshot).catch((err) => {
          console.error('Failed to save settings to cloud:', err);
        });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [sessionId]);
}
