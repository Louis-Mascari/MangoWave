import { useEffect, useRef, useCallback } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import {
  getNowPlaying,
  refreshToken,
  TokenExpiredError,
  RateLimitedError,
} from '../services/spotifyApi.ts';

const POLL_INTERVAL_MS = 5000;
const REPOLL_DELAY_MS = 500;

/**
 * Polls Spotify's "currently playing" endpoint every 5 seconds
 * while the user is authenticated and enabled is true.
 * Also supports on-demand re-poll via pollRequestedAt in the store.
 * Skips polls when rate limited and schedules auto-clear.
 */
export function useNowPlaying(enabled: boolean) {
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const isRateLimited = useSpotifyStore((s) => s.isRateLimited);
  const setNowPlaying = useSpotifyStore((s) => s.setNowPlaying);
  const setAccessToken = useSpotifyStore((s) => s.setAccessToken);
  const setRateLimited = useSpotifyStore((s) => s.setRateLimited);
  const clearRateLimited = useSpotifyStore((s) => s.clearRateLimited);
  const logout = useSpotifyStore((s) => s.logout);
  const pollRequestedAt = useSpotifyStore((s) => s.pollRequestedAt);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(accessToken);
  const isRateLimitedRef = useRef(isRateLimited);

  // Keep refs in sync so poll() always uses the latest values
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    isRateLimitedRef.current = isRateLimited;
  }, [isRateLimited]);

  const handleRateLimitError = useCallback(
    (err: RateLimitedError) => {
      const retryAfterMs = err.retryAfterSeconds * 1000;
      setRateLimited(retryAfterMs);

      // Clear any existing rate limit timer
      if (rateLimitTimerRef.current) {
        clearTimeout(rateLimitTimerRef.current);
      }
      rateLimitTimerRef.current = setTimeout(() => {
        clearRateLimited();
        rateLimitTimerRef.current = null;
      }, retryAfterMs);
    },
    [setRateLimited, clearRateLimited],
  );

  const poll = useCallback(async () => {
    const currentToken = tokenRef.current;
    if (!currentToken || !sessionId) return;
    if (isRateLimitedRef.current) return;

    try {
      const track = await getNowPlaying(currentToken);
      setNowPlaying(track);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        handleRateLimitError(err);
      } else if (err instanceof TokenExpiredError) {
        try {
          const result = await refreshToken(sessionId);
          tokenRef.current = result.accessToken;
          setAccessToken(result.accessToken, result.expiresIn);
          const track = await getNowPlaying(result.accessToken);
          setNowPlaying(track);
        } catch {
          logout();
        }
      }
    }
  }, [sessionId, setNowPlaying, setAccessToken, logout, handleRateLimitError]);

  // Start/stop the regular polling interval
  useEffect(() => {
    if (!enabled || !accessToken || !sessionId) {
      setNowPlaying(null);
      return;
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, accessToken, sessionId, setNowPlaying, poll]);

  // On-demand re-poll: when pollRequestedAt changes, schedule a delayed poll
  // and reset the regular interval to avoid clustering
  useEffect(() => {
    if (!pollRequestedAt || !enabled || !accessToken || !sessionId) return;

    const timeout = setTimeout(() => {
      poll();
      // Reset the regular interval so the next tick is a full POLL_INTERVAL_MS away
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    }, REPOLL_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [pollRequestedAt, enabled, accessToken, sessionId, poll]);

  // Clean up rate limit timer on unmount
  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) {
        clearTimeout(rateLimitTimerRef.current);
      }
    };
  }, []);
}
