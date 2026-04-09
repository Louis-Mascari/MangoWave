import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSpotifyStore } from '../../store/useSpotifyStore.ts';
import { useSettingsStore } from '../../store/useSettingsStore.ts';
import { useSettingsSync } from '../useSettingsSync.ts';

vi.mock('../../services/spotifyApi.ts', () => ({
  saveSettings: vi.fn(),
  loadSettings: vi.fn(),
}));

import { saveSettings, loadSettings } from '../../services/spotifyApi.ts';

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
      eqSettings: { preAmpGain: 2.0, bandGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
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
});
