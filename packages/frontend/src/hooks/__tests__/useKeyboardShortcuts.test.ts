import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts.ts';

function fireKey(key: string, options: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
}

const handlers = {
  onNextPreset: vi.fn(),
  onPreviousPreset: vi.fn(),
  onToggleFullscreen: vi.fn(),
  onClosePanel: vi.fn(),
  onToggleAutopilot: vi.fn(),
  onToggleFavorite: vi.fn(),
  onToggleBlock: vi.fn(),
  onToggleQueue: vi.fn(),
  onPlayPause: vi.fn(),
  onNextTrack: vi.fn(),
  onPreviousTrack: vi.fn(),
};

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Space calls onNextPreset', () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    act(() => fireKey(' '));
    expect(handlers.onNextPreset).toHaveBeenCalledTimes(1);
  });

  it('N calls onNextPreset', () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    act(() => fireKey('n'));
    expect(handlers.onNextPreset).toHaveBeenCalledTimes(1);
  });

  it('F calls onToggleFullscreen', () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    act(() => fireKey('f'));
    expect(handlers.onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('Escape calls onClosePanel', () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    act(() => fireKey('Escape'));
    expect(handlers.onClosePanel).toHaveBeenCalledTimes(1);
  });

  it('A calls onToggleAutopilot', () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    act(() => fireKey('a'));
    expect(handlers.onToggleAutopilot).toHaveBeenCalledTimes(1);
  });

  it('? toggles shortcut overlay', () => {
    const { result } = renderHook(() => useKeyboardShortcuts(handlers));
    expect(result.current.showShortcutOverlay).toBe(false);

    act(() => fireKey('?'));
    expect(result.current.showShortcutOverlay).toBe(true);
  });

  it('skips when modifier keys are held', () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    act(() => fireKey('n', { ctrlKey: true }));
    expect(handlers.onNextPreset).not.toHaveBeenCalled();
  });

  it('skips when target is an input', () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    expect(handlers.onNextPreset).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('K calls onPlayPause', () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    act(() => fireKey('k'));
    expect(handlers.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('J calls onPreviousTrack', () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    act(() => fireKey('j'));
    expect(handlers.onPreviousTrack).toHaveBeenCalledTimes(1);
  });

  it('L calls onNextTrack', () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    act(() => fireKey('l'));
    expect(handlers.onNextTrack).toHaveBeenCalledTimes(1);
  });

  it('media keys are no-ops when handlers are undefined', () => {
    const minimalHandlers = {
      onNextPreset: vi.fn(),
      onPreviousPreset: vi.fn(),
      onToggleFullscreen: vi.fn(),
      onClosePanel: vi.fn(),
      onToggleAutopilot: vi.fn(),
      onToggleFavorite: vi.fn(),
      onToggleBlock: vi.fn(),
      onToggleQueue: vi.fn(),
    };
    renderHook(() => useKeyboardShortcuts(minimalHandlers));
    // Should not throw
    act(() => fireKey('k'));
    act(() => fireKey('j'));
    act(() => fireKey('l'));
  });
});
