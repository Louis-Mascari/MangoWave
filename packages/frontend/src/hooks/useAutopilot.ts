import { useEffect } from 'react';
import { useSettingsStore } from '../store/useSettingsStore.ts';

export function useAutopilot(onAdvance: () => void): void {
  const enabled = useSettingsStore((s) => s.autopilot.enabled);
  const interval = useSettingsStore((s) => s.autopilot.interval);

  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(onAdvance, interval * 1000);
    return () => clearInterval(id);
  }, [enabled, interval, onAdvance]);
}
