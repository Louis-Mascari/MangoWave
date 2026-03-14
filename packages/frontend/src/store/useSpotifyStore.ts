import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SpotifyUser, NowPlayingTrack } from '../services/spotifyApi.ts';
import { refreshToken } from '../services/spotifyApi.ts';
import { refreshTokenPkce } from '../services/spotifyPkce.ts';

export type AuthMode = 'owner' | 'byoc' | 'locked';

interface SpotifyState {
  // Persisted (localStorage) — session identity + BYOC + unlock
  sessionId: string | null;
  isSpotifyUnlocked: boolean;
  byocClientId: string | null;

  // Session-only (not persisted) — set after auth or refresh
  accessToken: string | null;
  tokenExpiresAt: number | null; // epoch ms
  user: SpotifyUser | null;
  nowPlaying: NowPlayingTrack | null;
  premiumError: boolean;
  byocRefreshToken: string | null;

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
  setByocClientId: (id: string | null) => void;
  setByocAuth: (
    accessToken: string,
    expiresIn: number,
    refreshToken: string,
    user: SpotifyUser,
  ) => void;
  setByocRefreshToken: (token: string) => void;
  getAuthMode: () => AuthMode;
  logout: () => void;
  isTokenValid: () => boolean;
  refreshAccessToken: () => Promise<string | null>;
}

export const useSpotifyStore = create<SpotifyState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      isSpotifyUnlocked: false,
      byocClientId: null,
      accessToken: null,
      tokenExpiresAt: null,
      user: null,
      nowPlaying: null,
      premiumError: false,
      byocRefreshToken: null,
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

      setByocClientId: (id) => set({ byocClientId: id }),

      setByocAuth: (accessToken, expiresIn, refreshToken, user) =>
        set({
          accessToken,
          tokenExpiresAt: Date.now() + expiresIn * 1000,
          byocRefreshToken: refreshToken,
          user,
          premiumError: false,
        }),

      setByocRefreshToken: (token) => set({ byocRefreshToken: token }),

      getAuthMode: () => {
        const { isSpotifyUnlocked, byocClientId } = get();
        if (import.meta.env.VITE_LOCKED_MODE !== 'true') return 'owner';
        if (isSpotifyUnlocked) return 'owner';
        if (byocClientId) return 'byoc';
        return 'locked';
      },

      logout: () =>
        set({
          sessionId: null,
          accessToken: null,
          tokenExpiresAt: null,
          user: null,
          nowPlaying: null,
          premiumError: false,
          byocRefreshToken: null,
          isRateLimited: false,
          rateLimitResetsAt: null,
          pollRequestedAt: 0,
        }),

      refreshAccessToken: async () => {
        const { sessionId, byocClientId, byocRefreshToken: byocRefresh } = get();
        try {
          if (byocClientId && byocRefresh) {
            const result = await refreshTokenPkce(byocClientId, byocRefresh);
            set({
              accessToken: result.accessToken,
              tokenExpiresAt: Date.now() + result.expiresIn * 1000,
              byocRefreshToken: result.refreshToken,
            });
            return result.accessToken;
          } else if (sessionId) {
            const result = await refreshToken(sessionId);
            set({
              accessToken: result.accessToken,
              tokenExpiresAt: Date.now() + result.expiresIn * 1000,
            });
            return result.accessToken;
          }
        } catch {
          get().logout();
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
        byocClientId: state.byocClientId,
      }),
    },
  ),
);

// Expose stores on window in dev mode for console QA
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).useSpotifyStore = useSpotifyStore;
}
