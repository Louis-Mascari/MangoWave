/**
 * QualityMonitor — runtime FPS monitoring with automatic quality tier stepping.
 *
 * Tracks frame times via a rolling window. When sustained low FPS is detected,
 * steps down to a lower quality tier. When FPS recovers, steps back up.
 *
 * Quality tiers (degradation order):
 *   HIGH:    mesh 48×36, texture 1.0, resolution 1.0
 *   MEDIUM:  mesh 32×24, texture 1.0, resolution 1.0
 *   LOW:     mesh 32×24, texture 0.5, resolution 0.75
 *   MINIMUM: mesh 32×24, texture 0.5, resolution 0.5
 *
 * FPS cap and FXAA are never auto-adjusted — those are user preferences.
 */

export interface QualityTier {
  meshWidth: number;
  meshHeight: number;
  textureRatio: number;
  resolutionScale: number;
}

export const QUALITY_TIERS: readonly QualityTier[] = [
  { meshWidth: 32, meshHeight: 24, textureRatio: 0.5, resolutionScale: 0.5 }, // 0: Minimum
  { meshWidth: 32, meshHeight: 24, textureRatio: 0.5, resolutionScale: 0.75 }, // 1: Low
  { meshWidth: 32, meshHeight: 24, textureRatio: 1.0, resolutionScale: 1.0 }, // 2: Medium
  { meshWidth: 48, meshHeight: 36, textureRatio: 1.0, resolutionScale: 1.0 }, // 3: High
] as const;

const TIER_LABELS = ['Minimum', 'Low', 'Medium', 'High'] as const;
type TierLabel = (typeof TIER_LABELS)[number];

// Thresholds
const STEP_DOWN_RATIO = 0.75; // FPS < 75% of target → step down
const STEP_UP_RATIO = 0.95; // FPS > 95% of target → step up
const STEP_DOWN_DURATION_MS = 3_000; // sustain low FPS for 3s before stepping down
const STEP_UP_DURATION_MS = 15_000; // sustain good FPS for 15s before stepping up
const COOLDOWN_MS = 5_000; // wait 5s after any tier change before monitoring
const WINDOW_SIZE = 60; // rolling window of frame times

export type QualityChangeCallback = (tier: number, settings: QualityTier) => void;

export class QualityMonitor {
  private frameTimes: Float64Array = new Float64Array(WINDOW_SIZE);
  private frameHead = 0;
  private frameCount = 0;
  private targetFps = 60;
  private currentTier: number;
  private maxTier: number; // never auto-upgrade past this
  private lastChangeTime = 0;
  private lowFpsSince = 0;
  private highFpsSince = 0;
  private enabled = false;
  private onQualityChange: QualityChangeCallback | null = null;

  constructor(initialTier = 3) {
    this.currentTier = initialTier;
    this.maxTier = initialTier;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.reset();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setTargetFps(fps: number): void {
    // 0 = uncapped → target 60 for quality monitoring purposes
    this.targetFps = fps > 0 ? fps : 60;
  }

  setMaxTier(tier: number): void {
    this.maxTier = Math.min(tier, QUALITY_TIERS.length - 1);
    if (this.currentTier > this.maxTier) {
      this.currentTier = this.maxTier;
    }
  }

  setOnQualityChange(callback: QualityChangeCallback | null): void {
    this.onQualityChange = callback;
  }

  getCurrentTier(): number {
    return this.currentTier;
  }

  getCurrentTierLabel(): TierLabel {
    return TIER_LABELS[this.currentTier];
  }

  /** Call once per frame with the frame's delta time in milliseconds. */
  recordFrame(dtMs: number): void {
    if (!this.enabled || dtMs <= 0) return;

    // Record frame time in rolling window
    this.frameTimes[this.frameHead] = dtMs;
    this.frameHead = (this.frameHead + 1) % WINDOW_SIZE;
    if (this.frameCount < WINDOW_SIZE) this.frameCount++;

    // Need at least half a window of data before making decisions
    if (this.frameCount < WINDOW_SIZE / 2) return;

    // In cooldown period after a tier change
    const now = performance.now();
    if (now - this.lastChangeTime < COOLDOWN_MS) {
      this.lowFpsSince = 0;
      this.highFpsSince = 0;
      return;
    }

    const avgFps = this.getAverageFps();
    const targetFps = this.targetFps;

    // Check for low FPS → step down
    if (avgFps < targetFps * STEP_DOWN_RATIO) {
      if (this.lowFpsSince === 0) {
        this.lowFpsSince = now;
      } else if (now - this.lowFpsSince >= STEP_DOWN_DURATION_MS) {
        this.stepDown(now);
        this.lowFpsSince = 0;
        this.highFpsSince = 0;
      }
      // Reset step-up counter when FPS is low
      this.highFpsSince = 0;
    }
    // Check for high FPS → step up
    else if (avgFps >= targetFps * STEP_UP_RATIO) {
      if (this.highFpsSince === 0) {
        this.highFpsSince = now;
      } else if (now - this.highFpsSince >= STEP_UP_DURATION_MS) {
        this.stepUp(now);
        this.highFpsSince = 0;
        this.lowFpsSince = 0;
      }
      // Reset step-down counter when FPS is good
      this.lowFpsSince = 0;
    } else {
      // In between — reset both counters
      this.lowFpsSince = 0;
      this.highFpsSince = 0;
    }
  }

  private getAverageFps(): number {
    if (this.frameCount === 0) return 0;
    let sum = 0;
    const count = Math.min(this.frameCount, WINDOW_SIZE);
    for (let i = 0; i < count; i++) {
      sum += this.frameTimes[i];
    }
    const avgMs = sum / count;
    return avgMs > 0 ? 1000 / avgMs : 0;
  }

  private stepDown(now: number): void {
    if (this.currentTier <= 0) return;
    this.currentTier--;
    this.lastChangeTime = now;
    this.frameCount = 0; // Reset window for fresh measurement at new tier
    this.onQualityChange?.(this.currentTier, QUALITY_TIERS[this.currentTier]);
  }

  private stepUp(now: number): void {
    if (this.currentTier >= this.maxTier) return;
    this.currentTier++;
    this.lastChangeTime = now;
    this.frameCount = 0;
    this.onQualityChange?.(this.currentTier, QUALITY_TIERS[this.currentTier]);
  }

  private reset(): void {
    this.frameCount = 0;
    this.frameHead = 0;
    this.lowFpsSince = 0;
    this.highFpsSince = 0;
    this.lastChangeTime = performance.now();
  }
}
