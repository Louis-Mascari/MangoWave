import { create } from 'zustand';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
  onConfirm: (() => void) | null;
  show: (opts: ConfirmOptions) => void;
  close: () => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  destructive: false,
  onConfirm: null,
  show: ({ title, message, confirmLabel, destructive, onConfirm }) =>
    set({
      isOpen: true,
      title,
      message,
      confirmLabel: confirmLabel ?? 'Confirm',
      destructive: destructive ?? false,
      onConfirm,
    }),
  close: () => set({ isOpen: false, onConfirm: null }),
}));
