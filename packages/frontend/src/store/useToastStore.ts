import { create } from 'zustand';

interface ToastState {
  message: string | null;
  key: number;
  show: (message: string, durationMs?: number) => void;
  clear: () => void;
}

let activeTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set, get) => ({
  message: null,
  key: 0,

  show: (message, durationMs = 3500) => {
    if (activeTimer) clearTimeout(activeTimer);
    set({ message, key: get().key + 1 });
    activeTimer = setTimeout(() => {
      activeTimer = null;
      set({ message: null });
    }, durationMs);
  },

  clear: () => {
    if (activeTimer) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }
    set({ message: null });
  },
}));
