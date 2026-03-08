import { useEffect, useRef } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { getNowPlaying, refreshToken, TokenExpiredError } from '../services/spotifyApi.ts';

const POLL_INTERVAL_MS = 5000;

/**
 * Polls Spotify's "currently playing" endpoint every 5 seconds
 * while the user is authenticated and the panel is visible.
 */
export function useNowPlaying(enabled: boolean) {
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const setNowPlaying = useSpotifyStore((s) => s.setNowPlaying);
  const setAccessToken = useSpotifyStore((s) => s.setAccessToken);
  const logout = useSpotifyStore((s) => s.logout);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !accessToken || !sessionId) {
      setNowPlaying(null);
      return;
    }

    let currentToken = accessToken;

    async function poll() {
      try {
        const track = await getNowPlaying(currentToken);
        setNowPlaying(track);
      } catch (err) {
        if (err instanceof TokenExpiredError) {
          try {
            const result = await refreshToken(sessionId!);
            currentToken = result.accessToken;
            setAccessToken(result.accessToken, result.expiresIn);
            const track = await getNowPlaying(currentToken);
            setNowPlaying(track);
          } catch {
            logout();
          }
        }
      }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, accessToken, sessionId, setNowPlaying, setAccessToken, logout]);
}
