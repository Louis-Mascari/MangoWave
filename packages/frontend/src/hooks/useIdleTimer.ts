import { useCallback, useEffect, useRef, useState } from 'react';

export function useIdleTimer(
  timeoutMs: number,
  startPaused = false,
  /** When true, don't add window-level mouse/touch listeners. Caller manages reset/forceIdle. */
  suppressEvents = false,
): {
  isIdle: boolean;
  pause: () => void;
  resume: (initialDelayMs?: number) => void;
  forceIdle: () => void;
  reset: () => void;
} {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(startPaused);

  const resetTimer = useCallback(() => {
    setIsIdle(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (pausedRef.current) return;
    timerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, timeoutMs);
  }, [timeoutMs]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsIdle(false);
  }, []);

  const resume = useCallback(
    (initialDelayMs?: number) => {
      pausedRef.current = false;
      setIsIdle(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setIsIdle(true);
      }, initialDelayMs ?? timeoutMs);
    },
    [timeoutMs],
  );

  const forceIdle = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsIdle(true);
  }, []);

  useEffect(() => {
    if (suppressEvents) {
      // No window listeners — caller manages reset/forceIdle. Start countdown if not paused.
      const initialTimer = !pausedRef.current ? setTimeout(resetTimer, 0) : null;
      return () => {
        if (initialTimer) clearTimeout(initialTimer);
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    const events = ['mousemove', 'mousedown', 'touchstart'] as const;
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));

    // Only auto-start the countdown if not starting paused
    const initialTimer = !pausedRef.current ? setTimeout(resetTimer, 0) : null;

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      if (initialTimer) clearTimeout(initialTimer);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [resetTimer, suppressEvents]);

  return { isIdle, pause, resume, forceIdle, reset: resetTimer };
}
