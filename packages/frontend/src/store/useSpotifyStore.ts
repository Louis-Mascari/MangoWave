import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SpotifyUser, NowPlayingTrack } from '../services/spotifyApi.ts';
import { refreshToken, SessionExpiredError } from '../services/spotifyApi.ts';
import { useToastStore } from './useToastStore.ts';
import i18n from '../i18n/index.ts';

export type AuthMode = 'owner' | 'locked';

interface SpotifyState {
  // Persisted (localStorage) — session identity + unlock
  sessionId: string | null;
  isSpotifyUnlocked: boolean;

  // Session-only (not persisted) — set after auth or refresh
  accessToken: string | null;
  tokenExpiresAt: number | null; // epoch ms
  user: SpotifyUser | null;
  nowPlaying: NowPlayingTrack | null;
  premiumError: boolean;

  // Rate limiting (session-only)
  isRateLimited: boolean;
  rateLimitResetsAt: number | null;

  // Poll control
  pollRequestedAt: number;
  requestPoll: () => void;

  // Actions
  setAuth: (accessToken: string, expiresIn: number, sessionId: string, user: SpotifyUser) => void;
  setAccessToken: (accessToken: string, expiresIn: number) => void;
  setNowPlaying: (track: NowPlayingTrack | null) => void;
  updateIsPlaying: (isPlaying: boolean) => void;
  setPremiumError: (value: boolean) => void;
  setRateLimited: (retryAfterMs: number) => void;
  clearRateLimited: () => void;
  setUnlocked: () => void;
  getAuthMode: () => AuthMode;
  logout: () => void;
  expireSession: () => void;
  isTokenValid: () => boolean;
  refreshAccessToken: () => Promise<string | null>;
}

export const useSpotifyStore = create<SpotifyState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      isSpotifyUnlocked: false,
      accessToken: null,
      tokenExpiresAt: null,
      user: null,
      nowPlaying: null,
      premiumError: false,
      isRateLimited: false,
      rateLimitResetsAt: null,
      pollRequestedAt: 0,

      requestPoll: () => set({ pollRequestedAt: Date.now() }),

      setAuth: (accessToken, expiresIn, sessionId, user) =>
        set({
          accessToken,
          tokenExpiresAt: Date.now() + expiresIn * 1000,
          sessionId,
          user,
          premiumError: false,
        }),

      setAccessToken: (accessToken, expiresIn) =>
        set({
          accessToken,
          tokenExpiresAt: Date.now() + expiresIn * 1000,
        }),

      setNowPlaying: (track) => set({ nowPlaying: track }),

      updateIsPlaying: (isPlaying) =>
        set((state) => ({
          nowPlaying: state.nowPlaying ? { ...state.nowPlaying, isPlaying } : null,
        })),

      setPremiumError: (value) => set({ premiumError: value }),

      setRateLimited: (retryAfterMs) =>
        set({
          isRateLimited: true,
          rateLimitResetsAt: Date.now() + retryAfterMs,
        }),

      clearRateLimited: () =>
        set({
          isRateLimited: false,
          rateLimitResetsAt: null,
        }),

      setUnlocked: () => set({ isSpotifyUnlocked: true }),

      getAuthMode: () => {
        if (import.meta.env.VITE_LOCKED_MODE !== 'true') return 'owner';
        return get().isSpotifyUnlocked ? 'owner' : 'locked';
      },

      logout: () =>
        set({
          sessionId: null,
          accessToken: null,
          tokenExpiresAt: null,
          user: null,
          nowPlaying: null,
          premiumError: false,
          isRateLimited: false,
          rateLimitResetsAt: null,
          pollRequestedAt: 0,
        }),

      // The one place a dead session is handled: log out and tell the user why. Several
      // requests can discover the same dead session, so only the first one toasts.
      expireSession: () => {
        if (!get().sessionId) return;
        get().logout();
        useToastStore
          .getState()
          .show(i18n.t('spotify.sessionExpired', { ns: 'messages' }), { type: 'warning' });
      },

      refreshAccessToken: async () => {
        const { sessionId } = get();
        try {
          if (sessionId) {
            const result = await refreshToken(sessionId);
            set({
              accessToken: result.accessToken,
              tokenExpiresAt: Date.now() + result.expiresIn * 1000,
            });
            return result.accessToken;
          }
        } catch (err) {
          // Only drop the session when the refresh token is permanently dead.
          // Transient failures (network, 5xx) keep the session so the next
          // now-playing poll retries the refresh instead of forcing re-auth.
          if (err instanceof SessionExpiredError) {
            get().expireSession();
          }
        }
        return null;
      },

      isTokenValid: () => {
        const { accessToken, tokenExpiresAt } = get();
        if (!accessToken || !tokenExpiresAt) return false;
        // Consider expired 60 seconds early to avoid edge cases
        return Date.now() < tokenExpiresAt - 60_000;
      },
    }),
    {
      name: 'mangowave-spotify',
      partialize: (state) => ({
        sessionId: state.sessionId,
        isSpotifyUnlocked: state.isSpotifyUnlocked,
      }),
    },
  ),
);

// Expose stores on window in dev mode for console QA
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).useSpotifyStore = useSpotifyStore;
}
