import { describe, it, expect, beforeEach } from 'vitest';
import { useSpotifyStore } from '../useSpotifyStore.ts';

describe('useSpotifyStore', () => {
  beforeEach(() => {
    useSpotifyStore.setState({
      sessionId: null,
      accessToken: null,
      tokenExpiresAt: null,
      user: null,
      nowPlaying: null,
      premiumError: false,
    });
  });

  it('starts with null auth state', () => {
    const state = useSpotifyStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
  });

  it('setAuth stores token, sessionId, and user', () => {
    const { setAuth } = useSpotifyStore.getState();
    const user = { id: 'u1', displayName: 'Test', imageUrl: null, product: 'premium' };
    setAuth('at_123', 3600, 'sess_abc', user);

    const state = useSpotifyStore.getState();
    expect(state.accessToken).toBe('at_123');
    expect(state.sessionId).toBe('sess_abc');
    expect(state.user).toEqual(user);
    expect(state.tokenExpiresAt).toBeGreaterThan(Date.now());
  });

  it('setAccessToken updates token without changing user', () => {
    const { setAuth, setAccessToken } = useSpotifyStore.getState();
    const user = { id: 'u1', displayName: 'Test', imageUrl: null, product: 'premium' };
    setAuth('at_old', 3600, 'sess_abc', user);
    setAccessToken('at_new', 7200);

    const state = useSpotifyStore.getState();
    expect(state.accessToken).toBe('at_new');
    expect(state.user).toEqual(user);
  });

  it('isTokenValid returns false when no token exists', () => {
    expect(useSpotifyStore.getState().isTokenValid()).toBe(false);
  });

  it('isTokenValid returns true for a fresh token', () => {
    const { setAuth } = useSpotifyStore.getState();
    setAuth('at_123', 3600, 'sess_abc', {
      id: 'u1',
      displayName: null,
      imageUrl: null,
      product: null,
    });
    expect(useSpotifyStore.getState().isTokenValid()).toBe(true);
  });

  it('isTokenValid returns false for an expired token', () => {
    useSpotifyStore.setState({ accessToken: 'at_old', tokenExpiresAt: Date.now() - 1000 });
    expect(useSpotifyStore.getState().isTokenValid()).toBe(false);
  });

  it('logout clears all auth state', () => {
    const { setAuth, logout } = useSpotifyStore.getState();
    setAuth('at_123', 3600, 'sess_abc', {
      id: 'u1',
      displayName: 'Test',
      imageUrl: null,
      product: 'premium',
    });
    logout();

    const state = useSpotifyStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.nowPlaying).toBeNull();
  });

  it('setPremiumError updates the flag', () => {
    const { setPremiumError } = useSpotifyStore.getState();
    setPremiumError(true);
    expect(useSpotifyStore.getState().premiumError).toBe(true);
  });

  it('setNowPlaying updates the track', () => {
    const { setNowPlaying } = useSpotifyStore.getState();
    const track = {
      title: 'Song',
      artist: 'Artist',
      albumName: 'Album',
      albumArtUrl: null,
      isPlaying: true,
      progressMs: 0,
      durationMs: 300000,
    };
    setNowPlaying(track);
    expect(useSpotifyStore.getState().nowPlaying).toEqual(track);
  });
});
