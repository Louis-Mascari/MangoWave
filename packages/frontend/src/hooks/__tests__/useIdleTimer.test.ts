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
    expect(result.current.isIdle).toBe(false);
  });

  it('becomes idle after timeout', () => {
    const { result } = renderHook(() => useIdleTimer(3000));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.isIdle).toBe(true);
  });

  it('resets on mouse movement', () => {
    const { result } = renderHook(() => useIdleTimer(3000));

    // Advance partway
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.isIdle).toBe(false);

    // Simulate mouse movement
    act(() => {
      window.dispatchEvent(new Event('mousemove'));
    });

    // Advance past original timeout — should still not be idle because timer reset
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.isIdle).toBe(false);

    // Now wait the full timeout from the reset
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.isIdle).toBe(true);
  });

  it('does not start countdown when startPaused is true', () => {
    const { result } = renderHook(() => useIdleTimer(3000, true));

    // Even after timeout elapses, still not idle because paused
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.isIdle).toBe(false);

    // Mouse events are ignored while paused
    act(() => {
      window.dispatchEvent(new Event('mousemove'));
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.isIdle).toBe(false);
  });

  it('starts countdown when resumed after startPaused', () => {
    const { result } = renderHook(() => useIdleTimer(3000, true));

    // Resume — starts the countdown
    act(() => result.current.resume());

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.isIdle).toBe(false);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.isIdle).toBe(true);
  });
});
