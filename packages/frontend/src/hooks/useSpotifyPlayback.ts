import { useCallback, useEffect, useRef } from 'react';
import {
  controlPlayback,
  seekToPosition,
  toggleShuffle as apiToggleShuffle,
  setRepeatMode,
  RateLimitedError,
  PremiumRequiredError,
  TokenExpiredError,
} from '../services/spotifyApi.ts';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import i18n from '../i18n/index.ts';

export interface UseSpotifyPlaybackReturn {
  handleSpotifyAction: (action: 'play' | 'pause' | 'next' | 'previous') => Promise<void>;
  handleSpotifySeek: (positionMs: number) => Promise<void>;
  handleSpotifyToggleShuffle: () => Promise<void>;
  handleSpotifyCycleRepeat: () => Promise<void>;
}

export function useSpotifyPlayback(): UseSpotifyPlaybackReturn {
  const refreshAccessToken = useSpotifyStore((s) => s.refreshAccessToken);
  const setPremiumError = useSpotifyStore((s) => s.setPremiumError);
  const updateIsPlaying = useSpotifyStore((s) => s.updateIsPlaying);
  const requestPoll = useSpotifyStore((s) => s.requestPoll);
  const setRateLimited = useSpotifyStore((s) => s.setRateLimited);
  const clearRateLimited = useSpotifyStore((s) => s.clearRateLimited);

  const rateLimitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rateLimitTimeoutRef.current) clearTimeout(rateLimitTimeoutRef.current);
    };
  }, []);

  const handleSpotifyError = useCallback(
    (err: unknown) => {
      if (err instanceof RateLimitedError) {
        setRateLimited(err.retryAfterSeconds * 1000);
        rateLimitTimeoutRef.current = setTimeout(
          () => clearRateLimited(),
          err.retryAfterSeconds * 1000,
        );
      } else if (err instanceof PremiumRequiredError) {
        setPremiumError(true);
        useToastStore
          .getState()
          .show(i18n.t('spotify.premiumRequired', { ns: 'messages' }), { type: 'warning' });
      } else if (err instanceof TokenExpiredError) {
        requestPoll();
      } else {
        useToastStore
          .getState()
          .show(i18n.t('spotify.networkError', { ns: 'messages' }), { type: 'error' });
      }
    },
    [setRateLimited, clearRateLimited, setPremiumError, requestPoll],
  );

  const withTokenRetry = useCallback(
    async (apiCall: (token: string) => Promise<void>) => {
      const token = useSpotifyStore.getState().accessToken;
      if (!token) return;
      try {
        await apiCall(token);
        requestPoll();
      } catch (err) {
        if (err instanceof TokenExpiredError) {
          const newToken = await refreshAccessToken();
          if (!newToken) return;
          try {
            await apiCall(newToken);
            requestPoll();
            return;
          } catch (retryErr) {
            handleSpotifyError(retryErr);
            return;
          }
        }
        handleSpotifyError(err);
      }
    },
    [requestPoll, handleSpotifyError, refreshAccessToken],
  );

  const handleSpotifyAction = useCallback(
    async (action: 'play' | 'pause' | 'next' | 'previous') => {
      if (action === 'play') updateIsPlaying(true);
      else if (action === 'pause') updateIsPlaying(false);
      await withTokenRetry((t) => controlPlayback(t, action));
    },
    [updateIsPlaying, withTokenRetry],
  );

  const handleSpotifySeek = useCallback(
    async (positionMs: number) => {
      await withTokenRetry((t) => seekToPosition(t, positionMs));
    },
    [withTokenRetry],
  );

  const handleSpotifyToggleShuffle = useCallback(async () => {
    const current = useSpotifyStore.getState().nowPlaying?.shuffleState ?? false;
    await withTokenRetry((t) => apiToggleShuffle(t, !current));
  }, [withTokenRetry]);

  const handleSpotifyCycleRepeat = useCallback(async () => {
    const current = useSpotifyStore.getState().nowPlaying?.repeatState ?? 'off';
    const next = current === 'off' ? 'context' : current === 'context' ? 'track' : 'off';
    await withTokenRetry((t) => setRepeatMode(t, next));
  }, [withTokenRetry]);

  return {
    handleSpotifyAction,
    handleSpotifySeek,
    handleSpotifyToggleShuffle,
    handleSpotifyCycleRepeat,
  };
}
