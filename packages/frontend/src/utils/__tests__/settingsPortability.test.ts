import { describe, it, expect } from 'vitest';
import { buildExport, buildImportPayload, EXPORT_CATEGORIES } from '../settingsPortability.ts';
import type { SettingsState } from '../../store/useSettingsStore.ts';

// Minimal mock state with only data fields needed for tests
const mockState = {
  performance: {
    fpsCap: 60,
    resolutionScale: 0.75,
    meshWidth: 48,
    meshHeight: 36,
    textureRatio: 1.0,
    fxaa: false,
  },
  audio: { smoothingConstant: 0.3, fftSize: 1024 },
  eq: { preAmpGain: 1.5, bandGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  autopilot: { enabled: true, interval: 15, mode: 'all' as const, favoriteWeight: 2 },
  presetNameDisplay: 5,
  songInfoDisplay: 5,
  transitionTime: 2.0,
  volume: 0.5,
  favoritePresets: ['Preset A'],
  blockedPresets: ['Preset B'],
  enabledPacks: ['Base', 'Extra'],
  showQuarantined: false,
  quarantineOverrides: [],
} as unknown as SettingsState;

describe('buildExport', () => {
  it('includes _meta with source and version', () => {
    const result = buildExport(mockState, new Set(['eq']));
    expect(result._meta.source).toBe('mangowave');
    expect(result._meta.version).toBe(1);
    expect(result._meta.exportedAt).toBeTruthy();
  });

  it('exports only selected categories', () => {
    const result = buildExport(mockState, new Set(['eq']));
    expect(result.eq).toBeDefined();
    expect(result.performance).toBeUndefined();
    expect(result.autopilot).toBeUndefined();
  });

  it('exports nothing but _meta when no categories selected', () => {
    const result = buildExport(mockState, new Set());
    expect(Object.keys(result)).toEqual(['_meta']);
  });

  it('never includes store functions', () => {
    const allKeys = EXPORT_CATEGORIES.flatMap((c) => c.fields);
    const result = buildExport(mockState, new Set(EXPORT_CATEGORIES.map((c) => c.key)));
    for (const key of Object.keys(result)) {
      if (key === '_meta') continue;
      expect(allKeys).toContain(key);
      expect(typeof result[key]).not.toBe('function');
    }
  });
});

describe('buildImportPayload', () => {
  const validExport = {
    _meta: { version: 1, exportedAt: '2026-01-01T00:00:00Z', source: 'mangowave' as const },
    performance: { fpsCap: 30, resolutionScale: 0.5 },
    eq: { preAmpGain: 2.0, bandGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    volume: 0.8,
  };

  it('picks only selected categories', () => {
    const result = buildImportPayload(validExport, new Set(['eq']));
    expect(result.eq).toBeDefined();
    expect(result.performance).toBeUndefined();
    expect(result.volume).toBeUndefined();
  });

  it('clamps numeric values to valid ranges', () => {
    const extreme = {
      _meta: validExport._meta,
      performance: { fpsCap: 999, resolutionScale: 50, meshWidth: 9999, textureRatio: -5 },
      volume: 100,
      transitionTime: -10,
    };
    const result = buildImportPayload(extreme, new Set(['rendering', 'display']));
    const perf = result.performance as unknown as Record<string, number>;
    expect(perf.fpsCap).toBe(300);
    expect(perf.resolutionScale).toBe(1.0);
    expect(perf.meshWidth).toBe(128);
    expect(perf.textureRatio).toBe(0.25);
    expect(result.volume).toBe(1);
    expect(result.transitionTime).toBe(0);
  });

  it('validates enum values', () => {
    const bad = {
      _meta: validExport._meta,
      autopilot: { mode: 'evil', enabled: 'yes', interval: 0.001 },
    };
    const result = buildImportPayload(bad, new Set(['autopilot']));
    const ap = result.autopilot as unknown as Record<string, unknown>;
    expect(ap.mode).toBe('all');
    expect(ap.enabled).toBe(true);
    expect(ap.interval).toBe(5);
  });

  it('validates fftSize against allowlist', () => {
    const bad = {
      _meta: validExport._meta,
      audio: { fftSize: 9999, smoothingConstant: 5 },
    };
    const result = buildImportPayload(bad, new Set(['audioAnalysis']));
    const audio = result.audio as unknown as Record<string, number>;
    expect(audio.fftSize).toBe(1024);
    expect(audio.smoothingConstant).toBe(1);
  });

  it('pads bandGains to 10 entries', () => {
    const short = {
      _meta: validExport._meta,
      eq: { bandGains: [5, 5, 5] },
    };
    const result = buildImportPayload(short, new Set(['eq']));
    const eq = result.eq as { bandGains: number[] };
    expect(eq.bandGains).toHaveLength(10);
    expect(eq.bandGains.slice(0, 3)).toEqual([5, 5, 5]);
    expect(eq.bandGains.slice(3)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('caps string arrays and filters non-strings', () => {
    const bad = {
      _meta: validExport._meta,
      favoritePresets: ['good', 123, null, 'also good', { bad: true }],
    };
    const result = buildImportPayload(bad, new Set(['favorites']));
    expect(result.favoritePresets).toEqual(['good', 'also good']);
  });

  it('rounds fractional fpsCap and clamps low values to 15', () => {
    const fractional = {
      _meta: validExport._meta,
      performance: { fpsCap: 59.7 },
    };
    const result = buildImportPayload(fractional, new Set(['rendering']));
    const perf = result.performance as unknown as Record<string, number>;
    expect(perf.fpsCap).toBe(60);

    const low = {
      _meta: validExport._meta,
      performance: { fpsCap: 7 },
    };
    const result2 = buildImportPayload(low, new Set(['rendering']));
    const perf2 = result2.performance as unknown as Record<string, number>;
    expect(perf2.fpsCap).toBe(15);
  });

  it('rejects non-object performance', () => {
    const bad = { _meta: validExport._meta, performance: 'not an object' };
    const result = buildImportPayload(bad, new Set(['rendering']));
    expect(result.performance).toBeUndefined();
  });

  it('handles presetNameDisplay enum values', () => {
    const off = { _meta: validExport._meta, presetNameDisplay: 'off' };
    expect(buildImportPayload(off, new Set(['display'])).presetNameDisplay).toBe('off');

    const always = { _meta: validExport._meta, presetNameDisplay: 'always' };
    expect(buildImportPayload(always, new Set(['display'])).presetNameDisplay).toBe('always');

    const num = { _meta: validExport._meta, presetNameDisplay: 7 };
    expect(buildImportPayload(num, new Set(['display'])).presetNameDisplay).toBe(7);

    const bad = { _meta: validExport._meta, presetNameDisplay: 'evil' };
    expect(buildImportPayload(bad, new Set(['display'])).presetNameDisplay).toBe(5);
  });
});
