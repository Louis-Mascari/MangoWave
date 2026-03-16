import { create } from 'zustand';

export type FilterTab = 'all' | 'favorites' | 'blocked' | 'excluded' | 'history';

interface PresetBrowserState {
  filter: FilterTab;
  search: string;
  collapsedPacks: Set<string>;
  scrollTop: number;

  setFilter: (filter: FilterTab) => void;
  setSearch: (search: string) => void;
  toggleCollapsePack: (pack: string) => void;
  setScrollTop: (scrollTop: number) => void;
}

export const usePresetBrowserStore = create<PresetBrowserState>()((set) => ({
  filter: 'all',
  search: '',
  collapsedPacks: new Set(),
  scrollTop: 0,

  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),
  toggleCollapsePack: (pack) =>
    set((state) => {
      const next = new Set(state.collapsedPacks);
      if (next.has(pack)) {
        next.delete(pack);
      } else {
        next.add(pack);
      }
      return { collapsedPacks: next };
    }),
  setScrollTop: (scrollTop) => set({ scrollTop }),
}));
