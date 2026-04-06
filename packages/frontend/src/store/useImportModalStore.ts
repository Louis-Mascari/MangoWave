import { create } from 'zustand';

interface ImportModalState {
  isOpen: boolean;
  mode: 'preset' | 'texture';
  presetPackMap: ReadonlyMap<string, string>;
  open: (mode: 'preset' | 'texture', presetPackMap?: ReadonlyMap<string, string>) => void;
  close: () => void;
}

export const useImportModalStore = create<ImportModalState>((set) => ({
  isOpen: false,
  mode: 'preset',
  presetPackMap: new Map(),
  open: (mode, presetPackMap) =>
    set({ isOpen: true, mode, presetPackMap: presetPackMap ?? new Map() }),
  close: () => set({ isOpen: false }),
}));
