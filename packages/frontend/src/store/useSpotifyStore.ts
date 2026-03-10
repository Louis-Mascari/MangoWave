import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SpotifyUser, NowPlayingTrack } from '../services/spotifyApi.ts';

interface SpotifyState {
  // Persisted (localStorage) — only session identity
  sessionId: string | null;

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
  logout: () => void;
  isTokenValid: () => boolean;
}

export const useSpotifyStore = create<SpotifyState>()(
  persist(
    (set, get) => ({
      sessionId: null,
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

      isTokenValid: () => {
        const { accessToken, tokenExpiresAt } = get();
        if (!accessToken || !tokenExpiresAt) return false;
        // Consider expired 60 seconds early to avoid edge cases
        return Date.now() < tokenExpiresAt - 60_000;
      },
    }),
    {
      name: 'mangowave-spotify',
      // Only persist sessionId — access tokens stay in memory
      partialize: (state) => ({ sessionId: state.sessionId }),
    },
  ),
);
