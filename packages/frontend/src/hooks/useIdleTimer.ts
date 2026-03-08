import { useCallback, useEffect, useRef, useState } from 'react';

export function useIdleTimer(timeoutMs: number): boolean {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    setIsIdle(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart'] as const;
    events.forEach((event) => window.addEventListener(event, resetTimer));

    // Start initial timer via timeout to avoid synchronous setState in effect
    const initialTimer = setTimeout(resetTimer, 0);

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      clearTimeout(initialTimer);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [resetTimer]);

  return isIdle;
}
