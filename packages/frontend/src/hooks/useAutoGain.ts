import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import type { AudioEngine } from '../engine/AudioEngine.ts';
import i18n from '../i18n/index.ts';

// Thresholds for smoothed RMS level (0.0–1.0 scale).
// Time-domain RMS from getByteTimeDomainData is typically 0.01–0.15 for normal audio.
// These thresholds define the "good enough" dead zone where no adjustment happens.
const LOW_THRESHOLD = 0.005; // Below this: effectively silent, boost gain
const HIGH_THRESHOLD = 0.25; // Above this: signal very hot, reduce gain
const GAIN_STEP = 0.05; // Adjustment per tick
const MIN_GAIN = 0.3;
const MAX_GAIN = 3.0;
const TICK_MS = 500;
const EMA_ALPHA = 0.15; // ~5s convergence at 500ms ticks
const WARMUP_TICKS = 6; // Wait ~3s before adjusting
const TOAST_THRESHOLD = 0.5; // Show toast when gain moves this far from baseline

/**
 * Compute RMS from unsigned 8-bit time-domain data.
 * Values are 0-255 where 128 = silence.
 */
function computeRms(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    const sample = (data[i] - 128) / 128;
    sumSq += sample * sample;
  }
  return Math.sqrt(sumSq / data.length);
}

/**
 * Automatically adjusts pre-amp gain based on audio signal level so visuals
 * stay reactive regardless of source volume. Pre-amp is purely visual — it
 * shapes FFT data butterchurn reads but doesn't change what the user hears.
 *
 * Disables itself when the user manually adjusts the pre-amp slider.
 */
export function useAutoGain(audioEngine: AudioEngine | null, isActive: boolean): void {
  const autoGainChangeRef = useRef(false);
  const smoothedRmsRef = useRef(0);
  const warmupRef = useRef(0);
  const baseGainRef = useRef(0);
  const toastShownRef = useRef(false);
  const autoGain = useSettingsStore((s) => s.eq.autoGain);

  // Detect manual pre-amp changes and disable auto-gain.
  // Uses Zustand's vanilla subscribe (no subscribeWithSelector middleware).
  useEffect(() => {
    let prevGain = useSettingsStore.getState().eq.preAmpGain;
    const unsub = useSettingsStore.subscribe((state) => {
      const gain = state.eq.preAmpGain;
      if (gain !== prevGain) {
        if (!autoGainChangeRef.current && state.eq.autoGain) {
          useSettingsStore.getState().setAutoGain(false);
        }
        prevGain = gain;
      }
    });
    return unsub;
  }, []);

  // Main auto-gain loop
  useEffect(() => {
    if (!isActive || !audioEngine || !autoGain) return;

    // Reset state for new activation / source change
    smoothedRmsRef.current = 0;
    warmupRef.current = 0;
    baseGainRef.current = useSettingsStore.getState().eq.preAmpGain;
    toastShownRef.current = false;

    const interval = setInterval(() => {
      // Re-check autoGain each tick (may have been disabled by manual change)
      if (!useSettingsStore.getState().eq.autoGain) {
        clearInterval(interval);
        return;
      }

      const data = audioEngine.getTimeDomainData();
      if (data.length === 0) return;

      const rms = computeRms(data);
      smoothedRmsRef.current = EMA_ALPHA * rms + (1 - EMA_ALPHA) * smoothedRmsRef.current;

      // Wait for EMA to accumulate meaningful data
      warmupRef.current++;
      if (warmupRef.current < WARMUP_TICKS) return;

      const currentGain = useSettingsStore.getState().eq.preAmpGain;
      let newGain = currentGain;

      if (smoothedRmsRef.current < LOW_THRESHOLD) {
        newGain = Math.min(currentGain + GAIN_STEP, MAX_GAIN);
      } else if (smoothedRmsRef.current > HIGH_THRESHOLD) {
        newGain = Math.max(currentGain - GAIN_STEP, MIN_GAIN);
      }

      if (newGain !== currentGain) {
        autoGainChangeRef.current = true;
        useSettingsStore.getState().setPreAmpGain(Math.round(newGain * 100) / 100);
        // Reset flag after React effects run (same macrotask pattern as auto-quality)
        setTimeout(() => {
          autoGainChangeRef.current = false;
        }, 0);

        // Toast when gain has moved significantly from baseline
        if (!toastShownRef.current && Math.abs(newGain - baseGainRef.current) >= TOAST_THRESHOLD) {
          toastShownRef.current = true;
          useToastStore.getState().show(
            i18n.t('toasts.autoGainAdjusted', {
              ns: 'messages',
              value: newGain.toFixed(1),
            }),
            { type: 'info', durationMs: 3000 },
          );
        }
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [isActive, audioEngine, autoGain]);
}
