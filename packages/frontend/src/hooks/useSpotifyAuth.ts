import { useEffect, useRef } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { exchangeCode, refreshToken } from '../services/spotifyApi.ts';

/**
 * Handles the OAuth callback (code in URL) and automatic token refresh
 * on mount when a userId exists in localStorage.
 */
export function useSpotifyAuth() {
  const setAuth = useSpotifyStore((s) => s.setAuth);
  const setAccessToken = useSpotifyStore((s) => s.setAccessToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const isTokenValid = useSpotifyStore((s) => s.isTokenValid);
  const logout = useSpotifyStore((s) => s.logout);
  const hasHandledCallback = useRef(false);

  // Check if there's an OAuth callback code in the URL
  const hasCodeInUrl = useRef(new URLSearchParams(window.location.search).has('code'));

  // Handle OAuth callback code in URL
  useEffect(() => {
    if (hasHandledCallback.current) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code) return;
    hasHandledCallback.current = true;

    // Verify state to prevent CSRF
    const storedState = sessionStorage.getItem('spotify_auth_state');
    if (state !== storedState) {
      console.error('Spotify auth state mismatch');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    sessionStorage.removeItem('spotify_auth_state');

    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);

    exchangeCode(code)
      .then(({ accessToken, expiresIn, sessionId: sid, user }) => {
        setAuth(accessToken, expiresIn, sid, user);
      })
      .catch((err) => {
        console.error('Spotify auth failed:', err);
      });
  }, [setAuth]);

  // Auto-refresh token on mount if sessionId exists but token is expired.
  // Skip if we're handling an OAuth callback to avoid a race condition.
  useEffect(() => {
    if (hasCodeInUrl.current) return;
    if (!sessionId || isTokenValid()) return;

    refreshToken(sessionId)
      .then(({ accessToken, expiresIn }) => {
        setAccessToken(accessToken, expiresIn);
      })
      .catch(() => {
        // Refresh failed — clear stale session
        logout();
      });
  }, [sessionId, isTokenValid, setAccessToken, logout]);
}
