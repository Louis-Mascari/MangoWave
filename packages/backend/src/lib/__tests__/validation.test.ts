import { describe, it, expect } from 'vitest';
import { checkBodySize, validateSettings } from '../validation';

const validSettings = {
  performance: {
    fpsCap: 60,
    resolutionScale: 1.0,
    meshWidth: 48,
    meshHeight: 36,
    textureRatio: 1.0,
    fxaa: false,
  },
  eqSettings: { preAmpGain: 1.0, bandGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  audio: { smoothingConstant: 0.3, fftSize: 1024 },
  autopilot: { enabled: true, interval: 15, mode: 'all', favoriteWeight: 2 },
  transitionTime: 2.0,
  blockedPresets: ['bad-preset'],
  favoritePresets: ['good-preset'],
  enabledPacks: ['Minimal', 'Non-Minimal'],
  excludedOverrides: [],
  presetNameDisplay: 5,
  songInfoDisplay: 5,
  volume: 0.5,
};

describe('checkBodySize', () => {
  it('returns null for undefined body', () => {
    expect(checkBodySize(undefined)).toBeNull();
  });

  it('returns null for body under 1MB', () => {
    expect(checkBodySize('hello')).toBeNull();
  });

  it('returns error for body over 1MB', () => {
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
    expect(validateSettings(null).valid).toBe(false);
  });

  it('rejects array', () => {
    expect(validateSettings([]).valid).toBe(false);
  });

  it('rejects primitive', () => {
    expect(validateSettings('string').valid).toBe(false);
  });

  it('strips extra keys', () => {
    const result = validateSettings({ ...validSettings, injected: 'payload' });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings).not.toHaveProperty('injected');
    }
  });

  // Performance
  it('clamps performance values to valid ranges', () => {
    const result = validateSettings({
      ...validSettings,
      performance: {
        fpsCap: 500,
        resolutionScale: 5.0,
        meshWidth: 200,
        meshHeight: 200,
        textureRatio: 10.0,
        fxaa: true,
      },
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings.performance.fpsCap).toBe(300);
      expect(result.settings.performance.resolutionScale).toBe(1.0);
      expect(result.settings.performance.meshWidth).toBe(128);
      expect(result.settings.performance.meshHeight).toBe(96);
      expect(result.settings.performance.textureRatio).toBe(2.0);
    }
  });

  it('clamps fpsCap between 1-14 to 15', () => {
    const result = validateSettings({
      ...validSettings,
      performance: { ...validSettings.performance, fpsCap: 10 },
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings.performance.fpsCap).toBe(15);
    }
  });

  it('rejects non-object performance', () => {
    const result = validateSettings({ ...validSettings, performance: 'fast' });
    expect(result.valid).toBe(false);
  });

  // Audio
  it('clamps audio smoothingConstant to 0-1', () => {
    const result = validateSettings({
      ...validSettings,
      audio: { smoothingConstant: 5, fftSize: 1024 },
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings.audio.smoothingConstant).toBe(1);
    }
  });

  it('rejects invalid fftSize', () => {
    const result = validateSettings({
      ...validSettings,
      audio: { smoothingConstant: 0.3, fftSize: 999 },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('fftSize');
    }
  });

  // Autopilot
  it('clamps autopilot values to valid ranges', () => {
    const result = validateSettings({
      ...validSettings,
      autopilot: { enabled: true, interval: 200, mode: 'all', favoriteWeight: 50 },
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings.autopilot.interval).toBe(120);
      expect(result.settings.autopilot.favoriteWeight).toBe(10);
    }
  });

  it('rejects invalid autopilot mode', () => {
    const result = validateSettings({
      ...validSettings,
      autopilot: { enabled: true, interval: 15, mode: 'invalid', favoriteWeight: 2 },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('autopilot.mode');
    }
  });

  // EQ
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

  it('clamps EQ preAmpGain to 0-3', () => {
    const result = validateSettings({
      ...validSettings,
      eqSettings: { preAmpGain: 50, bandGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings.eqSettings.preAmpGain).toBe(3);
    }
  });

  it('clamps band gain values to -12 to 12', () => {
    const result = validateSettings({
      ...validSettings,
      eqSettings: { preAmpGain: 1, bandGains: [-50, 0, 0, 0, 0, 0, 0, 0, 0, 50] },
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
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

  // Preset lists
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

  // Display settings
  it('accepts presetNameDisplay as "off", "always", or number', () => {
    for (const val of ['off', 'always', 5] as const) {
      const result = validateSettings({ ...validSettings, presetNameDisplay: val });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.settings.presetNameDisplay).toBe(val);
      }
    }
  });

  it('clamps presetNameDisplay number to 1-10', () => {
    const result = validateSettings({ ...validSettings, presetNameDisplay: 50 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings.presetNameDisplay).toBe(10);
    }
  });

  it('accepts songInfoDisplay as "off" or number', () => {
    for (const val of ['off', 5] as const) {
      const result = validateSettings({ ...validSettings, songInfoDisplay: val });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.settings.songInfoDisplay).toBe(val);
      }
    }
  });

  // Volume
  it('clamps volume to 0-1', () => {
    const result = validateSettings({ ...validSettings, volume: 5 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.settings.volume).toBe(1);
    }
  });

  // enabledPacks
  it('rejects non-array enabledPacks', () => {
    const result = validateSettings({ ...validSettings, enabledPacks: 'wrong' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('enabledPacks must be an array');
    }
  });
});
