import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useImportedTexturesStore } from '../useImportedTexturesStore.ts';

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

const sampleTexture = { data: 'data:image/png;base64,abc', width: 256, height: 256 };

describe('useImportedTexturesStore', () => {
  beforeEach(() => {
    mockStore.clear();
    useImportedTexturesStore.setState({
      loaded: false,
      textures: new Map(),
    });
  });

  it('starts with empty state', () => {
    const { result } = renderHook(() => useImportedTexturesStore());
    expect(result.current.loaded).toBe(false);
    expect(result.current.textures.size).toBe(0);
  });

  it('loads textures from IDB', async () => {
    mockStore.set('mw-tex:cells', sampleTexture);
    mockStore.set('mw-tex:fire', { data: 'data:image/png;base64,xyz', width: 128, height: 128 });
    mockStore.set('other-key', 'should be ignored');

    const { result } = renderHook(() => useImportedTexturesStore());
    await act(async () => {
      await result.current.loadFromIdb();
    });

    expect(result.current.loaded).toBe(true);
    expect(result.current.textures.size).toBe(2);
    expect(result.current.textures.get('cells')).toEqual(sampleTexture);
  });

  it('adds a texture to IDB and store', async () => {
    const { result } = renderHook(() => useImportedTexturesStore());
    await act(async () => {
      await result.current.addTexture('cells', sampleTexture);
    });

    expect(result.current.textures.get('cells')).toEqual(sampleTexture);
    expect(mockStore.get('mw-tex:cells')).toEqual(sampleTexture);
  });

  it('removes a texture from IDB and store', async () => {
    const { result } = renderHook(() => useImportedTexturesStore());

    await act(async () => {
      await result.current.addTexture('cells', sampleTexture);
    });
    expect(result.current.textures.has('cells')).toBe(true);

    await act(async () => {
      await result.current.removeTexture('cells');
    });
    expect(result.current.textures.has('cells')).toBe(false);
    expect(mockStore.has('mw-tex:cells')).toBe(false);
  });

  it('removes all textures', async () => {
    const { result } = renderHook(() => useImportedTexturesStore());

    await act(async () => {
      await result.current.addTexture('t1', sampleTexture);
      await result.current.addTexture('t2', sampleTexture);
    });
    expect(result.current.textures.size).toBe(2);

    await act(async () => {
      await result.current.removeAllTextures();
    });
    expect(result.current.textures.size).toBe(0);
  });

  it('getAllTextures returns a plain Record', async () => {
    const { result } = renderHook(() => useImportedTexturesStore());

    await act(async () => {
      await result.current.addTexture('cells', sampleTexture);
    });

    const all = result.current.getAllTextures();
    expect(all).toEqual({ cells: sampleTexture });
    // Should be a plain object, not a Map
    expect(all instanceof Map).toBe(false);
  });
});
