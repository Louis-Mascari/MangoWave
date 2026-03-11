import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GroupedVirtuoso } from 'react-virtuoso';
import type { GroupedVirtuosoHandle } from 'react-virtuoso';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { usePresetHistoryStore } from '../store/usePresetHistoryStore.ts';
import { useCustomPackStore } from '../store/useCustomPackStore.ts';
import { useCustomPresetsStore } from '../store/useCustomPresetsStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import { convertMilkFile } from '../engine/milkdropConverter.ts';
import mangosPicks from '../data/mangos-picks.json';
import quarantinedData from '../data/quarantined-presets.json';

type FilterTab = 'all' | 'favorites' | 'blocked' | 'history' | 'packs';

interface PresetBrowserProps {
  presetList: string[];
  currentPreset: string;
  presetPackMap: Map<string, string>;
  onSelectPreset: (name: string) => void;
  onNextPreset: () => void;
}

const MANGOS_PICKS_PACK = "Mango's Picks";
const mangosPicksSet = new Set(mangosPicks as string[]);
const quarantinedSet = new Set(quarantinedData.presets as string[]);

function getAllBuiltinPacks(packMap: Map<string, string>): string[] {
  const packs = new Set<string>();
  // Always include Mango's Picks first
  packs.add(MANGOS_PICKS_PACK);
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
  onAddToPack,
  hasCustomPacks,
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
  onAddToPack: () => void;
  hasCustomPacks: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
        isCurrent ? 'bg-orange-500/30 text-white' : 'text-white/70 hover:bg-white/10'
      }`}
    >
      <button
        onClick={onSelect}
        className="min-w-0 flex-1 cursor-pointer truncate border-none bg-transparent text-left text-inherit"
      >
        {isQuarantined && (
          <span className="mr-1 text-yellow-500/60" title="Quarantined">
            !
          </span>
        )}
        {name}
      </button>
      <div className="flex gap-1.5">
        {hasCustomPacks && (
          <button
            onClick={onAddToPack}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent text-white/30 hover:bg-white/10 hover:text-white/60"
            title="Add to pack..."
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
            </svg>
          </button>
        )}
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
    <div className="flex items-center justify-between rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10">
      <button
        onClick={onSelect}
        className="min-w-0 flex-1 cursor-pointer truncate border-none bg-transparent text-left text-inherit"
      >
        {isFavorite && <span className="mr-1 text-yellow-400">&#9733;</span>}
        {name}
      </button>
    </div>
  );
}

function PackPickerModal({
  packs,
  onSelect,
  onClose,
}: {
  packs: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-lg bg-black/90 p-4 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-white">Add to pack</h4>
        <button
          onClick={onClose}
          className="cursor-pointer rounded border-none bg-white/10 px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/20"
        >
          Cancel
        </button>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto">
        {packs.map((pack) => (
          <button
            key={pack.id}
            onClick={() => onSelect(pack.id)}
            className="cursor-pointer rounded border-none bg-white/10 px-2 py-1.5 text-left text-xs text-white/80 hover:bg-white/20"
          >
            {pack.name}
          </button>
        ))}
        {packs.length === 0 && (
          <p className="py-2 text-center text-xs text-white/40">No custom packs yet</p>
        )}
      </div>
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

  const customPacks = useCustomPackStore((s) => s.packs);
  const addPresetToPack = useCustomPackStore((s) => s.addPresetToPack);
  const createPack = useCustomPackStore((s) => s.createPack);
  const deletePack = useCustomPackStore((s) => s.deletePack);
  const renamePack = useCustomPackStore((s) => s.renamePack);
  const exportPack = useCustomPackStore((s) => s.exportPack);
  const importPack = useCustomPackStore((s) => s.importPack);

  const presetHistory = usePresetHistoryStore((s) => s.history);

  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [packPickerPreset, setPackPickerPreset] = useState<string | null>(null);
  const [collapsedPacks, setCollapsedPacks] = useState<Set<string>>(new Set());
  const [newPackName, setNewPackName] = useState('');
  const [renamingPackId, setRenamingPackId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [milkImporting, setMilkImporting] = useState(false);
  const virtuosoRef = useRef<GroupedVirtuosoHandle>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const milkInputRef = useRef<HTMLInputElement>(null);

  const blockedSet = useMemo(() => new Set(blockedPresets), [blockedPresets]);
  const favoriteSet = useMemo(() => new Set(favoritePresets), [favoritePresets]);
  const overrideSet = useMemo(() => new Set(quarantineOverrides), [quarantineOverrides]);

  const allPacks = useMemo(() => getAllBuiltinPacks(presetPackMap), [presetPackMap]);

  // Initialize enabledPacks to all packs on first load
  useEffect(() => {
    if (enabledPacks.length === 0 && allPacks.length > 0) {
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

  // Get pack for a preset (Mango's Picks membership + source pack)
  const getPresetPack = useCallback(
    (name: string): string => {
      return presetPackMap.get(name) ?? 'Unknown';
    },
    [presetPackMap],
  );

  const getPresetPacks = useCallback(
    (name: string): string[] => {
      const packs: string[] = [];
      if (mangosPicksSet.has(name)) packs.push(MANGOS_PICKS_PACK);
      const sourcePack = presetPackMap.get(name);
      if (sourcePack) packs.push(sourcePack);
      return packs;
    },
    [presetPackMap],
  );

  // Build grouped data for "all" tab
  const { groupCounts, groupNames, flatPresets } = useMemo(() => {
    if (filter !== 'all' || search) {
      return { groupCounts: [], groupNames: [], flatPresets: [] };
    }

    // Determine visible presets per pack
    const packOrder = [MANGOS_PICKS_PACK, ...allPacks.filter((p) => p !== MANGOS_PICKS_PACK)];
    const names: string[] = [];
    const counts: number[] = [];
    const flat: string[] = [];

    for (const pack of packOrder) {
      if (!enabledPackSet.has(pack)) continue;
      if (collapsedPacks.has(pack)) {
        // Still show header with count, just no items
        const packPresets = presetList.filter((name) => {
          if (pack === MANGOS_PICKS_PACK) {
            if (!mangosPicksSet.has(name)) return false;
          } else {
            if (getPresetPack(name) !== pack) return false;
            // Don't double-show Mango's Picks presets under their source pack
          }
          if (blockedSet.has(name)) return false;
          if (!showQuarantined && isQuarantined(name)) return false;
          return true;
        });
        names.push(pack);
        counts.push(0);
        // Store count in header for display, but no items
        // We'll use a hack: store the real count in the pack name
        names[names.length - 1] = `${pack}|||${packPresets.length}`;
        continue;
      }

      const packPresets = presetList.filter((name) => {
        if (pack === MANGOS_PICKS_PACK) {
          if (!mangosPicksSet.has(name)) return false;
        } else {
          if (getPresetPack(name) !== pack) return false;
        }
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
    search,
    presetList,
    allPacks,
    enabledPackSet,
    collapsedPacks,
    blockedSet,
    showQuarantined,
    isQuarantined,
    getPresetPack,
  ]);

  // Flat filtered list for search, favorites, blocked tabs
  const filteredPresets = useMemo(() => {
    if (filter === 'all' && !search) return [];
    if (filter === 'history') return [];

    const lowerSearch = search.toLowerCase();
    return presetList.filter((name) => {
      if (search && !name.toLowerCase().includes(lowerSearch)) return false;
      if (filter === 'favorites') return favoriteSet.has(name);
      if (filter === 'blocked') return blockedSet.has(name);
      // 'all' with search or 'packs'
      if (blockedSet.has(name)) return false;
      if (!showQuarantined && isQuarantined(name)) return false;
      if (filter === 'all' && search) {
        // During search, check enabled packs
        const presetPacks = getPresetPacks(name);
        return presetPacks.some((p) => enabledPackSet.has(p));
      }
      return true;
    });
  }, [
    presetList,
    search,
    filter,
    blockedSet,
    favoriteSet,
    showQuarantined,
    isQuarantined,
    enabledPackSet,
    getPresetPacks,
  ]);

  // History list (reversed)
  const historyList = useMemo(() => {
    if (filter !== 'history') return [];
    return [...presetHistory].reverse();
  }, [filter, presetHistory]);

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

  const handleAddToPack = useCallback(
    (presetName: string, packId: string) => {
      addPresetToPack(packId, presetName);
      setPackPickerPreset(null);
      useToastStore.getState().show('Added to pack');
    },
    [addPresetToPack],
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

  // Auto-scroll to current preset
  useEffect(() => {
    if (filter === 'all' && !search && flatPresets.length > 0) {
      const idx = flatPresets.indexOf(currentPreset);
      if (idx >= 0 && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
      }
    }
  }, [currentPreset, filter, search, flatPresets]);

  const handleSelectAll = useCallback(() => {
    setEnabledPacks(allPacks);
  }, [allPacks, setEnabledPacks]);

  const handleDeselectAll = useCallback(() => {
    setEnabledPacks([]);
  }, [setEnabledPacks]);

  const handleCreatePack = useCallback(() => {
    const name = newPackName.trim();
    if (!name) return;
    createPack(name);
    setNewPackName('');
    useToastStore.getState().show('Pack created');
  }, [newPackName, createPack]);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const result = await importPack(file);
      if (result.success) {
        useToastStore.getState().show('Pack imported');
      } else {
        useToastStore.getState().show(result.error ?? 'Import failed');
      }
      // Reset input
      if (importInputRef.current) importInputRef.current.value = '';
    },
    [importPack],
  );

  const handleMilkImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setMilkImporting(true);
      const addPreset = useCustomPresetsStore.getState().addPreset;
      let success = 0;
      let failed = 0;

      for (const file of Array.from(files)) {
        try {
          const { name, preset } = await convertMilkFile(file);
          await addPreset(name, preset, 'milk-import');

          // Find or create "My Imports" custom pack
          const packs = useCustomPackStore.getState().packs;
          let importsPack = packs.find((p) => p.name === 'My Imports');
          if (!importsPack) {
            const id = createPack('My Imports');
            importsPack = useCustomPackStore.getState().packs.find((p) => p.id === id);
          }
          if (importsPack) {
            addPresetToPack(importsPack.id, name);
          }
          success++;
        } catch (err) {
          failed++;
          const msg = err instanceof Error ? err.message : 'Unknown error';
          useToastStore.getState().show(`Failed: ${file.name} — ${msg}`);
        }
      }

      setMilkImporting(false);
      if (success > 0) {
        useToastStore
          .getState()
          .show(
            `Imported ${success} preset${success > 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`,
          );
      }
      if (milkInputRef.current) milkInputRef.current.value = '';
    },
    [createPack, addPresetToPack],
  );

  const hasCustomPacks = customPacks.length > 0;

  // Render the grouped "all" tab
  const renderGroupedAll = () => (
    <>
      {/* Pack filter chips */}
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button
          onClick={handleSelectAll}
          className="cursor-pointer rounded border-none bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/20"
        >
          All
        </button>
        <button
          onClick={handleDeselectAll}
          className="cursor-pointer rounded border-none bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/20"
        >
          None
        </button>
        {allPacks.map((pack) => (
          <button
            key={pack}
            onClick={() => togglePack(pack)}
            className={`cursor-pointer rounded border-none px-1.5 py-0.5 text-[10px] ${
              enabledPackSet.has(pack)
                ? 'bg-orange-500/30 text-orange-300'
                : 'bg-white/10 text-white/40'
            }`}
          >
            {pack}
          </button>
        ))}
      </div>

      {flatPresets.length > 0 ? (
        <GroupedVirtuoso
          ref={virtuosoRef}
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
                onAddToPack={() => setPackPickerPreset(name)}
                hasCustomPacks={hasCustomPacks}
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
          onAddToPack={() => setPackPickerPreset(name)}
          hasCustomPacks={hasCustomPacks}
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

  // Render custom packs tab
  const renderPacks = () => (
    <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto">
      <p className="text-[10px] text-white/40">
        Custom packs are saved in your browser. Use Export to back up.
      </p>

      {/* Create new pack */}
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="New pack name..."
          value={newPackName}
          onChange={(e) => setNewPackName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreatePack()}
          className="min-w-0 flex-1 rounded border-none bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          onClick={handleCreatePack}
          disabled={!newPackName.trim()}
          className="cursor-pointer rounded border-none bg-orange-500/30 px-2 py-1 text-xs text-orange-300 hover:bg-orange-500/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create
        </button>
      </div>

      {/* Import buttons */}
      <div className="flex gap-1">
        <button
          onClick={() => importInputRef.current?.click()}
          className="cursor-pointer rounded border-none bg-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/20"
        >
          Import Pack
        </button>
        <button
          onClick={() => milkInputRef.current?.click()}
          disabled={milkImporting}
          className="cursor-pointer rounded border-none bg-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {milkImporting ? 'Converting...' : 'Import .milk'}
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          onChange={handleImportFile}
          className="hidden"
        />
        <input
          ref={milkInputRef}
          type="file"
          accept=".milk"
          multiple
          onChange={handleMilkImport}
          className="hidden"
        />
      </div>

      {/* List of custom packs */}
      {customPacks.map((pack) => (
        <div key={pack.id} className="rounded bg-white/5 p-2">
          <div className="mb-1 flex items-center justify-between">
            {renamingPackId === pack.id ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameValue.trim()) {
                    renamePack(pack.id, renameValue.trim());
                    setRenamingPackId(null);
                  }
                  if (e.key === 'Escape') setRenamingPackId(null);
                }}
                onBlur={() => {
                  if (renameValue.trim()) renamePack(pack.id, renameValue.trim());
                  setRenamingPackId(null);
                }}
                autoFocus
                className="min-w-0 flex-1 rounded border-none bg-white/10 px-1 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            ) : (
              <span className="text-xs font-semibold text-white/80">
                {pack.name}{' '}
                <span className="font-normal text-white/40">({pack.presets.length})</span>
              </span>
            )}
            <div className="flex gap-1">
              <button
                onClick={() => {
                  setRenamingPackId(pack.id);
                  setRenameValue(pack.name);
                }}
                className="cursor-pointer rounded border-none bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50 hover:bg-white/20"
              >
                Rename
              </button>
              <button
                onClick={() => exportPack(pack.id)}
                className="cursor-pointer rounded border-none bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50 hover:bg-white/20"
              >
                Export
              </button>
              <button
                onClick={() => deletePack(pack.id)}
                className="cursor-pointer rounded border-none bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/30"
              >
                Delete
              </button>
            </div>
          </div>
          {pack.presets.length > 0 && (
            <div className="flex max-h-24 flex-col gap-0.5 overflow-y-auto">
              {pack.presets.map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between text-[11px] text-white/60"
                >
                  <button
                    onClick={() => onSelectPreset(name)}
                    className="min-w-0 flex-1 cursor-pointer truncate border-none bg-transparent text-left text-inherit"
                  >
                    {name}
                  </button>
                  <button
                    onClick={() =>
                      useCustomPackStore.getState().removePresetFromPack(pack.id, name)
                    }
                    className="cursor-pointer border-none bg-transparent text-[10px] text-white/30 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {customPacks.length === 0 && (
        <p className="py-2 text-center text-xs text-white/40">No custom packs yet</p>
      )}
    </div>
  );

  return (
    <div className="relative flex max-h-96 flex-col gap-2 rounded-lg bg-black/60 p-4 backdrop-blur-sm">
      {/* Pack picker modal */}
      {packPickerPreset && (
        <PackPickerModal
          packs={customPacks}
          onSelect={(id) => handleAddToPack(packPickerPreset, id)}
          onClose={() => setPackPickerPreset(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Presets</h3>
        <div className="flex flex-wrap gap-1">
          {(['all', 'favorites', 'blocked', 'history', 'packs'] as const).map((f) => (
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

      {filter === 'all' && !search && renderGroupedAll()}
      {filter === 'history' && renderHistory()}
      {filter === 'packs' && renderPacks()}
      {(filter === 'favorites' || filter === 'blocked' || search) &&
        filter !== 'history' &&
        filter !== 'packs' &&
        renderFlatList()}
    </div>
  );
}
