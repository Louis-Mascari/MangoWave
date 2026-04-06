import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useImportModalStore } from '../useImportModalStore.ts';

describe('useImportModalStore', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useImportModalStore());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.mode).toBe('preset');
  });

  it('opens in preset mode', () => {
    const { result } = renderHook(() => useImportModalStore());
    act(() => result.current.open('preset'));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.mode).toBe('preset');
  });

  it('opens in texture mode', () => {
    const { result } = renderHook(() => useImportModalStore());
    act(() => result.current.open('texture'));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.mode).toBe('texture');
  });

  it('stores presetPackMap when opening in preset mode', () => {
    const { result } = renderHook(() => useImportModalStore());
    const packMap = new Map([['Alpha', 'Minimal']]);
    act(() => result.current.open('preset', packMap));
    expect(result.current.presetPackMap).toBe(packMap);
  });

  it('closes the modal', () => {
    const { result } = renderHook(() => useImportModalStore());
    act(() => result.current.open('preset'));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });
});
