import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoGain } from '../useAutoGain.ts';
import { useSettingsStore } from '../../store/useSettingsStore.ts';
import type { AudioEngine } from '../../engine/AudioEngine.ts';

/** Time-domain bytes for a square wave of the given amplitude (0–1), whose RMS equals it. */
function signal(amplitude: number): Uint8Array {
  const swing = Math.round(amplitude * 128);
  return Uint8Array.from({ length: 256 }, (_, i) => 128 + (i % 2 === 0 ? swing : -swing));
}

function engineWith(read: () => Uint8Array): AudioEngine {
  return { getTimeDomainData: read } as unknown as AudioEngine;
}

const gain = () => useSettingsStore.getState().eq.preAmpGain;
const seconds = (n: number) => act(() => vi.advanceTimersByTime(n * 1000));

describe('useAutoGain', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useSettingsStore.setState({
      eq: { preAmpGain: 1.5, bandGains: Array(10).fill(0), autoGain: true },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('raises the gain for a quiet source, one step at a time', () => {
    renderHook(() =>
      useAutoGain(
        engineWith(() => signal(0.008)),
        true,
      ),
    );

    // Nothing during warmup
    seconds(1);
    expect(gain()).toBe(1.5);

    seconds(1);
    expect(gain()).toBe(1.6);
    // Then it waits for the level to settle before stepping again
    seconds(1);
    expect(gain()).toBe(1.6);
    seconds(2);
    expect(gain()).toBe(1.7);
  });

  it('lowers the gain for a hot source', () => {
    renderHook(() =>
      useAutoGain(
        engineWith(() => signal(0.9)),
        true,
      ),
    );
    seconds(30);
    expect(gain()).toBeLessThan(1.5);
  });

  it('leaves a source in the comfortable range alone', () => {
    renderHook(() =>
      useAutoGain(
        engineWith(() => signal(0.1)),
        true,
      ),
    );
    seconds(60);
    expect(gain()).toBe(1.5);
  });

  it('stops at the top of the allowed range', () => {
    renderHook(() =>
      useAutoGain(
        engineWith(() => signal(0.008)),
        true,
      ),
    );
    seconds(600);
    expect(gain()).toBe(3.0);
  });

  it('stops at the bottom of the allowed range', () => {
    renderHook(() =>
      useAutoGain(
        engineWith(() => signal(0.95)),
        true,
      ),
    );
    seconds(600);
    expect(gain()).toBe(0.3);
  });

  it('ignores digital silence, so a paused source does not ramp the gain up', () => {
    renderHook(() =>
      useAutoGain(
        engineWith(() => signal(0)),
        true,
      ),
    );
    seconds(120);
    expect(gain()).toBe(1.5);
  });

  it('keeps Auto Gain on when it adjusts, and stops once the user turns it off', () => {
    renderHook(() =>
      useAutoGain(
        engineWith(() => signal(0.008)),
        true,
      ),
    );
    seconds(2);
    expect(useSettingsStore.getState().eq).toMatchObject({ preAmpGain: 1.6, autoGain: true });

    // Moving the slider is the user's way of turning it off
    act(() => useSettingsStore.getState().setPreAmpGain(2.5));
    seconds(60);
    expect(useSettingsStore.getState().eq).toMatchObject({ preAmpGain: 2.5, autoGain: false });
  });

  it('does nothing without an active session', () => {
    const read = vi.fn(() => signal(0.008));
    renderHook(() => useAutoGain(engineWith(read), false));
    seconds(30);
    expect(read).not.toHaveBeenCalled();
    expect(gain()).toBe(1.5);
  });
});
