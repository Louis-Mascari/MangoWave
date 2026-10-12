import { describe, it, expect } from 'vitest';
import i18n from '../../i18n/index.ts';
import { QUALITY_TIERS, TIER_LABEL_KEYS, tierForSettings } from '../QualityMonitor.ts';

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

describe('TIER_LABEL_KEYS', () => {
  it('names every tier with an existing translation key', () => {
    expect(TIER_LABEL_KEYS).toHaveLength(QUALITY_TIERS.length);
    for (const key of TIER_LABEL_KEYS) expect(i18n.exists(key, { ns: 'common' })).toBe(true);
  });

  it('resolves into the Auto Quality toast', () => {
    const tier = i18n.t(TIER_LABEL_KEYS[1], { ns: 'common' });
    expect(i18n.t('toasts.autoQualityReduced', { ns: 'messages', tier })).toBe(
      'Auto Quality reduced to Low',
    );
  });
});
