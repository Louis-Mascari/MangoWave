import { describe, it, expect } from 'vitest';
import { checkBodySize, validateSettings } from '../validation';

const validSettings = {
  theme: 'default',
  transitionTime: 2.0,
  eqSettings: { preAmpGain: 1.0, bandGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  blockedPresets: ['bad-preset'],
  favoritePresets: ['good-preset'],
};

describe('checkBodySize', () => {
  it('returns null for undefined body', () => {
    expect(checkBodySize(undefined)).toBeNull();
  });

  it('returns null for body under 500KB', () => {
    expect(checkBodySize('hello')).toBeNull();
  });

  it('returns error for body over 500KB', () => {
    const bigBody = 'x'.repeat(1024 * 1024 + 1);
    expect(checkBodySize(bigBody)).toContain('exceeds maximum size');
  });
});

describe('validateSettings', () => {
  it('accepts valid settings', () => {
    const result = validateSettings(validSettings);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings).toEqual(validSettings);
    }
  });

  it('rejects null', () => {
    const result = validateSettings(null);
    expect(result.valid).toBe(false);
  });

  it('rejects array', () => {
    const result = validateSettings([]);
    expect(result.valid).toBe(false);
  });

  it('rejects primitive', () => {
    const result = validateSettings('string');
    expect(result.valid).toBe(false);
  });

  it('strips extra keys', () => {
    const result = validateSettings({ ...validSettings, injected: 'payload' });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings).not.toHaveProperty('injected');
    }
  });

  it('clamps transitionTime to 0-30', () => {
    const result = validateSettings({ ...validSettings, transitionTime: -5 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings.transitionTime).toBe(0);
    }

    const result2 = validateSettings({ ...validSettings, transitionTime: 100 });
    expect(result2.valid).toBe(true);
    if (result2.valid) {
      expect(result2.settings.transitionTime).toBe(30);
    }
  });

  it('clamps gain values to -12 to 12', () => {
    const result = validateSettings({
      ...validSettings,
      eqSettings: { preAmpGain: 50, bandGains: [-50, 0, 0, 0, 0, 0, 0, 0, 0, 50] },
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings.eqSettings.preAmpGain).toBe(12);
      expect(result.settings.eqSettings.bandGains[0]).toBe(-12);
      expect(result.settings.eqSettings.bandGains[9]).toBe(12);
    }
  });

  it('rejects NaN and Infinity for numeric fields', () => {
    expect(validateSettings({ ...validSettings, transitionTime: NaN }).valid).toBe(false);
    expect(validateSettings({ ...validSettings, transitionTime: Infinity }).valid).toBe(false);
    expect(
      validateSettings({
        ...validSettings,
        eqSettings: { preAmpGain: NaN, bandGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      }).valid,
    ).toBe(false);
  });

  it('rejects preset list with non-string items', () => {
    const result = validateSettings({ ...validSettings, blockedPresets: [123] });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('must be a string');
    }
  });

  it('rejects preset names exceeding 200 chars', () => {
    const result = validateSettings({
      ...validSettings,
      favoritePresets: ['a'.repeat(201)],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('exceeds maximum length');
    }
  });
});
