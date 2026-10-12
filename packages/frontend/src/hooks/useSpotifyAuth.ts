import { useEffect, useRef } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import { exchangeCode, refreshToken, SessionExpiredError } from '../services/spotifyApi.ts';
import i18n from '../i18n/index.ts';

/**
 * Handle a failed token refresh on mount. Only a permanent failure (expired/
 * revoked refresh token) should log the user out and prompt re-auth. Transient
 * failures (network, 5xx) are ignored so the session survives — the now-playing
 * poll will retry the refresh on its next tick.
 */
function handleRefreshFailure(err: unknown) {
  if (err instanceof SessionExpiredError) useSpotifyStore.getState().expireSession();
}

/** Show auth failure toast. In a popup, notify the opener and close; otherwise show locally. */
function notifyAuthFailure() {
  if (window.opener) {
    window.opener.postMessage({ type: 'spotify-auth-failed' }, window.location.origin);
    window.close();
  } else {
    useToastStore
      .getState()
      .show(i18n.t('spotify.connectionFailed', { ns: 'messages' }), { type: 'error' });
  }
}

/**
 * Handles the OAuth callback (code in URL) and automatic token refresh
 * on mount when a userId exists in localStorage.
 */
export function useSpotifyAuth() {
  const setAuth = useSpotifyStore((s) => s.setAuth);
  const setAccessToken = useSpotifyStore((s) => s.setAccessToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const isTokenValid = useSpotifyStore((s) => s.isTokenValid);
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
        if (window.opener) {
          window.opener.postMessage({ type: 'spotify-connected' }, window.location.origin);
          window.close();
        }
      })
      .catch(() => {
        notifyAuthFailure();
      });
  }, [setAuth]);

  // Auto-refresh token on mount if sessionId exists but token is expired.
  // Skip if we're handling an OAuth callback to avoid a race condition.
  useEffect(() => {
    if (hasCodeInUrl.current) return;
    if (isTokenValid()) return;

    if (!sessionId) return;
    refreshToken(sessionId)
      .then(({ accessToken, expiresIn }) => {
        setAccessToken(accessToken, expiresIn);
      })
      .catch((err) => {
        handleRefreshFailure(err);
      });
  }, [sessionId, isTokenValid, setAccessToken]);
}
