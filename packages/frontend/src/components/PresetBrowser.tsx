import { useMemo, useState } from 'react';
import { useSettingsStore } from '../store/useSettingsStore.ts';

interface PresetBrowserProps {
  presetList: string[];
  currentPreset: string;
  onSelectPreset: (name: string) => void;
}

export function PresetBrowser({ presetList, currentPreset, onSelectPreset }: PresetBrowserProps) {
  const blockedPresets = useSettingsStore((s) => s.blockedPresets);
  const favoritePresets = useSettingsStore((s) => s.favoritePresets);
  const blockPreset = useSettingsStore((s) => s.blockPreset);
  const unblockPreset = useSettingsStore((s) => s.unblockPreset);
  const toggleFavoritePreset = useSettingsStore((s) => s.toggleFavoritePreset);

  const [filter, setFilter] = useState<'all' | 'favorites' | 'blocked'>('all');
  const [search, setSearch] = useState('');

  const blockedSet = useMemo(() => new Set(blockedPresets), [blockedPresets]);
  const favoriteSet = useMemo(() => new Set(favoritePresets), [favoritePresets]);

  const filteredPresets = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return presetList.filter((name) => {
      if (!name.toLowerCase().includes(lowerSearch)) return false;
      if (filter === 'favorites') return favoriteSet.has(name);
      if (filter === 'blocked') return blockedSet.has(name);
      return !blockedSet.has(name);
    });
  }, [presetList, search, filter, blockedSet, favoriteSet]);

  return (
    <div className="flex max-h-80 flex-col gap-2 rounded-lg bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Presets</h3>
        <div className="flex gap-1">
          {(['all', 'favorites', 'blocked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`cursor-pointer rounded border-none px-2 py-0.5 text-[10px] capitalize ${
                filter === f
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <input
        type="text"
        placeholder="Search presets..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded border-none bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />

      <div className="flex flex-col gap-0.5 overflow-y-auto">
        {filteredPresets.map((name) => {
          const isBlocked = blockedSet.has(name);
          const isFavorite = favoriteSet.has(name);
          const isCurrent = name === currentPreset;

          return (
            <div
              key={name}
              className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                isCurrent ? 'bg-orange-500/30 text-white' : 'text-white/70 hover:bg-white/10'
              }`}
            >
              <button
                onClick={() => onSelectPreset(name)}
                className="min-w-0 flex-1 cursor-pointer truncate border-none bg-transparent text-left text-inherit"
              >
                {name}
              </button>
              <div className="flex gap-1.5">
                <button
                  onClick={() => toggleFavoritePreset(name)}
                  className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
                    isFavorite
                      ? 'text-yellow-400'
                      : 'text-white/30 hover:bg-white/10 hover:text-yellow-400'
                  }`}
                  title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
                <button
                  onClick={() => (isBlocked ? unblockPreset(name) : blockPreset(name))}
                  className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
                    isBlocked
                      ? 'text-red-400'
                      : 'text-white/30 hover:bg-white/10 hover:text-red-400'
                  }`}
                  title={isBlocked ? 'Unblock preset' : 'Block preset'}
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-3.5 w-3.5"
                  >
                    <circle cx="10" cy="10" r="8" />
                    <line x1="5" y1="5" x2="15" y2="15" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
        {filteredPresets.length === 0 && (
          <p className="py-2 text-center text-xs text-white/40">No presets found</p>
        )}
      </div>
    </div>
  );
}
