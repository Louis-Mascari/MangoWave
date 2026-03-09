import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../store/useSettingsStore.ts';

interface UseAutopilotResult {
  reset: () => void;
}

export function useAutopilot(onAdvance: () => void): UseAutopilotResult {
  const enabled = useSettingsStore((s) => s.autopilot.enabled);
  const interval = useSettingsStore((s) => s.autopilot.interval);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onAdvanceRef = useRef(onAdvance);

  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  });

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    if (enabled) {
      intervalRef.current = setInterval(() => {
        onAdvanceRef.current();
      }, interval * 1000);
    }
  }, [enabled, interval, clearTimer]);

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, [startTimer, clearTimer]);

  const reset = useCallback(() => {
    if (enabled) {
      startTimer();
    }
  }, [enabled, startTimer]);

  return { reset };
}
