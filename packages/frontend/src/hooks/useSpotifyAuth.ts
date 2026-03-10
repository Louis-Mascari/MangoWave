import { useEffect, useRef } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { exchangeCode, refreshToken } from '../services/spotifyApi.ts';
import { exchangeCodePkce, getSpotifyProfile, refreshTokenPkce } from '../services/spotifyPkce.ts';

/**
 * Handles the OAuth callback (code in URL) and automatic token refresh
 * on mount when a userId exists in localStorage.
 * Supports both owner (backend) and BYOC (PKCE) auth modes.
 */
export function useSpotifyAuth() {
  const setAuth = useSpotifyStore((s) => s.setAuth);
  const setAccessToken = useSpotifyStore((s) => s.setAccessToken);
  const setByocAuth = useSpotifyStore((s) => s.setByocAuth);
  const setByocRefreshToken = useSpotifyStore((s) => s.setByocRefreshToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const byocClientId = useSpotifyStore((s) => s.byocClientId);
  const byocRefreshToken = useSpotifyStore((s) => s.byocRefreshToken);
  const isTokenValid = useSpotifyStore((s) => s.isTokenValid);
  const getAuthMode = useSpotifyStore((s) => s.getAuthMode);
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

    const authMode = getAuthMode();
    const storedVerifier = sessionStorage.getItem('spotify_pkce_verifier');

    if (authMode === 'byoc' && storedVerifier && byocClientId) {
      // BYOC PKCE flow
      sessionStorage.removeItem('spotify_pkce_verifier');
      const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;

      exchangeCodePkce(byocClientId, code, storedVerifier, redirectUri)
        .then(async ({ accessToken, expiresIn, refreshToken: rt }) => {
          const user = await getSpotifyProfile(accessToken);
          setByocAuth(accessToken, expiresIn, rt, user);
          if (window.opener) {
            window.opener.postMessage({ type: 'spotify-connected' }, window.location.origin);
            window.close();
          }
        })
        .catch((err) => {
          console.error('BYOC Spotify auth failed:', err);
        });
    } else {
      // Owner backend flow
      exchangeCode(code)
        .then(({ accessToken, expiresIn, sessionId: sid, user }) => {
          setAuth(accessToken, expiresIn, sid, user);
          if (window.opener) {
            window.opener.postMessage({ type: 'spotify-connected' }, window.location.origin);
            window.close();
          }
        })
        .catch((err) => {
          console.error('Spotify auth failed:', err);
        });
    }
  }, [setAuth, setByocAuth, getAuthMode, byocClientId]);

  // Auto-refresh token on mount if sessionId exists but token is expired.
  // Skip if we're handling an OAuth callback to avoid a race condition.
  useEffect(() => {
    if (hasCodeInUrl.current) return;
    if (isTokenValid()) return;

    const authMode = getAuthMode();

    if (authMode === 'byoc' && byocClientId && byocRefreshToken) {
      // BYOC PKCE refresh
      refreshTokenPkce(byocClientId, byocRefreshToken)
        .then(({ accessToken, expiresIn, refreshToken: newRt }) => {
          setAccessToken(accessToken, expiresIn);
          setByocRefreshToken(newRt);
        })
        .catch(() => {
          logout();
        });
    } else if (sessionId) {
      // Owner backend refresh
      refreshToken(sessionId)
        .then(({ accessToken, expiresIn }) => {
          setAccessToken(accessToken, expiresIn);
        })
        .catch(() => {
          logout();
        });
    }
  }, [
    sessionId,
    byocClientId,
    byocRefreshToken,
    isTokenValid,
    getAuthMode,
    setAccessToken,
    setByocRefreshToken,
    logout,
  ]);
}
