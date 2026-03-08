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
              <div className="flex gap-1">
                <button
                  onClick={() => toggleFavoritePreset(name)}
                  className={`cursor-pointer border-none bg-transparent text-sm ${
                    isFavorite ? 'text-yellow-400' : 'text-white/30 hover:text-yellow-400'
                  }`}
                  title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  *
                </button>
                <button
                  onClick={() => (isBlocked ? unblockPreset(name) : blockPreset(name))}
                  className={`cursor-pointer border-none bg-transparent text-sm ${
                    isBlocked ? 'text-red-400' : 'text-white/30 hover:text-red-400'
                  }`}
                  title={isBlocked ? 'Unblock preset' : 'Block preset'}
                >
                  x
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
