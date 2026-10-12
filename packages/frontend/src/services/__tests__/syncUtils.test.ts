import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../../store/useSettingsStore.ts';
import {
  applyDeviceSyncSettings,
  applyInboundSettings,
  getSettingsSnapshot,
  outboundKey,
} from '../syncUtils.ts';
import type { SyncableSettings } from '../syncTypes.ts';

// Peer data is untyped at runtime; build it loosely like a mismatched or hostile peer would
function fromPeer(data: unknown): SyncableSettings {
  return JSON.parse(JSON.stringify(data)) as SyncableSettings;
}

describe('applyDeviceSyncSettings', () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it('applies valid settings', () => {
    applyDeviceSyncSettings(
      fromPeer({
        autopilot: { enabled: false, interval: 30, mode: 'favorites', favoriteWeight: 4 },
        eq: { preAmpGain: 2, bandGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], autoGain: false },
        audio: { smoothingConstant: 0.5, fftSize: 2048 },
        brightness: 0.5,
      }),
    );
    const s = useSettingsStore.getState();
    expect(s.autopilot).toEqual({
      enabled: false,
      interval: 30,
      mode: 'favorites',
      favoriteWeight: 4,
    });
    expect(s.eq).toEqual({
      preAmpGain: 2,
      bandGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      autoGain: false,
    });
    expect(s.audio).toEqual({ smoothingConstant: 0.5, fftSize: 2048 });
    expect(s.brightness).toBe(0.5);
  });

  it('clamps out-of-range values instead of storing them', () => {
    applyDeviceSyncSettings(
      fromPeer({
        autopilot: { enabled: true, interval: 0, mode: 'bogus', favoriteWeight: 999 },
        eq: { preAmpGain: 50, bandGains: [99, -99], autoGain: false },
        audio: { smoothingConstant: 7, fftSize: 3000 },
      }),
    );
    const s = useSettingsStore.getState();
    expect(s.autopilot.interval).toBe(5);
    expect(s.autopilot.mode).toBe('all');
    expect(s.autopilot.favoriteWeight).toBe(10);
    expect(s.eq.preAmpGain).toBe(3);
    expect(s.eq.bandGains).toEqual([12, -12, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(s.audio.smoothingConstant).toBe(1);
    expect(s.audio.fftSize).toBe(1024);
  });

  it('never stores a non-finite gain', () => {
    // Infinity and NaN arrive as null once serialised over the data channel
    applyDeviceSyncSettings(fromPeer({ eq: { preAmpGain: Infinity, bandGains: [NaN] } }));
    const { eq } = useSettingsStore.getState();
    expect(Number.isFinite(eq.preAmpGain)).toBe(true);
    expect(eq.bandGains.every(Number.isFinite)).toBe(true);
    expect(eq.bandGains).toHaveLength(10);
  });

  it('keeps current values for fields an older peer omits', () => {
    useSettingsStore.setState({
      eq: { preAmpGain: 1, bandGains: Array(10).fill(0), autoGain: false },
      autopilot: { enabled: true, interval: 15, mode: 'all', favoriteWeight: 7 },
    });
    applyDeviceSyncSettings(
      fromPeer({ eq: { preAmpGain: 2 }, autopilot: { enabled: false, interval: 20 } }),
    );
    const s = useSettingsStore.getState();
    expect(s.eq).toEqual({ preAmpGain: 2, bandGains: Array(10).fill(0), autoGain: false });
    expect(s.autopilot).toEqual({ enabled: false, interval: 20, mode: 'all', favoriteWeight: 7 });
  });

  it('ignores performance unless performance sync is on', () => {
    useSettingsStore.setState({ syncPerformance: false });
    const before = useSettingsStore.getState().performance;
    applyDeviceSyncSettings(fromPeer({ performance: { fpsCap: 30, meshWidth: 16 } }));
    expect(useSettingsStore.getState().performance).toEqual(before);

    applyDeviceSyncSettings(
      fromPeer({
        syncPerformance: true,
        performance: { fpsCap: 5000, meshWidth: 1, autoQuality: false },
      }),
    );
    const { performance } = useSettingsStore.getState();
    expect(performance.fpsCap).toBe(300);
    expect(performance.meshWidth).toBe(16);
    expect(performance.meshHeight).toBe(before.meshHeight);
  });

  it('ignores non-object payloads and out-of-range brightness', () => {
    const before = useSettingsStore.getState();
    applyDeviceSyncSettings(fromPeer('nope'));
    applyDeviceSyncSettings(fromPeer({ eq: 'loud', autopilot: [1], audio: 3, brightness: 9 }));
    const after = useSettingsStore.getState();
    expect(after.eq).toEqual(before.eq);
    expect(after.autopilot).toEqual(before.autopilot);
    expect(after.audio).toEqual(before.audio);
    expect(after.brightness).toBe(before.brightness);
  });
});

describe('auto-driven values under sync', () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it("keeps the local gain when the sender's Auto Gain is on", () => {
    useSettingsStore.getState().applyAutoGain(1.2);
    const remote = getSettingsSnapshot();
    remote.eq = { ...remote.eq!, preAmpGain: 2.6, autoGain: true };

    applyInboundSettings(remote);

    const { eq } = useSettingsStore.getState();
    expect(eq.preAmpGain).toBe(1.2);
    expect(eq.autoGain).toBe(true);
  });

  it("applies the sender's gain together with Auto Gain off", () => {
    const remote = getSettingsSnapshot();
    remote.eq = { ...remote.eq!, preAmpGain: 2.6, autoGain: false };

    applyInboundSettings(remote);

    expect(useSettingsStore.getState().eq).toMatchObject({ preAmpGain: 2.6, autoGain: false });
  });

  it("keeps local quality values when the sender's Auto Quality is on", () => {
    useSettingsStore.setState({ syncPerformance: true });
    const before = useSettingsStore.getState().performance;
    const remote = getSettingsSnapshot();
    remote.performance = {
      ...before,
      fpsCap: 30,
      meshWidth: 32,
      meshHeight: 24,
      textureRatio: 0.5,
      resolutionScale: 0.5,
      autoQuality: true,
    };

    applyInboundSettings(remote);

    const after = useSettingsStore.getState().performance;
    expect(after.fpsCap).toBe(30);
    expect(after).toMatchObject({
      meshWidth: before.meshWidth,
      meshHeight: before.meshHeight,
      textureRatio: before.textureRatio,
      resolutionScale: before.resolutionScale,
      autoQuality: true,
    });
  });

  it('applies device-sync gain only when Auto Gain is off', () => {
    applyDeviceSyncSettings(fromPeer({ eq: { preAmpGain: 2.5, autoGain: true } }));
    expect(useSettingsStore.getState().eq.preAmpGain).toBe(1.5);

    applyDeviceSyncSettings(fromPeer({ eq: { preAmpGain: 2.5, autoGain: false } }));
    expect(useSettingsStore.getState().eq.preAmpGain).toBe(2.5);
  });

  it('gives an auto step the same outbound key and a manual change a new one', () => {
    useSettingsStore.setState({ syncPerformance: true });
    const base = outboundKey(getSettingsSnapshot());

    useSettingsStore.getState().applyAutoGain(2.2);
    useSettingsStore.getState().applyAutoQualityTier({
      meshWidth: 32,
      meshHeight: 24,
      textureRatio: 0.5,
      resolutionScale: 0.5,
    });
    expect(outboundKey(getSettingsSnapshot())).toBe(base);

    useSettingsStore.getState().setPreAmpGain(2.4);
    expect(outboundKey(getSettingsSnapshot())).not.toBe(base);
  });
});
