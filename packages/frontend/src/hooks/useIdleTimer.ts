import { useCallback, useEffect, useRef, useState } from 'react';

export function useIdleTimer(timeoutMs: number, initialDelayMs?: number): boolean {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInteractedRef = useRef(false);

  const resetTimer = useCallback(() => {
    hasInteractedRef.current = true;
    setIsIdle(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'touchstart'] as const;
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));

    // On mount: if user hasn't interacted yet and an initial delay is set,
    // wait longer before starting the idle timer (e.g. after launch animation)
    const delay = !hasInteractedRef.current && initialDelayMs != null ? initialDelayMs : 0;

    const initialTimer = setTimeout(resetTimer, delay);

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      clearTimeout(initialTimer);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [resetTimer, initialDelayMs]);

  return isIdle;
}
