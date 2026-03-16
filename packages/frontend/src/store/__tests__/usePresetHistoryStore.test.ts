import { describe, it, expect, beforeEach } from 'vitest';
import { usePresetHistoryStore } from '../usePresetHistoryStore';

describe('usePresetHistoryStore', () => {
  beforeEach(() => {
    // Reset store to initial state between tests
    usePresetHistoryStore.setState({
      history: [],
      cursor: -1,
      _isNavigating: false,
      playedSet: new Set(),
    });
  });

  describe('markPlayed / isPlayed / resetRound', () => {
    it('markPlayed adds to playedSet', () => {
      const { markPlayed, isPlayed } = usePresetHistoryStore.getState();
      expect(isPlayed('preset-a')).toBe(false);
      markPlayed('preset-a');
      expect(usePresetHistoryStore.getState().isPlayed('preset-a')).toBe(true);
    });

    it('markPlayed is idempotent', () => {
      const { markPlayed } = usePresetHistoryStore.getState();
      markPlayed('preset-a');
      markPlayed('preset-a');
      expect(usePresetHistoryStore.getState().playedSet.size).toBe(1);
    });

    it('resetRound clears playedSet', () => {
      const store = usePresetHistoryStore.getState();
      store.markPlayed('a');
      store.markPlayed('b');
      expect(usePresetHistoryStore.getState().playedSet.size).toBe(2);

      usePresetHistoryStore.getState().resetRound();
      expect(usePresetHistoryStore.getState().playedSet.size).toBe(0);
    });

    it('isPlayed returns correct boolean', () => {
      const store = usePresetHistoryStore.getState();
      store.markPlayed('x');
      expect(usePresetHistoryStore.getState().isPlayed('x')).toBe(true);
      expect(usePresetHistoryStore.getState().isPlayed('y')).toBe(false);
    });
  });

  describe('push / goBack history navigation', () => {
    it('push adds to history and advances cursor', () => {
      usePresetHistoryStore.getState().push('a');
      usePresetHistoryStore.getState().push('b');
      const state = usePresetHistoryStore.getState();
      expect(state.history).toEqual(['a', 'b']);
      expect(state.cursor).toBe(1);
    });

    it('push ignores duplicate at cursor position', () => {
      usePresetHistoryStore.getState().push('a');
      usePresetHistoryStore.getState().push('a');
      const state = usePresetHistoryStore.getState();
      expect(state.history).toEqual(['a']);
      expect(state.cursor).toBe(0);
    });

    it('goBack returns previous preset and sets _isNavigating', () => {
      usePresetHistoryStore.getState().push('a');
      usePresetHistoryStore.getState().push('b');
      usePresetHistoryStore.getState().push('c');

      const result = usePresetHistoryStore.getState().goBack();
      expect(result).toBe('b');
      expect(usePresetHistoryStore.getState().cursor).toBe(1);
      expect(usePresetHistoryStore.getState()._isNavigating).toBe(true);
    });

    it('goBack returns null when at start', () => {
      usePresetHistoryStore.getState().push('a');
      const result = usePresetHistoryStore.getState().goBack();
      expect(result).toBeNull();
    });

    it('goBack returns null on empty history', () => {
      const result = usePresetHistoryStore.getState().goBack();
      expect(result).toBeNull();
    });

    it('push after goBack suppresses duplicate via _isNavigating flag', () => {
      usePresetHistoryStore.getState().push('a');
      usePresetHistoryStore.getState().push('b');
      usePresetHistoryStore.getState().goBack(); // cursor=0, _isNavigating=true

      // This push is from handlePresetChange triggered by loadPreset — should be swallowed
      usePresetHistoryStore.getState().push('a');
      const state = usePresetHistoryStore.getState();
      expect(state._isNavigating).toBe(false);
      expect(state.history).toEqual(['a', 'b']);
      expect(state.cursor).toBe(0);
    });

    it('canGoBack reflects cursor position', () => {
      expect(usePresetHistoryStore.getState().canGoBack()).toBe(false);
      usePresetHistoryStore.getState().push('a');
      expect(usePresetHistoryStore.getState().canGoBack()).toBe(false);
      usePresetHistoryStore.getState().push('b');
      expect(usePresetHistoryStore.getState().canGoBack()).toBe(true);
    });

    it('history caps at 100 entries', () => {
      for (let i = 0; i < 110; i++) {
        usePresetHistoryStore.getState().push(`preset-${i}`);
      }
      const state = usePresetHistoryStore.getState();
      expect(state.history.length).toBe(100);
      expect(state.cursor).toBe(99);
      expect(state.history[99]).toBe('preset-109');
      expect(state.history[0]).toBe('preset-10');
    });
  });
});
