import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useImportedPresetsStore } from '../useImportedPresetsStore.ts';

// Mock idb-keyval
const mockStore = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(mockStore.get(key))),
  set: vi.fn((key: string, val: unknown) => {
    mockStore.set(key, val);
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
  keys: vi.fn(() => Promise.resolve(Array.from(mockStore.keys()))),
}));

// Mock conversionWorkerManager
const mockConvertInWorker = vi.fn((name: string, text: string) =>
  Promise.resolve({ converted: true, source: text.slice(0, 10), name }),
);
vi.mock('../../engine/conversionWorkerManager.ts', () => ({
  convertInWorker: (...args: unknown[]) => mockConvertInWorker(...(args as [string, string])),
}));

// Mock milkdropConverter (validatePreset)
vi.mock('../../engine/milkdropConverter.ts', () => ({
  validatePreset: vi.fn(),
}));

describe('useImportedPresetsStore', () => {
  beforeEach(() => {
    mockStore.clear();
    mockConvertInWorker.mockClear();
    // Reset store state
    useImportedPresetsStore.setState({ loaded: false });
  });

  it('starts with loaded=false', () => {
    const { result } = renderHook(() => useImportedPresetsStore());
    expect(result.current.loaded).toBe(false);
  });

  it('loadFromIdb sets loaded=true', async () => {
    const { result } = renderHook(() => useImportedPresetsStore());
    await act(async () => {
      await result.current.loadFromIdb();
    });
    expect(result.current.loaded).toBe(true);
  });

  it('addPreset stores raw text in IDB', async () => {
    const { result } = renderHook(() => useImportedPresetsStore());
    await act(async () => {
      await result.current.addPreset('My Preset', 'milk-text-content');
    });
    expect(mockStore.get('mw-milk:My Preset')).toBe('milk-text-content');
  });

  it('removePreset deletes both milk and conv keys from IDB', async () => {
    mockStore.set('mw-milk:ToDelete', 'content');
    mockStore.set('mw-conv:ToDelete', { converted: true });

    const { result } = renderHook(() => useImportedPresetsStore());
    await act(async () => {
      await result.current.removePreset('ToDelete');
    });
    expect(mockStore.has('mw-milk:ToDelete')).toBe(false);
    expect(mockStore.has('mw-conv:ToDelete')).toBe(false);
  });

  it('removeAllPresets deletes all milk and conv keys', async () => {
    mockStore.set('mw-milk:P1', 'text1');
    mockStore.set('mw-milk:P2', 'text2');
    mockStore.set('mw-conv:P1', { c: true });
    mockStore.set('other-key', 'preserved');

    const { result } = renderHook(() => useImportedPresetsStore());
    await act(async () => {
      await result.current.removeAllPresets();
    });
    expect(mockStore.has('mw-milk:P1')).toBe(false);
    expect(mockStore.has('mw-milk:P2')).toBe(false);
    expect(mockStore.has('mw-conv:P1')).toBe(false);
    expect(mockStore.has('other-key')).toBe(true);
  });

  it('getConvertedPreset returns cached converted result from IDB', async () => {
    const cachedPreset = { converted: true, cached: true };
    mockStore.set('mw-conv:TestPreset', cachedPreset);

    const { result } = renderHook(() => useImportedPresetsStore());
    let converted: object | null = null;
    await act(async () => {
      converted = await result.current.getConvertedPreset('TestPreset');
    });

    expect(converted).toEqual(cachedPreset);
    expect(mockConvertInWorker).not.toHaveBeenCalled();
  });

  it('getConvertedPreset converts via worker and caches when no cached result', async () => {
    mockStore.set('mw-milk:TestPreset', '[preset00]\nfoo=bar');

    const { result } = renderHook(() => useImportedPresetsStore());
    let converted: object | null = null;
    await act(async () => {
      converted = await result.current.getConvertedPreset('TestPreset');
    });

    expect(converted).toEqual({ converted: true, source: '[preset00]', name: 'TestPreset' });
    expect(mockConvertInWorker).toHaveBeenCalledWith('TestPreset', '[preset00]\nfoo=bar');
    // Should have been cached in IDB
    expect(mockStore.has('mw-conv:TestPreset')).toBe(true);
  });

  it('getConvertedPreset returns null for unknown preset name', async () => {
    const { result } = renderHook(() => useImportedPresetsStore());
    let converted: object | null = null;
    await act(async () => {
      converted = await result.current.getConvertedPreset('NonExistent');
    });
    expect(converted).toBeNull();
  });

  it('getConvertedPreset returns null when conversion fails', async () => {
    mockConvertInWorker.mockRejectedValueOnce(new Error('conversion error'));
    mockStore.set('mw-milk:BadPreset', 'invalid-content');

    const { result } = renderHook(() => useImportedPresetsStore());
    let converted: object | null = null;
    await act(async () => {
      converted = await result.current.getConvertedPreset('BadPreset');
    });
    expect(converted).toBeNull();
  });
});
