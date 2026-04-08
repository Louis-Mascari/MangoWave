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

describe('useImportedPresetsStore', () => {
  beforeEach(() => {
    mockStore.clear();
    localStorage.clear();
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

  it('loadFromIdb clears legacy mw-conv entries', async () => {
    mockStore.set('mw-conv:OldPreset', { old: true });
    mockStore.set('mw-milk:OldPreset', 'raw text');
    mockStore.set('other-key', 'preserved');

    const { result } = renderHook(() => useImportedPresetsStore());
    await act(async () => {
      await result.current.loadFromIdb();
    });

    expect(mockStore.has('mw-milk:OldPreset')).toBe(true);
    expect(mockStore.has('other-key')).toBe(true);
  });

  it('addPreset stores raw text in IDB', async () => {
    const { result } = renderHook(() => useImportedPresetsStore());
    await act(async () => {
      await result.current.addPreset('My Preset', 'milk-text-content');
    });
    expect(mockStore.get('mw-milk:My Preset')).toBe('milk-text-content');
  });

  it('removePreset deletes milk key from IDB', async () => {
    mockStore.set('mw-milk:ToDelete', 'content');

    const { result } = renderHook(() => useImportedPresetsStore());
    await act(async () => {
      await result.current.removePreset('ToDelete');
    });
    expect(mockStore.has('mw-milk:ToDelete')).toBe(false);
  });

  it('removeAllPresets deletes all milk keys', async () => {
    mockStore.set('mw-milk:P1', 'text1');
    mockStore.set('mw-milk:P2', 'text2');
    mockStore.set('other-key', 'preserved');

    const { result } = renderHook(() => useImportedPresetsStore());
    await act(async () => {
      await result.current.removeAllPresets();
    });
    expect(mockStore.has('mw-milk:P1')).toBe(false);
    expect(mockStore.has('mw-milk:P2')).toBe(false);
    expect(mockStore.has('other-key')).toBe(true);
  });

  it('getMilkText returns stored text', async () => {
    mockStore.set('mw-milk:TestPreset', 'raw milk text');

    const { result } = renderHook(() => useImportedPresetsStore());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.getMilkText('TestPreset');
    });

    expect(text).toBe('raw milk text');
  });

  it('getMilkText returns null for unknown preset', async () => {
    const { result } = renderHook(() => useImportedPresetsStore());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.getMilkText('NonExistent');
    });
    expect(text).toBeNull();
  });
});
