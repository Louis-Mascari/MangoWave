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
});
