import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useImportedPresetsStore } from '../useImportedPresetsStore.ts';

// Mock idb-keyval
const mockStore = new Map<string, string>();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(mockStore.get(key))),
  set: vi.fn((key: string, val: string) => {
    mockStore.set(key, val);
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
  keys: vi.fn(() => Promise.resolve(Array.from(mockStore.keys()))),
}));

// Mock milkdropConverter
vi.mock('../../engine/milkdropConverter.ts', () => ({
  convertMilkText: vi.fn((text: string) =>
    Promise.resolve({ converted: true, source: text.slice(0, 10) }),
  ),
  validatePreset: vi.fn(),
}));

describe('useImportedPresetsStore', () => {
  beforeEach(() => {
    mockStore.clear();
    // Reset store state
    useImportedPresetsStore.setState({
      loaded: false,
      milkTexts: new Map(),
      convertedCache: new Map(),
    });
  });

  it('starts with empty state', () => {
    const { result } = renderHook(() => useImportedPresetsStore());
    expect(result.current.loaded).toBe(false);
    expect(result.current.milkTexts.size).toBe(0);
    expect(result.current.convertedCache.size).toBe(0);
  });

  it('loads presets from IDB', async () => {
    mockStore.set('mw-milk:Preset A', '[preset00]\nfoo=bar');
    mockStore.set('mw-milk:Preset B', '[preset00]\nbaz=qux');
    mockStore.set('other-key', 'should be ignored');

    const { result } = renderHook(() => useImportedPresetsStore());
    await act(async () => {
      await result.current.loadFromIdb();
    });

    expect(result.current.loaded).toBe(true);
    expect(result.current.milkTexts.size).toBe(2);
    expect(result.current.milkTexts.get('Preset A')).toBe('[preset00]\nfoo=bar');
    expect(result.current.milkTexts.get('Preset B')).toBe('[preset00]\nbaz=qux');
  });

  it('adds a preset to IDB and store', async () => {
    const { result } = renderHook(() => useImportedPresetsStore());
    await act(async () => {
      await result.current.addPreset('My Preset', 'milk-text-content');
    });

    expect(result.current.milkTexts.get('My Preset')).toBe('milk-text-content');
    expect(mockStore.get('mw-milk:My Preset')).toBe('milk-text-content');
  });

  it('removes a preset from IDB and store (including cache)', async () => {
    const { result } = renderHook(() => useImportedPresetsStore());

    await act(async () => {
      await result.current.addPreset('ToDelete', 'content');
    });
    expect(result.current.milkTexts.has('ToDelete')).toBe(true);

    // Get it converted to populate cache
    await act(async () => {
      await result.current.getConvertedPreset('ToDelete');
    });
    expect(result.current.convertedCache.has('ToDelete')).toBe(true);

    // Remove it
    await act(async () => {
      await result.current.removePreset('ToDelete');
    });
    expect(result.current.milkTexts.has('ToDelete')).toBe(false);
    expect(result.current.convertedCache.has('ToDelete')).toBe(false);
    expect(mockStore.has('mw-milk:ToDelete')).toBe(false);
  });

  it('removes all presets', async () => {
    const { result } = renderHook(() => useImportedPresetsStore());

    await act(async () => {
      await result.current.addPreset('P1', 'text1');
      await result.current.addPreset('P2', 'text2');
    });
    expect(result.current.milkTexts.size).toBe(2);

    await act(async () => {
      await result.current.removeAllPresets();
    });
    expect(result.current.milkTexts.size).toBe(0);
    expect(result.current.convertedCache.size).toBe(0);
  });

  it('converts and caches a preset on first access', async () => {
    const { result } = renderHook(() => useImportedPresetsStore());

    await act(async () => {
      await result.current.addPreset('TestPreset', '[preset00]\nfoo=bar');
    });

    let converted: object | null = null;
    await act(async () => {
      converted = await result.current.getConvertedPreset('TestPreset');
    });

    expect(converted).toEqual({ converted: true, source: '[preset00]' });
    expect(result.current.convertedCache.has('TestPreset')).toBe(true);
  });

  it('returns cached result on second access', async () => {
    const { convertMilkText } = await import('../../engine/milkdropConverter.ts');
    const { result } = renderHook(() => useImportedPresetsStore());

    await act(async () => {
      await result.current.addPreset('Cached', 'content');
    });

    await act(async () => {
      await result.current.getConvertedPreset('Cached');
    });
    const callCount = (convertMilkText as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      await result.current.getConvertedPreset('Cached');
    });
    // Should not have called convertMilkText again
    expect((convertMilkText as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
  });

  it('returns null for unknown preset name', async () => {
    const { result } = renderHook(() => useImportedPresetsStore());

    let converted: object | null = null;
    await act(async () => {
      converted = await result.current.getConvertedPreset('NonExistent');
    });

    expect(converted).toBeNull();
  });

  it('returns null when conversion fails', async () => {
    const { convertMilkText } = await import('../../engine/milkdropConverter.ts');
    (convertMilkText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('conversion error'),
    );

    const { result } = renderHook(() => useImportedPresetsStore());

    await act(async () => {
      await result.current.addPreset('BadPreset', 'invalid-content');
    });

    let converted: object | null = null;
    await act(async () => {
      converted = await result.current.getConvertedPreset('BadPreset');
    });

    expect(converted).toBeNull();
  });
});
