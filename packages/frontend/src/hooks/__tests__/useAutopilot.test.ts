import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutopilot } from '../useAutopilot.ts';
import { useSettingsStore } from '../../store/useSettingsStore.ts';

describe('useAutopilot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset autopilot to defaults
    const { result } = renderHook(() => useSettingsStore());
    act(() => {
      result.current.setAutopilotEnabled(false);
      result.current.setAutopilotInterval(15);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire when disabled', () => {
    const onAdvance = vi.fn();
    renderHook(() => useAutopilot(onAdvance));

    vi.advanceTimersByTime(60000);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('fires at interval when enabled', () => {
    const { result: storeResult } = renderHook(() => useSettingsStore());
    act(() => storeResult.current.setAutopilotEnabled(true));

    const onAdvance = vi.fn();
    renderHook(() => useAutopilot(onAdvance));

    vi.advanceTimersByTime(15000);
    expect(onAdvance).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15000);
    expect(onAdvance).toHaveBeenCalledTimes(2);
  });

  it('cleans up on unmount', () => {
    const { result: storeResult } = renderHook(() => useSettingsStore());
    act(() => storeResult.current.setAutopilotEnabled(true));

    const onAdvance = vi.fn();
    const { unmount } = renderHook(() => useAutopilot(onAdvance));

    unmount();
    vi.advanceTimersByTime(30000);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('reset restarts the timer', () => {
    const { result: storeResult } = renderHook(() => useSettingsStore());
    act(() => storeResult.current.setAutopilotEnabled(true));

    const onAdvance = vi.fn();
    const { result } = renderHook(() => useAutopilot(onAdvance));

    // Advance 14 seconds (almost at the 15s interval)
    vi.advanceTimersByTime(14000);
    expect(onAdvance).not.toHaveBeenCalled();

    // Reset the timer — should restart the 15s interval
    act(() => result.current.reset());

    // Advance 14 more seconds — old timer would have fired, but reset prevented it
    vi.advanceTimersByTime(14000);
    expect(onAdvance).not.toHaveBeenCalled();

    // Advance 1 more second to hit the new 15s interval
    vi.advanceTimersByTime(1000);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
