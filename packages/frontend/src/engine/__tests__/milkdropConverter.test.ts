import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readMilkFile, validatePreset } from '../milkdropConverter.ts';

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

  it('throws on blocked identifier in top-level EEL field', () => {
    const preset = {
      init_eqs_str: 'x = fetch("http://evil.com");',
    };
    expect(() => validatePreset(preset)).toThrow('securityBlocked');
  });

  it('throws on blocked identifier in nested shapes', () => {
    const preset = {
      shapes: [{ frame_eqs_str: 'y = eval("bad");' }],
    };
    expect(() => validatePreset(preset)).toThrow('securityBlocked');
  });

  it('throws on blocked identifier in nested waves', () => {
    const preset = {
      waves: [{ per_frame_eqs_str: 'z = localStorage.getItem("x");' }],
    };
    expect(() => validatePreset(preset)).toThrow('securityBlocked');
  });

  it('allows normal EEL code without blocked identifiers', () => {
    const preset = {
      init_eqs_str: 'x = sin(y) * cos(z);',
      frame_eqs_str: 'rot = rot + 0.01;',
      pixel_eqs_str: 'dx = dx * 1.02;',
      shapes: [{ init_eqs_str: 'sides = 4;' }],
      waves: [{ per_frame_eqs_str: 'r = bass * 0.5;' }],
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

  it('skips non-string EEL fields without error', () => {
    const preset = {
      init_eqs_str: 42,
      frame_eqs_str: null,
      shapes: [{ init_eqs_str: undefined }],
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
