import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePresetBrowserStore } from '../usePresetBrowserStore.ts';

describe('usePresetBrowserStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => usePresetBrowserStore());
    act(() => {
      result.current.setFilter('all');
      result.current.setSearch('');
      result.current.setScrollTop(0);
      // Reset collapsed packs by toggling any that are set
      for (const pack of result.current.collapsedPacks) {
        result.current.toggleCollapsePack(pack);
      }
    });
  });

  it('has correct initial state', () => {
    const { result } = renderHook(() => usePresetBrowserStore());
    expect(result.current.filter).toBe('all');
    expect(result.current.search).toBe('');
    expect(result.current.collapsedPacks.size).toBe(0);
    expect(result.current.scrollTop).toBe(0);
  });

  it('sets filter', () => {
    const { result } = renderHook(() => usePresetBrowserStore());
    act(() => result.current.setFilter('favorites'));
    expect(result.current.filter).toBe('favorites');
  });

  it('sets search', () => {
    const { result } = renderHook(() => usePresetBrowserStore());
    act(() => result.current.setSearch('trippy'));
    expect(result.current.search).toBe('trippy');
  });

  it('toggles collapsed packs', () => {
    const { result } = renderHook(() => usePresetBrowserStore());
    act(() => result.current.toggleCollapsePack('Extra'));
    expect(result.current.collapsedPacks.has('Extra')).toBe(true);

    act(() => result.current.toggleCollapsePack('Extra'));
    expect(result.current.collapsedPacks.has('Extra')).toBe(false);
  });

  it('sets scroll top', () => {
    const { result } = renderHook(() => usePresetBrowserStore());
    act(() => result.current.setScrollTop(150));
    expect(result.current.scrollTop).toBe(150);
  });
});
