import { create } from 'zustand';

const MAX_HISTORY = 100;

interface PresetHistoryState {
  history: string[];
  cursor: number;
  _isNavigating: boolean;

  // Shuffle-style exhaustion tracking.
  // Implicitly bounded: max size equals total preset count (~395).
  // Resets on round exhaustion via resetRound().
  playedSet: Set<string>;

  push: (name: string) => void;
  goBack: () => string | null;
  canGoBack: () => boolean;

  // Shuffle round management
  markPlayed: (name: string) => void;
  resetRound: () => void;
  isPlayed: (name: string) => boolean;
}

export const usePresetHistoryStore = create<PresetHistoryState>((set, get) => ({
  history: [],
  cursor: -1,
  _isNavigating: false,
  playedSet: new Set(),

  push: (name) => {
    const state = get();
    if (state._isNavigating) {
      set({ _isNavigating: false });
      return;
    }
    // Don't push duplicates at the cursor position
    if (state.history[state.cursor] === name) return;

    // Truncate forward entries beyond cursor
    const truncated = state.history.slice(0, state.cursor + 1);
    truncated.push(name);

    // Cap at max
    const capped = truncated.length > MAX_HISTORY ? truncated.slice(-MAX_HISTORY) : truncated;

    set({ history: capped, cursor: capped.length - 1 });
  },

  goBack: () => {
    const state = get();
    if (state.cursor <= 0) return null;
    const newCursor = state.cursor - 1;
    set({ cursor: newCursor, _isNavigating: true });
    return state.history[newCursor];
  },

  canGoBack: () => get().cursor > 0,

  markPlayed: (name) => {
    const state = get();
    const newSet = new Set(state.playedSet);
    newSet.add(name);
    set({ playedSet: newSet });
  },

  resetRound: () => {
    set({ playedSet: new Set() });
  },

  isPlayed: (name) => {
    return get().playedSet.has(name);
  },
}));
