import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { GroupedVirtuoso } from 'react-virtuoso';

import { useSettingsStore } from '../store/useSettingsStore.ts';
import { usePresetHistoryStore } from '../store/usePresetHistoryStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import quarantinedData from '../data/quarantined-presets.json';

type FilterTab = 'all' | 'favorites' | 'blocked' | 'quarantined' | 'history';

interface PresetBrowserProps {
  presetList: string[];
  currentPreset: string;
  presetPackMap: Map<string, string>;
  onSelectPreset: (name: string) => void;
  onNextPreset: () => void;
}

const quarantinedSet = new Set(quarantinedData.presets as string[]);

function getAllBuiltinPacks(packMap: Map<string, string>): string[] {
  const packs = new Set<string>();
  for (const pack of packMap.values()) {
    packs.add(pack);
  }
  return Array.from(packs);
}

function PresetRow({
  name,
  isCurrent,
  isFavorite,
  isBlocked,
  isQuarantined,
  onSelect,
  onToggleFavorite,
  onToggleBlock,
  onUnquarantine,
}: {
  name: string;
  isCurrent: boolean;
  isFavorite: boolean;
  isBlocked: boolean;
  isQuarantined: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onToggleBlock: () => void;
  onUnquarantine: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs ${
        isCurrent ? 'bg-orange-500/30 text-white' : 'text-white/70 hover:bg-white/10'
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-left">
        {isQuarantined && (
          <span className="mr-1 text-yellow-500/60" title="Quarantined">
            !
          </span>
        )}
        {name}
      </span>
      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggleFavorite}
          className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
            isFavorite ? 'text-yellow-400' : 'text-white/30 hover:bg-white/10 hover:text-yellow-400'
          }`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
        {isQuarantined && (
          <button
            onClick={onUnquarantine}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent text-yellow-500/60 hover:bg-white/10 hover:text-yellow-400"
            title="Remove from quarantine"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
        <button
          onClick={onToggleBlock}
          className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
            isBlocked ? 'text-red-400' : 'text-white/30 hover:bg-white/10 hover:text-red-400'
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
}

function HistoryRow({
  name,
  isFavorite,
  onSelect,
}: {
  name: string;
  isFavorite: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10"
    >
      <span className="min-w-0 flex-1 truncate text-left">
        {isFavorite && <span className="mr-1 text-yellow-400">&#9733;</span>}
        {name}
      </span>
    </div>
  );
}

export function PresetBrowser({
  presetList,
  currentPreset,
  presetPackMap,
  onSelectPreset,
  onNextPreset,
}: PresetBrowserProps) {
  const blockedPresets = useSettingsStore((s) => s.blockedPresets);
  const favoritePresets = useSettingsStore((s) => s.favoritePresets);
  const enabledPacks = useSettingsStore((s) => s.enabledPacks);
  const setEnabledPacks = useSettingsStore((s) => s.setEnabledPacks);
  const togglePack = useSettingsStore((s) => s.togglePack);
  const showQuarantined = useSettingsStore((s) => s.showQuarantined);
  const quarantineOverrides = useSettingsStore((s) => s.quarantineOverrides);
  const addQuarantineOverride = useSettingsStore((s) => s.addQuarantineOverride);
  const blockPreset = useSettingsStore((s) => s.blockPreset);
  const unblockPreset = useSettingsStore((s) => s.unblockPreset);
  const toggleFavoritePreset = useSettingsStore((s) => s.toggleFavoritePreset);

  const presetHistory = usePresetHistoryStore((s) => s.history);

  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [collapsedPacks, setCollapsedPacks] = useState<Set<string>>(new Set());

  const blockedSet = useMemo(() => new Set(blockedPresets), [blockedPresets]);
  const favoriteSet = useMemo(() => new Set(favoritePresets), [favoritePresets]);
  const overrideSet = useMemo(() => new Set(quarantineOverrides), [quarantineOverrides]);

  const allPacks = useMemo(() => getAllBuiltinPacks(presetPackMap), [presetPackMap]);

  // Initialize enabledPacks on first load (only if never set before).
  const didInitPacks = useRef(false);
  useEffect(() => {
    if (!didInitPacks.current && enabledPacks.length === 0 && allPacks.length > 0) {
      didInitPacks.current = true;
      setEnabledPacks(allPacks);
    }
  }, [allPacks, enabledPacks.length, setEnabledPacks]);

  const enabledPackSet = useMemo(() => new Set(enabledPacks), [enabledPacks]);

  // Determine effective quarantine (hidden unless overridden by user)
  const isQuarantined = useCallback(
    (name: string) => {
      if (!quarantinedSet.has(name)) return false;
      if (overrideSet.has(name)) return false;
      return true;
    },
    [overrideSet],
  );

  // Get pack for a preset
  const getPresetPack = useCallback(
    (name: string): string => {
      return presetPackMap.get(name) ?? 'Unknown';
    },
    [presetPackMap],
  );

  // Build grouped data for "all" tab
  const { groupCounts, groupNames, flatPresets } = useMemo(() => {
    if (filter !== 'all' || deferredSearch) {
      return { groupCounts: [], groupNames: [], flatPresets: [] };
    }

    const packOrder = allPacks;
    const names: string[] = [];
    const counts: number[] = [];
    const flat: string[] = [];

    for (const pack of packOrder) {
      if (!enabledPackSet.has(pack)) continue;
      if (collapsedPacks.has(pack)) {
        const packPresets = presetList.filter((name) => {
          if (getPresetPack(name) !== pack) return false;
          if (blockedSet.has(name)) return false;
          if (!showQuarantined && isQuarantined(name)) return false;
          return true;
        });
        names.push(`${pack}|||${packPresets.length}`);
        counts.push(0);
        continue;
      }

      const packPresets = presetList.filter((name) => {
        if (getPresetPack(name) !== pack) return false;
        if (blockedSet.has(name)) return false;
        if (!showQuarantined && isQuarantined(name)) return false;
        return true;
      });

      if (packPresets.length === 0) continue;

      names.push(`${pack}|||${packPresets.length}`);
      counts.push(packPresets.length);
      flat.push(...packPresets);
    }

    return { groupCounts: counts, groupNames: names, flatPresets: flat };
  }, [
    filter,
    deferredSearch,
    presetList,
    allPacks,
    enabledPackSet,
    collapsedPacks,
    blockedSet,
    showQuarantined,
    isQuarantined,
    getPresetPack,
  ]);

  // Flat filtered list for search, favorites, blocked, quarantined tabs
  const filteredPresets = useMemo(() => {
    if (filter === 'all' && !deferredSearch) return [];
    if (filter === 'history') return [];

    const lowerSearch = deferredSearch.toLowerCase();
    return presetList.filter((name) => {
      if (deferredSearch && !name.toLowerCase().includes(lowerSearch)) return false;
      if (filter === 'favorites') return favoriteSet.has(name);
      if (filter === 'blocked') return blockedSet.has(name);
      if (filter === 'quarantined') {
        return quarantinedSet.has(name) && !overrideSet.has(name);
      }
      // 'all' with search
      if (blockedSet.has(name)) return false;
      if (!showQuarantined && isQuarantined(name)) return false;
      return true;
    });
  }, [
    presetList,
    deferredSearch,
    filter,
    blockedSet,
    favoriteSet,
    overrideSet,
    showQuarantined,
    isQuarantined,
  ]);

  // History list (reversed, filtered by search)
  const historyList = useMemo(() => {
    if (filter !== 'history') return [];
    const reversed = [...presetHistory].reverse();
    if (!deferredSearch) return reversed;
    const lowerSearch = deferredSearch.toLowerCase();
    return reversed.filter((name) => name.toLowerCase().includes(lowerSearch));
  }, [filter, presetHistory, deferredSearch]);

  const handleToggleFavorite = useCallback(
    (name: string) => {
      const wasFavorite = favoriteSet.has(name);
      toggleFavoritePreset(name);
      useToastStore.getState().show(wasFavorite ? 'Removed from favorites' : 'Added to favorites');
    },
    [favoriteSet, toggleFavoritePreset],
  );

  const handleUnquarantine = useCallback(
    (name: string) => {
      addQuarantineOverride(name);
      useToastStore.getState().show('Removed from quarantine');
    },
    [addQuarantineOverride],
  );

  const handleToggleBlock = useCallback(
    (name: string) => {
      const isBlocked = blockedSet.has(name);
      if (isBlocked) {
        unblockPreset(name);
        useToastStore.getState().show('Preset unblocked');
      } else {
        blockPreset(name);
        useToastStore.getState().show('Preset blocked');
        if (name === currentPreset) onNextPreset();
      }
    },
    [blockedSet, blockPreset, unblockPreset, currentPreset, onNextPreset],
  );

  const toggleCollapsePack = useCallback((pack: string) => {
    setCollapsedPacks((prev) => {
      const next = new Set(prev);
      if (next.has(pack)) {
        next.delete(pack);
      } else {
        next.add(pack);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setEnabledPacks(allPacks);
  }, [allPacks, setEnabledPacks]);

  const handleDeselectAll = useCallback(() => {
    setEnabledPacks([]);
  }, [setEnabledPacks]);

  // Render the grouped "all" tab
  const renderGroupedAll = () => (
    <>
      {/* Pack filter checkboxes */}
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {allPacks.map((pack) => (
          <label key={pack} className="flex cursor-pointer items-center gap-1 text-[10px]">
            <input
              type="checkbox"
              checked={enabledPackSet.has(pack)}
              onChange={() => togglePack(pack)}
              className="h-3 w-3 accent-orange-500"
            />
            <span className={enabledPackSet.has(pack) ? 'text-white/70' : 'text-white/30'}>
              {pack}
            </span>
          </label>
        ))}
      </div>
      <div className="mb-1 flex items-center gap-2">
        <button
          onClick={handleSelectAll}
          className="cursor-pointer border-none bg-transparent p-0 text-[9px] text-white/40 underline hover:text-white/60"
        >
          Select all
        </button>
        <button
          onClick={handleDeselectAll}
          className="cursor-pointer border-none bg-transparent p-0 text-[9px] text-white/40 underline hover:text-white/60"
        >
          Deselect all
        </button>
        <span className="text-[9px] text-white/25">
          {enabledPacks.length === 0
            ? 'No packs selected — autopilot paused'
            : `${enabledPacks.length}/${allPacks.length} packs active`}
        </span>
      </div>

      {groupNames.length > 0 ? (
        <GroupedVirtuoso
          style={{ height: '280px' }}
          groupCounts={groupCounts}
          groupContent={(index) => {
            const raw = groupNames[index];
            const [packName, countStr] = raw.split('|||');
            const isCollapsed = collapsedPacks.has(packName);
            return (
              <div
                onClick={() => toggleCollapsePack(packName)}
                className="sticky top-0 z-[1] flex cursor-pointer items-center justify-between bg-black/80 px-2 py-1 backdrop-blur-sm"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400">
                  {isCollapsed ? '▶' : '▼'} {packName}
                </span>
                <span className="text-[10px] text-white/40">{countStr}</span>
              </div>
            );
          }}
          itemContent={(index) => {
            const name = flatPresets[index];
            if (!name) return null;
            return (
              <PresetRow
                name={name}
                isCurrent={name === currentPreset}
                isFavorite={favoriteSet.has(name)}
                isBlocked={blockedSet.has(name)}
                isQuarantined={quarantinedSet.has(name)}
                onSelect={() => onSelectPreset(name)}
                onToggleFavorite={() => handleToggleFavorite(name)}
                onToggleBlock={() => handleToggleBlock(name)}
                onUnquarantine={() => handleUnquarantine(name)}
              />
            );
          }}
        />
      ) : (
        <p className="py-2 text-center text-xs text-white/40">No presets visible</p>
      )}
    </>
  );

  // Render flat list (search, favorites, blocked)
  const renderFlatList = () => (
    <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto">
      {filteredPresets.map((name) => (
        <PresetRow
          key={name}
          name={name}
          isCurrent={name === currentPreset}
          isFavorite={favoriteSet.has(name)}
          isBlocked={blockedSet.has(name)}
          isQuarantined={quarantinedSet.has(name)}
          onSelect={() => onSelectPreset(name)}
          onToggleFavorite={() => handleToggleFavorite(name)}
          onToggleBlock={() => handleToggleBlock(name)}
          onUnquarantine={() => handleUnquarantine(name)}
        />
      ))}
      {filteredPresets.length === 0 && (
        <p className="py-2 text-center text-xs text-white/40">No presets found</p>
      )}
    </div>
  );

  // Render history tab
  const renderHistory = () => (
    <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto">
      {historyList.map((name, i) => (
        <HistoryRow
          key={`${name}-${i}`}
          name={name}
          isFavorite={favoriteSet.has(name)}
          onSelect={() => onSelectPreset(name)}
        />
      ))}
      {historyList.length === 0 && (
        <p className="py-2 text-center text-xs text-white/40">No history yet</p>
      )}
    </div>
  );

  // Render quarantined tab
  const renderQuarantined = () => (
    <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto">
      <p className="mb-1 text-[10px] leading-snug text-white/40">
        Presets suspected broken or not conducive to good vibes. Click to preview, then unquarantine
        any you want to keep.
      </p>
      {filteredPresets.map((name) => (
        <div
          key={name}
          onClick={() => onSelectPreset(name)}
          className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10"
        >
          <span className="min-w-0 flex-1 truncate text-left">{name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleUnquarantine(name);
            }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent text-yellow-500/60 hover:bg-white/10 hover:text-yellow-400"
            title="Remove from quarantine"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      ))}
      {filteredPresets.length === 0 && (
        <p className="py-2 text-center text-xs text-white/40">No quarantined presets</p>
      )}
    </div>
  );

  return (
    <div className="relative flex max-h-96 flex-col gap-2 rounded-lg bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Presets</h3>
        <div className="flex flex-wrap gap-1">
          {(['all', 'favorites', 'blocked', 'quarantined', 'history'] as const).map((f) => (
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

      <div className="relative">
        <input
          type="text"
          placeholder="Search presets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border-none bg-white/10 px-2 py-1 pr-7 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          onClick={() => setSearch('')}
          className={`absolute top-1/2 right-1.5 flex h-4 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-white/20 text-[10px] leading-none text-white/60 hover:bg-white/30 hover:text-white ${
            search ? 'visible' : 'invisible'
          }`}
          aria-label="Clear search"
        >
          ✕
        </button>
      </div>

      {filter === 'all' && !deferredSearch && renderGroupedAll()}
      {filter === 'quarantined' && renderQuarantined()}
      {filter === 'history' && renderHistory()}
      {(filter === 'favorites' || filter === 'blocked' || (deferredSearch && filter === 'all')) &&
        renderFlatList()}
    </div>
  );
}
