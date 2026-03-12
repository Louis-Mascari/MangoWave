import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

interface ProgressStore {
  currentMs: number;
  listeners: Set<() => void>;
  rafId: number;
  lastFrame: number;
}

/**
 * Interpolates Spotify progress between 5s polls for a smooth seek bar.
 * Resets to the server value each time `progressMs` changes from the store.
 * Pauses interpolation when `!isPlaying`. Stops at `durationMs` ceiling.
 */
export function useSpotifyProgress(
  progressMs: number,
  durationMs: number,
  isPlaying: boolean,
): number {
  const storeRef = useRef<ProgressStore>({
    currentMs: 0,
    listeners: new Set(),
    rafId: 0,
    lastFrame: 0,
  });

  // Reset to server value when the polled progressMs changes
  useEffect(() => {
    storeRef.current.currentMs = progressMs;
    storeRef.current.listeners.forEach((l) => l());
  }, [progressMs]);

  // Animate progress when playing
  useEffect(() => {
    if (!isPlaying || durationMs <= 0) {
      cancelAnimationFrame(storeRef.current.rafId);
      return;
    }

    const s = storeRef.current;
    s.lastFrame = performance.now();

    const tick = (now: number) => {
      const elapsed = now - s.lastFrame;
      s.lastFrame = now;

      const next = Math.min(s.currentMs + elapsed, durationMs);
      if (next !== s.currentMs) {
        s.currentMs = next;
        s.listeners.forEach((l) => l());
      }
      s.rafId = requestAnimationFrame(tick);
    };

    s.rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(s.rafId);
  }, [isPlaying, durationMs]);

  const subscribe = useCallback((listener: () => void) => {
    storeRef.current.listeners.add(listener);
    return () => {
      storeRef.current.listeners.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback(() => storeRef.current.currentMs, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}
