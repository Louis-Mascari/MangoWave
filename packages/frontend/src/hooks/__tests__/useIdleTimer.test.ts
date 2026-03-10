import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdleTimer } from '../useIdleTimer.ts';

describe('useIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts as not idle', () => {
    const { result } = renderHook(() => useIdleTimer(3000));
    // Flush the initial setTimeout(resetTimer, 0)
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(false);
  });

  it('becomes idle after timeout', () => {
    const { result } = renderHook(() => useIdleTimer(3000));
    act(() => vi.advanceTimersByTime(0)); // flush init
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(true);
  });

  it('resets on mouse movement', () => {
    const { result } = renderHook(() => useIdleTimer(3000));
    act(() => vi.advanceTimersByTime(0)); // flush init

    // Advance partway
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(false);

    // Simulate mouse movement
    act(() => {
      window.dispatchEvent(new Event('mousemove'));
    });

    // Advance past original timeout — should still not be idle because timer reset
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(false);

    // Now wait the full timeout from the reset
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(true);
  });

  it('delays initial idle timer when initialDelayMs is set', () => {
    const { result } = renderHook(() => useIdleTimer(3000, 5000));

    // After initial delay hasn't elapsed, timer hasn't started
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current).toBe(false);

    // After initial delay elapses, resetTimer fires (starts the 3s idle timer)
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);

    // After the idle timeout, becomes idle
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(true);
  });

  it('skips initial delay when user interacts before it elapses', () => {
    const { result } = renderHook(() => useIdleTimer(3000, 5000));

    // User moves mouse before initial delay
    act(() => vi.advanceTimersByTime(1000));
    act(() => {
      window.dispatchEvent(new Event('mousemove'));
    });

    // Normal idle timeout from interaction
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(true);
  });
});
