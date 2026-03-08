import { useEffect, useRef } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { saveSettings, loadSettings } from '../services/spotifyApi.ts';
import type { CloudSettings } from '../services/spotifyApi.ts';

const DEBOUNCE_MS = 2000;

function getSettingsSnapshot(): CloudSettings {
  const { transitionTime, eq, blockedPresets, favoritePresets } = useSettingsStore.getState();
  return {
    theme: 'default',
    transitionTime,
    eqSettings: { preAmpGain: eq.preAmpGain, bandGains: [...eq.bandGains] },
    blockedPresets: [...blockedPresets],
    favoritePresets: [...favoritePresets],
  };
}

function applyCloudSettings(cloud: CloudSettings): void {
  useSettingsStore.setState({
    ...(cloud.transitionTime !== undefined && { transitionTime: cloud.transitionTime }),
    ...(cloud.eqSettings && {
      eq: { preAmpGain: cloud.eqSettings.preAmpGain, bandGains: [...cloud.eqSettings.bandGains] },
    }),
    ...(cloud.blockedPresets && { blockedPresets: [...cloud.blockedPresets] }),
    ...(cloud.favoritePresets && { favoritePresets: [...cloud.favoritePresets] }),
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
