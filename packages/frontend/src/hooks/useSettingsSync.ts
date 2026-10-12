import { useCallback, useEffect, useRef } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import * as Sentry from '@sentry/react';
import { useToastStore } from '../store/useToastStore.ts';
import {
  saveSettings,
  loadSettings,
  SessionExpiredError,
  SettingsRejectedError,
} from '../services/spotifyApi.ts';
import type { CloudSettings } from '../services/spotifyApi.ts';
import { mergeInboundEq, mergeInboundPerformance, outboundKey } from '../services/syncUtils.ts';
import i18n from '../i18n/index.ts';

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
    importedTextures,
  } = useSettingsStore.getState();
  return {
    performance: { ...performance },
    eqSettings: { preAmpGain: eq.preAmpGain, bandGains: [...eq.bandGains], autoGain: eq.autoGain },
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
    importedTextures: importedTextures.map((t) => ({ ...t })),
  };
}

function applyCloudSettings(cloud: CloudSettings): void {
  const current = useSettingsStore.getState();
  useSettingsStore.setState({
    ...(cloud.performance && {
      performance: mergeInboundPerformance(current.performance, cloud.performance),
    }),
    ...(cloud.eqSettings && { eq: mergeInboundEq(current.eq, cloud.eqSettings) }),
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
    ...(cloud.importedTextures && {
      importedTextures: cloud.importedTextures.map((t) => ({ ...t })),
    }),
  });
}

/**
 * Sort a failed cloud sync request into the three cases that need different handling:
 * a dead session (log out and prompt), a save the server will never accept (tell the
 * user once), and anything else, which is transient and retried on the next change.
 */
function handleSyncError(
  err: unknown,
  sessionId: string,
  rejectionShown: { current: boolean },
): void {
  if (err instanceof SessionExpiredError) {
    useSpotifyStore.getState().expireSession(sessionId);
    return;
  }
  if (err instanceof SettingsRejectedError) {
    if (rejectionShown.current) return;
    rejectionShown.current = true;
    const tooLarge = err.status === 413;
    // A 400 means this build produced settings the backend's validation refuses
    if (!tooLarge) Sentry.captureException(err);
    useToastStore.getState().show(
      i18n.t(tooLarge ? 'toasts.cloudSyncTooLarge' : 'toasts.cloudSyncRejected', {
        ns: 'messages',
      }),
      { type: 'warning', durationMs: 10000 },
    );
    return;
  }
  console.error('Cloud settings sync failed:', err);
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
  // A rejected save repeats on every settings change until the settings shrink, so tell
  // the user once rather than on each attempt
  const rejectionShownRef = useRef(false);
  const lastSavedKeyRef = useRef<string | null>(null);
  const onSyncError = useCallback(
    (err: unknown) => {
      if (sessionId) handleSyncError(err, sessionId, rejectionShownRef);
    },
    [sessionId],
  );

  // Load cloud settings on login
  useEffect(() => {
    if (!sessionId) {
      hasSyncedRef.current = false;
      return;
    }
    // A new login starts fresh: it may be a different account with different settings
    rejectionShownRef.current = false;
    lastSavedKeyRef.current = null;

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
          saveSettings(sessionId, local).catch(onSyncError);
        }
      })
      .catch(onSyncError);
  }, [sessionId, onSyncError]);

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
        const key = outboundKey(snapshot);
        if (key === lastSavedKeyRef.current) return;
        saveSettings(sessionId, snapshot)
          .then(() => {
            lastSavedKeyRef.current = key;
            // Accepted again, so a later rejection is news worth telling
            rejectionShownRef.current = false;
          })
          .catch((err: unknown) => {
            // A transient failure leaves the key unset so the next change retries. A
            // rejection is final for these exact settings; sending them again cannot help.
            if (err instanceof SettingsRejectedError) lastSavedKeyRef.current = key;
            onSyncError(err);
          });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [sessionId, onSyncError]);
}
