import { describe, it, expect } from 'vitest';
import { QUALITY_TIERS, tierForSettings } from '../QualityMonitor.ts';

describe('tierForSettings', () => {
  it('maps every tier to itself', () => {
    QUALITY_TIERS.forEach((tier, i) => expect(tierForSettings(tier)).toBe(i));
  });

  it('picks the highest tier a custom configuration meets', () => {
    const high = QUALITY_TIERS[3];
    // One setting below High drops it to the tier it still fully meets
    expect(tierForSettings({ ...high, textureRatio: QUALITY_TIERS[0].textureRatio })).toBeLessThan(
      3,
    );
  });

  it('falls back to the lowest tier for settings below all of them', () => {
    expect(
      tierForSettings({ meshWidth: 1, meshHeight: 1, textureRatio: 0.1, resolutionScale: 0.1 }),
    ).toBe(0);
  });
});
