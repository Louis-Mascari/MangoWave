import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readMilkFile,
  validatePreset,
  parsePsVersion,
  findMissingTextures,
} from '../milkdropConverter.ts';

describe('readMilkFile', () => {
  it('reads a valid .milk file and strips the extension from the name', async () => {
    const file = new File(['[preset00]\nfoo=bar'], 'Cool Preset.milk', {
      type: 'application/octet-stream',
    });
    const result = await readMilkFile(file);
    expect(result.name).toBe('Cool Preset');
    expect(result.text).toBe('[preset00]\nfoo=bar');
  });

  it('rejects .milk2 files (unsupported double-preset format)', async () => {
    const file = new File(['content'], 'My Preset.milk2');
    await expect(readMilkFile(file)).rejects.toThrow('invalidFileType');
  });

  it('rejects non-.milk extensions', async () => {
    const file = new File(['content'], 'bad.txt');
    await expect(readMilkFile(file)).rejects.toThrow('invalidFileType');
  });

  it('rejects files larger than 500KB', async () => {
    const bigContent = 'x'.repeat(500_001);
    const file = new File([bigContent], 'big.milk');
    await expect(readMilkFile(file)).rejects.toThrow('fileTooLarge');
  });

  it('rejects empty files', async () => {
    const file = new File([''], 'empty.milk');
    Object.defineProperty(file, 'size', { value: 0 });
    await expect(readMilkFile(file)).rejects.toThrow('emptyFile');
  });

  it('handles case-insensitive extension', async () => {
    const file = new File(['content'], 'Preset.MILK');
    const result = await readMilkFile(file);
    expect(result.name).toBe('Preset');
  });
});

describe('validatePreset', () => {
  it('passes a clean preset object', () => {
    const preset = {
      init_eqs_str: 'x = sin(y);',
      frame_eqs_str: 'r = 0.5;',
      shapes: [{ init_eqs_str: 'a = 1;' }],
      waves: [],
    };
    expect(() => validatePreset(preset)).not.toThrow();
  });

  it('throws on prototype pollution via __proto__', () => {
    const preset = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(() => validatePreset(preset)).toThrow();
  });

  it('throws on prototype pollution via constructor.prototype', () => {
    const preset = JSON.parse('{"constructor": {"prototype": {"polluted": true}}}');
    expect(() => validatePreset(preset)).toThrow();
  });

  it('allows EEL code with JS-like identifiers (WASM sandbox makes them safe)', () => {
    // With eel-wasm, EEL strings are compiled to WASM — they can never
    // execute as JS. These identifiers are harmless EEL variable names.
    const preset = {
      init_eqs_str: 'x = fetch + eval;',
      frame_eqs_str: 'window = 1; document = 2;',
    };
    expect(() => validatePreset(preset)).not.toThrow();
  });

  it('handles preset with no EEL fields', () => {
    const preset = { someOtherField: 'value' };
    expect(() => validatePreset(preset)).not.toThrow();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });
});

describe('parsePsVersion', () => {
  it('returns 0 when no PSVERSION is present', () => {
    expect(parsePsVersion('[preset00]\nfoo=bar')).toBe(0);
  });

  it('returns global PSVERSION', () => {
    expect(parsePsVersion('PSVERSION=2\n[preset00]')).toBe(2);
  });

  it('returns max of warp/comp versions', () => {
    const text = 'PSVERSION=2\nPSVERSION_WARP=3\nPSVERSION_COMP=2\n[preset00]';
    expect(parsePsVersion(text)).toBe(3);
  });

  it('handles PS3 presets', () => {
    expect(parsePsVersion('PSVERSION=3\nPSVERSION_WARP=3\nPSVERSION_COMP=3')).toBe(3);
  });
});

describe('findMissingTextures', () => {
  it('returns empty for presets using only built-in samplers', () => {
    const preset = { warp: 'sampler_main sampler_noise_lq', comp: 'sampler_fw_main' };
    expect(findMissingTextures(preset, new Set())).toEqual([]);
  });

  it('returns empty for built-in extra images', () => {
    const preset = { warp: 'sampler_lichen sampler_cells sampler_mage' };
    expect(findMissingTextures(preset, new Set())).toEqual([]);
  });

  it('detects missing custom textures', () => {
    const preset = { warp: 'sampler_main sampler_worms sampler_alienfruit' };
    expect(findMissingTextures(preset, new Set())).toEqual(['alienfruit', 'worms']);
  });

  it('excludes textures that are in the loaded set', () => {
    const preset = { warp: 'sampler_worms sampler_fire' };
    const loaded = new Set(['worms']);
    expect(findMissingTextures(preset, loaded)).toEqual(['fire']);
  });

  it('handles presets with no sampler references', () => {
    const preset = { init_eqs_str: 'x = sin(y);' };
    expect(findMissingTextures(preset, new Set())).toEqual([]);
  });
});
