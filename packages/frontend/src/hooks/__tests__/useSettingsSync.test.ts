import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSpotifyStore } from '../../store/useSpotifyStore.ts';
import { useSettingsStore } from '../../store/useSettingsStore.ts';
import { useSettingsSync } from '../useSettingsSync.ts';

vi.mock('../../services/spotifyApi.ts', async () => {
  const actual = await vi.importActual<typeof import('../../services/spotifyApi.ts')>(
    '../../services/spotifyApi.ts',
  );
  return { ...actual, saveSettings: vi.fn(), loadSettings: vi.fn() };
});

import {
  saveSettings,
  loadSettings,
  SessionExpiredError,
  SettingsRejectedError,
} from '../../services/spotifyApi.ts';
import { useToastStore } from '../../store/useToastStore.ts';

describe('useSettingsSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    useSpotifyStore.setState({
      sessionId: null,
      accessToken: null,
      tokenExpiresAt: null,
      user: null,
      nowPlaying: null,
      premiumError: false,
    });

    useSettingsStore.setState({
      transitionTime: 2.0,
      eq: { preAmpGain: 1.0, bandGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], autoGain: true },
      blockedPresets: [],
      favoritePresets: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when no session exists', () => {
    renderHook(() => useSettingsSync());
    expect(loadSettings).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('loads cloud settings on login and applies them', async () => {
    const cloudSettings = {
      performance: {
        fpsCap: 30,
        resolutionScale: 0.5,
        meshWidth: 32,
        meshHeight: 24,
        textureRatio: 0.5,
        fxaa: true,
        autoQuality: false,
      },
      eqSettings: { preAmpGain: 2.0, bandGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], autoGain: false },
      audio: { smoothingConstant: 0.5, fftSize: 2048 },
      autopilot: { enabled: false, interval: 30, mode: 'favorites' as const, favoriteWeight: 5 },
      transitionTime: 5.0,
      blockedPresets: ['blocked1'],
      favoritePresets: ['fav1'],
      enabledPacks: ['Minimal'],
      excludedOverrides: ['restored1'],
      presetNameDisplay: 'always' as const,
      songInfoDisplay: 3,
      volume: 0.8,
    };

    vi.mocked(loadSettings).mockResolvedValue(cloudSettings);

    useSpotifyStore.setState({ sessionId: 'sess_1' });
    renderHook(() => useSettingsSync());

    // Flush the loadSettings promise
    await vi.advanceTimersByTimeAsync(0);

    expect(loadSettings).toHaveBeenCalledWith('sess_1');
    expect(useSettingsStore.getState().transitionTime).toBe(5.0);
    expect(useSettingsStore.getState().eq.preAmpGain).toBe(2.0);
    expect(useSettingsStore.getState().blockedPresets).toEqual(['blocked1']);
    expect(useSettingsStore.getState().favoritePresets).toEqual(['fav1']);
    expect(useSettingsStore.getState().performance.fpsCap).toBe(30);
    expect(useSettingsStore.getState().audio.fftSize).toBe(2048);
    expect(useSettingsStore.getState().autopilot.mode).toBe('favorites');
    expect(useSettingsStore.getState().enabledPacks).toEqual(['Minimal']);
    expect(useSettingsStore.getState().volume).toBe(0.8);
  });

  it('uploads local settings when no cloud settings exist', async () => {
    vi.mocked(loadSettings).mockResolvedValue(null);
    vi.mocked(saveSettings).mockResolvedValue(undefined);

    useSettingsStore.setState({
      transitionTime: 3.0,
      blockedPresets: ['local-blocked'],
      favoritePresets: ['local-fav'],
    });

    useSpotifyStore.setState({ sessionId: 'sess_2' });
    renderHook(() => useSettingsSync());

    await vi.advanceTimersByTimeAsync(0);

    expect(saveSettings).toHaveBeenCalledWith(
      'sess_2',
      expect.objectContaining({
        transitionTime: 3.0,
        blockedPresets: ['local-blocked'],
        favoritePresets: ['local-fav'],
      }),
    );
  });

  it('debounce-saves settings changes to cloud', async () => {
    vi.mocked(loadSettings).mockResolvedValue(null);
    vi.mocked(saveSettings).mockResolvedValue(undefined);

    useSpotifyStore.setState({ sessionId: 'sess_3' });
    renderHook(() => useSettingsSync());

    // Flush initial sync
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(saveSettings).mockClear();

    // Trigger a settings change
    useSettingsStore.getState().setTransitionTime(4.0);

    // Should not save immediately
    expect(saveSettings).not.toHaveBeenCalled();

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(2000);

    expect(saveSettings).toHaveBeenCalledWith(
      'sess_3',
      expect.objectContaining({
        transitionTime: 4.0,
      }),
    );
  });

  it('logs out and says why when the cloud session has expired', async () => {
    vi.mocked(loadSettings).mockRejectedValue(new SessionExpiredError());
    useSpotifyStore.setState({ sessionId: 'sess_dead' });

    renderHook(() => useSettingsSync());
    await vi.advanceTimersByTimeAsync(0);

    expect(useSpotifyStore.getState().sessionId).toBeNull();
    expect(useToastStore.getState().message).toContain('session has expired');
  });

  it('tells the user once when a save is rejected as too large', async () => {
    vi.mocked(loadSettings).mockResolvedValue(null);
    vi.mocked(saveSettings).mockRejectedValue(new SettingsRejectedError(413));
    const show = vi.spyOn(useToastStore.getState(), 'show');
    useSpotifyStore.setState({ sessionId: 'sess_1' });

    renderHook(() => useSettingsSync());
    await vi.advanceTimersByTimeAsync(0);
    useSettingsStore.setState({ transitionTime: 5 });
    await vi.advanceTimersByTimeAsync(2500);

    expect(saveSettings).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0][0]).toContain('too large');
    // Still signed in: only the save is refused
    expect(useSpotifyStore.getState().sessionId).toBe('sess_1');
  });

  it('keeps the session and stays quiet on a transient failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadSettings).mockRejectedValue(new Error('network'));
    const show = vi.spyOn(useToastStore.getState(), 'show');
    useSpotifyStore.setState({ sessionId: 'sess_1' });

    renderHook(() => useSettingsSync());
    await vi.advanceTimersByTimeAsync(0);

    expect(useSpotifyStore.getState().sessionId).toBe('sess_1');
    expect(show).not.toHaveBeenCalled();
  });

  it('does not save when only an Auto Gain step changed', async () => {
    vi.mocked(loadSettings).mockResolvedValue(null);
    vi.mocked(saveSettings).mockResolvedValue(undefined);
    useSpotifyStore.setState({ sessionId: 'sess_1' });
    renderHook(() => useSettingsSync());
    await vi.advanceTimersByTimeAsync(0);

    useSettingsStore.setState({ transitionTime: 4 });
    await vi.advanceTimersByTimeAsync(2500);
    const savesBefore = vi.mocked(saveSettings).mock.calls.length;

    useSettingsStore.getState().applyAutoGain(2.2);
    await vi.advanceTimersByTimeAsync(2500);
    expect(saveSettings).toHaveBeenCalledTimes(savesBefore);

    // A manual change turns Auto Gain off, which is worth saving
    useSettingsStore.getState().setPreAmpGain(2.4);
    await vi.advanceTimersByTimeAsync(2500);
    expect(saveSettings).toHaveBeenCalledTimes(savesBefore + 1);
  });

  it('retries a save that failed transiently, even if only an auto value changed since', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadSettings).mockResolvedValue({} as never);
    vi.mocked(saveSettings)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined);
    useSpotifyStore.setState({ sessionId: 'sess_1' });
    renderHook(() => useSettingsSync());
    await vi.advanceTimersByTimeAsync(0);

    useSettingsStore.setState({ transitionTime: 7 });
    await vi.advanceTimersByTimeAsync(2500);
    expect(saveSettings).toHaveBeenCalledTimes(1);

    useSettingsStore.getState().applyAutoGain(2.7);
    await vi.advanceTimersByTimeAsync(2500);
    expect(saveSettings).toHaveBeenCalledTimes(2);
  });
});
