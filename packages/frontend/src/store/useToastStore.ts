import { create } from 'zustand';

export type ToastType = 'info' | 'error' | 'warning';

interface ToastState {
  message: string | null;
  type: ToastType;
  durationMs: number;
  key: number;
  show: (message: string, options?: { type?: ToastType; durationMs?: number }) => void;
  clear: () => void;
}

let activeTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set, get) => ({
  message: null,
  type: 'info',
  durationMs: 3500,
  key: 0,

  show: (message, options) => {
    const type = options?.type ?? 'info';
    const durationMs = options?.durationMs ?? (type === 'info' ? 3500 : 6000);
    if (activeTimer) clearTimeout(activeTimer);
    set({ message, type, durationMs, key: get().key + 1 });
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
