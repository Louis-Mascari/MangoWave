import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { GroupedVirtuoso, Virtuoso, type GroupedVirtuosoHandle } from 'react-virtuoso';

import { useSettingsStore } from '../store/useSettingsStore.ts';
import { usePresetHistoryStore } from '../store/usePresetHistoryStore.ts';
import { usePresetBrowserStore } from '../store/usePresetBrowserStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import { useConfirmStore } from '../store/useConfirmStore.ts';
import { quarantinedSet, mobileBlockedSet } from '../data/excludedPresets.ts';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import {
  buildPackExport,
  downloadPackExport,
  parsePackImportFile,
} from '../utils/settingsPortability.ts';
import { PACK_ORDER } from '../engine/VisualizerRenderer.ts';
import type { CustomPack } from '../store/useSettingsStore.ts';

interface PresetBrowserProps {
  presetList: string[];
  currentPreset: string;
  presetPackMap: Map<string, string>;
  onSelectPreset: (name: string) => void;
  onNextPreset: () => void;
}

const QUARANTINE_REASONS: Record<string, { labelKey: string; color: string }> = {
  'Geiss - Spiral Artifact': {
    labelKey: 'presetBrowser.quarantineBroken',
    color: 'text-yellow-400',
  },
  'martin - attack of the beast': {
    labelKey: 'presetBrowser.quarantineContent',
    color: 'text-red-400',
  },
};
const MOBILE_BLOCKED_REASON = {
  labelKey: 'presetBrowser.quarantineMobilePerf',
  color: 'text-blue-400',
};

function PresetRow({
  name,
  isCurrent,
  isFavorite,
  isBlocked,
  onSelect,
  onToggleFavorite,
  onToggleBlock,
  customPacks,
}: {
  name: string;
  isCurrent: boolean;
  isFavorite: boolean;
  isBlocked: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onToggleBlock: () => void;
  customPacks?: CustomPack[];
}) {
  const { t } = useTranslation('messages');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.currentTarget !== e.target) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs ${
        isCurrent ? 'bg-orange-500/30 text-white' : 'text-white/70 hover:bg-white/10'
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggleFavorite}
          className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
            isFavorite ? 'text-yellow-400' : 'text-white/40 hover:bg-white/10 hover:text-yellow-400'
          }`}
          title={
            isFavorite ? t('presetBrowser.removeFromFavorites') : t('presetBrowser.addToFavorites')
          }
          aria-label={
            isFavorite ? t('presetBrowser.removeFromFavorites') : t('presetBrowser.addToFavorites')
          }
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
        <button
          onClick={onToggleBlock}
          className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
            isBlocked ? 'text-red-400' : 'text-white/40 hover:bg-white/10 hover:text-red-400'
          }`}
          title={isBlocked ? t('presetBrowser.unblockPreset') : t('presetBrowser.blockPreset')}
          aria-label={isBlocked ? t('presetBrowser.unblockPreset') : t('presetBrowser.blockPreset')}
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
        {customPacks && <AddToPackButton presetName={name} customPacks={customPacks} />}
      </div>
    </div>
  );
}

function HistoryRow({
  name,
  isFavorite,
  isBlocked,
  onSelect,
  onToggleFavorite,
  onToggleBlock,
}: {
  name: string;
  isFavorite: boolean;
  isBlocked: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onToggleBlock: () => void;
}) {
  const { t } = useTranslation('messages');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.currentTarget !== e.target) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10"
    >
      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggleFavorite}
          className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
            isFavorite ? 'text-yellow-400' : 'text-white/40 hover:bg-white/10 hover:text-yellow-400'
          }`}
          title={
            isFavorite ? t('presetBrowser.removeFromFavorites') : t('presetBrowser.addToFavorites')
          }
          aria-label={
            isFavorite ? t('presetBrowser.removeFromFavorites') : t('presetBrowser.addToFavorites')
          }
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
        <button
          onClick={onToggleBlock}
          className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
            isBlocked ? 'text-red-400' : 'text-white/40 hover:bg-white/10 hover:text-red-400'
          }`}
          title={isBlocked ? t('presetBrowser.unblockPreset') : t('presetBrowser.blockPreset')}
          aria-label={isBlocked ? t('presetBrowser.unblockPreset') : t('presetBrowser.blockPreset')}
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

function PackNameInput({
  packId,
  name,
  onRename,
}: {
  packId: string;
  name: string;
  onRename: (id: string, name: string) => void;
}) {
  const { t } = useTranslation('messages');
  const [localName, setLocalName] = useState(name);

  useEffect(() => {
    setLocalName(name);
  }, [name]);

  return (
    <input
      type="text"
      value={localName}
      onChange={(e) => setLocalName(e.target.value)}
      onBlur={() => {
        const trimmed = localName.trim();
        if (trimmed) {
          onRename(packId, trimmed);
        } else {
          setLocalName(name);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      maxLength={50}
      className="min-w-0 flex-1 rounded border-none bg-white/10 px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
      aria-label={t('customPacks.packName')}
      data-ph-mask
    />
  );
}

function AddToPackButton({
  presetName,
  customPacks,
}: {
  presetName: string;
  customPacks: CustomPack[];
}) {
  const { t } = useTranslation('messages');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<Record<string, number>>({});
  const addPresetToCustomPack = useSettingsStore((s) => s.addPresetToCustomPack);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (!wrapperRef.current || !wrapperRef.current.contains(target)) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const handleClick = () => {
    if (customPacks.length === 0) {
      useToastStore.getState().show(t('presetBrowser.createPackFirst'));
      return;
    }
    if (customPacks.length === 1) {
      addPresetToCustomPack(customPacks[0].id, presetName);
      useToastStore.getState().show(t('presetBrowser.addedToPack', { pack: customPacks[0].name }));
      return;
    }
    if (showDropdown) {
      setShowDropdown(false);
      return;
    }
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 150) {
        setDropdownStyle({
          bottom: window.innerHeight - rect.top + 4,
          right: window.innerWidth - rect.right,
        });
      } else {
        setDropdownStyle({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
      }
    }
    setShowDropdown(true);
  };

  return (
    <div ref={wrapperRef}>
      <button
        ref={buttonRef}
        onClick={handleClick}
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-white/40 hover:bg-white/10 hover:text-green-400"
        title={t('presetBrowser.addToPack')}
        aria-label={t('presetBrowser.addToPack')}
      >
        +
      </button>
      {showDropdown &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] min-w-[140px] rounded bg-black/90 py-1 shadow-lg ring-1 ring-white/20"
            style={dropdownStyle}
          >
            {customPacks.map((pack) => (
              <button
                key={pack.id}
                onClick={() => {
                  addPresetToCustomPack(pack.id, presetName);
                  useToastStore
                    .getState()
                    .show(t('presetBrowser.addedToPack', { pack: pack.name }));
                  setShowDropdown(false);
                }}
                className="block w-full cursor-pointer border-none bg-transparent px-3 py-1 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white"
              >
                <span data-ph-mask>{pack.name}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
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
  const { t } = useTranslation('messages');
  const { t: tc } = useTranslation('common');
  const blockedPresets = useSettingsStore((s) => s.blockedPresets);
  const favoritePresets = useSettingsStore((s) => s.favoritePresets);
  const enabledPacks = useSettingsStore((s) => s.enabledPacks);
  const setEnabledPacks = useSettingsStore((s) => s.setEnabledPacks);
  const togglePack = useSettingsStore((s) => s.togglePack);
  const excludedOverrides = useSettingsStore((s) => s.excludedOverrides);
  const addExcludedOverride = useSettingsStore((s) => s.addExcludedOverride);
  const removeExcludedOverride = useSettingsStore((s) => s.removeExcludedOverride);
  const blockPreset = useSettingsStore((s) => s.blockPreset);
  const unblockPreset = useSettingsStore((s) => s.unblockPreset);
  const toggleFavoritePreset = useSettingsStore((s) => s.toggleFavoritePreset);
  const customPacks = useSettingsStore((s) => s.customPacks);
  const activeCustomPackId = useSettingsStore((s) => s.activeCustomPackId);
  const createCustomPack = useSettingsStore((s) => s.createCustomPack);
  const renameCustomPack = useSettingsStore((s) => s.renameCustomPack);
  const deleteCustomPack = useSettingsStore((s) => s.deleteCustomPack);
  const removePresetFromCustomPack = useSettingsStore((s) => s.removePresetFromCustomPack);
  const setActiveCustomPackId = useSettingsStore((s) => s.setActiveCustomPackId);

  const activePackName = useMemo(
    () => customPacks.find((p) => p.id === activeCustomPackId)?.name ?? null,
    [customPacks, activeCustomPackId],
  );

  const presetHistory = usePresetHistoryStore((s) => s.history);

  const filter = usePresetBrowserStore((s) => s.filter);
  const setFilter = usePresetBrowserStore((s) => s.setFilter);
  const search = usePresetBrowserStore((s) => s.search);
  const setSearch = usePresetBrowserStore((s) => s.setSearch);
  const deferredSearch = useDeferredValue(search);
  const collapsedPacks = usePresetBrowserStore((s) => s.collapsedPacks);
  const toggleCollapsePack = usePresetBrowserStore((s) => s.toggleCollapsePack);
  const selectedPackId = usePresetBrowserStore((s) => s.selectedPackId);
  const setSelectedPackId = usePresetBrowserStore((s) => s.setSelectedPackId);

  const blockedSet = useMemo(() => new Set(blockedPresets), [blockedPresets]);
  const favoriteSet = useMemo(() => new Set(favoritePresets), [favoritePresets]);
  const overrideSet = useMemo(() => new Set(excludedOverrides), [excludedOverrides]);

  const allPacks = PACK_ORDER;

  // Initialize enabledPacks on first load (only if never set before).
  const didInitPacks = useRef(false);
  useEffect(() => {
    if (didInitPacks.current) return;
    if (enabledPacks.length > 0) {
      didInitPacks.current = true;
      return;
    }
    if (allPacks.length > 0) {
      didInitPacks.current = true;
      setEnabledPacks(allPacks);
    }
  }, [allPacks, enabledPacks.length, setEnabledPacks]);

  const enabledPackSet = useMemo(() => new Set(enabledPacks), [enabledPacks]);

  // Determine if preset is effectively excluded (quarantined and not overridden)
  const isExcluded = useCallback(
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

  // On mobile, filter mobile-blocked presets out of main tabs (unless user overrode)
  const mainPresetList = useMemo(
    () =>
      isMobileDevice
        ? presetList.filter((p) => !mobileBlockedSet.has(p) || overrideSet.has(p))
        : presetList,
    [presetList, overrideSet],
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
        const packPresets = mainPresetList.filter((name) => {
          if (getPresetPack(name) !== pack) return false;
          if (blockedSet.has(name)) return false;
          if (isExcluded(name)) return false;
          return true;
        });
        names.push(`${pack}|||${packPresets.length}`);
        counts.push(0);
        continue;
      }

      const packPresets = mainPresetList.filter((name) => {
        if (getPresetPack(name) !== pack) return false;
        if (blockedSet.has(name)) return false;
        if (isExcluded(name)) return false;
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
    mainPresetList,
    allPacks,
    enabledPackSet,
    collapsedPacks,
    blockedSet,
    isExcluded,
    getPresetPack,
  ]);

  // Flat filtered list for search, favorites, blocked tabs
  const filteredPresets = useMemo(() => {
    if (filter === 'all' && !deferredSearch) return [];
    if (filter === 'history' || filter === 'excluded') return [];

    const lowerSearch = deferredSearch.toLowerCase();
    return mainPresetList.filter((name) => {
      if (deferredSearch && !name.toLowerCase().includes(lowerSearch)) return false;
      if (filter === 'favorites') return favoriteSet.has(name);
      if (filter === 'blocked') return blockedSet.has(name);
      // 'all' with search
      if (blockedSet.has(name)) return false;
      if (isExcluded(name)) return false;
      return true;
    });
  }, [mainPresetList, deferredSearch, filter, blockedSet, favoriteSet, isExcluded]);

  // Excluded tab: quarantined presets (not overridden) + mobile-blocked presets (on mobile, not overridden)
  const excludedPresets = useMemo(() => {
    if (filter !== 'excluded') return [];
    const lowerSearch = deferredSearch.toLowerCase();
    const result: { name: string; reason: { labelKey: string; color: string } }[] = [];
    // Quarantined presets (not overridden by user)
    for (const name of quarantinedSet) {
      if (overrideSet.has(name)) continue;
      if (deferredSearch && !name.toLowerCase().includes(lowerSearch)) continue;
      result.push({
        name,
        reason: QUARANTINE_REASONS[name] ?? {
          labelKey: 'presetBrowser.quarantineBroken',
          color: 'text-yellow-400',
        },
      });
    }
    // Mobile-blocked presets (only on mobile, not overridden)
    if (isMobileDevice) {
      for (const name of mobileBlockedSet) {
        if (overrideSet.has(name)) continue;
        if (deferredSearch && !name.toLowerCase().includes(lowerSearch)) continue;
        result.push({ name, reason: MOBILE_BLOCKED_REASON });
      }
    }
    return result;
  }, [filter, deferredSearch, overrideSet]);

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
      useToastStore
        .getState()
        .show(
          wasFavorite ? t('presetBrowser.removeFromFavorites') : t('presetBrowser.addToFavorites'),
        );
    },
    [favoriteSet, toggleFavoritePreset, t],
  );

  const handleRestore = useCallback(
    (name: string) => {
      addExcludedOverride(name);
      useToastStore.getState().show(t('presetBrowser.restoreToPool'));
    },
    [addExcludedOverride, t],
  );

  const handleToggleBlock = useCallback(
    (name: string) => {
      const isBlocked = blockedSet.has(name);
      if (isBlocked) {
        unblockPreset(name);
        useToastStore.getState().show(t('presetBrowser.unblockPreset'));
      } else if (overrideSet.has(name)) {
        removeExcludedOverride(name);
        useToastStore.getState().show(t('presetBrowser.restoreToPool'));
        if (name === currentPreset) onNextPreset();
      } else {
        blockPreset(name);
        useToastStore.getState().show(t('presetBrowser.blockPreset'));
        if (name === currentPreset) onNextPreset();
      }
    },
    [
      blockedSet,
      blockPreset,
      unblockPreset,
      overrideSet,
      removeExcludedOverride,
      currentPreset,
      onNextPreset,
      t,
    ],
  );

  const handleSelectPreset = useCallback(
    (name: string) => {
      onSelectPreset(name);
    },
    [onSelectPreset],
  );

  const handleSelectAll = useCallback(() => {
    setEnabledPacks(allPacks);
  }, [allPacks, setEnabledPacks]);

  const handleDeselectAll = useCallback(() => {
    setEnabledPacks([]);
  }, [setEnabledPacks]);

  // Scroll persistence for grouped virtuoso list
  const virtuosoRef = useRef<GroupedVirtuosoHandle>(null);
  const scrollTopRef = useRef(0);
  const initialScrollTop = useRef(usePresetBrowserStore.getState().scrollTop);

  useEffect(() => {
    return () => {
      usePresetBrowserStore.getState().setScrollTop(scrollTopRef.current);
    };
  }, []);

  // Render the grouped "all" tab
  const renderGroupedAll = () => (
    <>
      {/* Pack filter checkboxes */}
      {activeCustomPackId && (
        <p className="mb-1 text-[9px] text-orange-400/50">
          {t('customPacks.packOverridesFilters')}
        </p>
      )}
      <div
        className={`mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${activeCustomPackId ? 'pointer-events-none opacity-40' : ''}`}
      >
        {allPacks.map((pack) => (
          <label key={pack} className="flex cursor-pointer items-center gap-1 text-[10px]">
            <input
              type="checkbox"
              checked={enabledPackSet.has(pack)}
              onChange={() => togglePack(pack)}
              disabled={!!activeCustomPackId}
              className="h-3 w-3 accent-orange-500"
            />
            <span className={enabledPackSet.has(pack) ? 'text-white/70' : 'text-white/30'}>
              {pack}
            </span>
          </label>
        ))}
      </div>
      <div
        className={`mb-1.5 flex items-center gap-2 ${activeCustomPackId ? 'pointer-events-none opacity-40' : ''}`}
      >
        <button
          onClick={handleSelectAll}
          className="cursor-pointer border-none bg-transparent p-0 text-[10px] text-white/40 underline hover:text-orange-400"
        >
          {tc('selectAll')}
        </button>
        <button
          onClick={handleDeselectAll}
          className="cursor-pointer border-none bg-transparent p-0 text-[10px] text-white/40 underline hover:text-orange-400"
        >
          {tc('deselectAll')}
        </button>
        <span className="text-[9px] text-white/25">
          {enabledPacks.length === 0
            ? t('presetBrowser.noPacksSelected')
            : t('presetBrowser.packsActive', {
                active: enabledPacks.length,
                total: allPacks.length,
              })}
        </span>
      </div>

      {groupNames.length > 0 ? (
        <GroupedVirtuoso
          ref={virtuosoRef}
          style={{ height: isMobileDevice ? 'max(280px, calc(100dvh - 320px))' : '280px' }}
          initialScrollTop={initialScrollTop.current}
          onScroll={(e) => {
            scrollTopRef.current = (e.target as HTMLElement).scrollTop;
          }}
          groupCounts={groupCounts}
          groupContent={(index) => {
            const raw = groupNames[index];
            const [packName, countStr] = raw.split('|||');
            const isCollapsed = collapsedPacks.has(packName);
            return (
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleCollapsePack(packName)}
                onKeyDown={(e) => {
                  if (e.currentTarget !== e.target) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCollapsePack(packName);
                  }
                }}
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
            if (!name) return <div style={{ height: 1 }} />;
            return (
              <PresetRow
                name={name}
                isCurrent={name === currentPreset}
                isFavorite={favoriteSet.has(name)}
                isBlocked={blockedSet.has(name)}
                onSelect={() => handleSelectPreset(name)}
                onToggleFavorite={() => handleToggleFavorite(name)}
                onToggleBlock={() => handleToggleBlock(name)}
                customPacks={customPacks}
              />
            );
          }}
        />
      ) : (
        <p className="py-2 text-center text-xs text-white/40">
          {t('presetBrowser.noPresetsVisible')}
        </p>
      )}
    </>
  );

  // Render flat list (search, favorites, blocked)
  // Virtualize large lists (50+) to avoid DOM stutter; small lists render flat
  const renderFlatList = () => {
    if (filteredPresets.length === 0) {
      return (
        <p className="py-2 text-center text-xs text-white/40">
          {t('presetBrowser.noPresetsFound')}
        </p>
      );
    }

    const row = (name: string) => (
      <PresetRow
        key={name}
        name={name}
        isCurrent={name === currentPreset}
        isFavorite={favoriteSet.has(name)}
        isBlocked={blockedSet.has(name)}
        onSelect={() => handleSelectPreset(name)}
        onToggleFavorite={() => handleToggleFavorite(name)}
        onToggleBlock={() => handleToggleBlock(name)}
        customPacks={customPacks}
      />
    );

    if (filteredPresets.length < 50) {
      return (
        <div className="flex flex-col gap-0.5 overflow-y-auto max-md:min-h-0 max-md:flex-1 md:max-h-[400px]">
          {filteredPresets.map(row)}
        </div>
      );
    }

    return (
      <Virtuoso
        data={filteredPresets}
        className="max-md:min-h-0 max-md:flex-1 md:max-h-[400px]"
        itemContent={(_index, name) => row(name)}
      />
    );
  };

  // Render history tab
  const renderHistory = () => (
    <div className="flex flex-col gap-0.5 overflow-y-auto max-md:min-h-0 max-md:flex-1 md:max-h-[400px]">
      {historyList.map((name, i) => (
        <HistoryRow
          key={`${name}-${i}`}
          name={name}
          isFavorite={favoriteSet.has(name)}
          isBlocked={blockedSet.has(name)}
          onSelect={() => handleSelectPreset(name)}
          onToggleFavorite={() => handleToggleFavorite(name)}
          onToggleBlock={() => handleToggleBlock(name)}
        />
      ))}
      {historyList.length === 0 && (
        <p className="py-2 text-center text-xs text-white/40">{t('presetBrowser.noHistoryYet')}</p>
      )}
    </div>
  );

  // Render excluded tab (quarantined + mobile-blocked)
  const renderExcluded = () => (
    <div className="flex flex-col gap-0.5 overflow-y-auto max-md:min-h-0 max-md:flex-1 md:max-h-[400px]">
      <p className="mb-1 text-[10px] leading-snug text-white/40">
        {t('presetBrowser.excludedDescription')}
      </p>
      {excludedPresets.map(({ name, reason }) => (
        <div
          key={name}
          role="button"
          tabIndex={0}
          onClick={() => handleSelectPreset(name)}
          onKeyDown={(e) => {
            if (e.currentTarget !== e.target) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleSelectPreset(name);
            }
          }}
          className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10"
        >
          <span className="min-w-0 flex-1 truncate text-left">
            <span className={`mr-1.5 text-[10px] font-medium ${reason.color}`}>
              {t(reason.labelKey)}
            </span>
            {name}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRestore(name);
            }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent text-green-500/60 hover:bg-white/10 hover:text-green-400"
            title={t('presetBrowser.restoreToPool')}
            aria-label={t('presetBrowser.restoreToPool')}
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
      {excludedPresets.length === 0 && (
        <p className="py-2 text-center text-xs text-white/40">
          {t('presetBrowser.noExcludedPresets')}
        </p>
      )}
    </div>
  );

  // Pack detail search state
  const [packSearch, setPackSearch] = useState('');
  const deferredPackSearch = useDeferredValue(packSearch);

  const selectedPack = useMemo(
    () => customPacks.find((p) => p.id === selectedPackId) ?? null,
    [customPacks, selectedPackId],
  );

  // Presets available to add to selected pack (not already in it)
  const addablePresets = useMemo(() => {
    if (!selectedPack) return [];
    const inPack = new Set(selectedPack.presets);
    const lowerSearch = deferredPackSearch.toLowerCase();
    return presetList.filter((name) => {
      if (inPack.has(name)) return false;
      if (deferredPackSearch && !name.toLowerCase().includes(lowerSearch)) return false;
      return true;
    });
  }, [selectedPack, presetList, deferredPackSearch]);

  const handleCreatePack = useCallback(() => {
    if (customPacks.length >= 50) {
      useToastStore.getState().show(t('customPacks.maxPacksReached'));
      return;
    }
    const name = `Pack ${customPacks.length + 1}`;
    const id = createCustomPack(name);
    if (id) {
      useToastStore.getState().show(t('customPacks.packCreated', { name }));
      setSelectedPackId(id);
    }
  }, [customPacks.length, createCustomPack, setSelectedPackId, t]);

  const handleDeletePack = useCallback(
    (pack: CustomPack) => {
      useConfirmStore.getState().show({
        title: t('customPacks.deletePack'),
        message: t('customPacks.deleteConfirm', { name: pack.name }),
        confirmLabel: t('customPacks.delete'),
        destructive: true,
        onConfirm: () => {
          deleteCustomPack(pack.id);
          if (selectedPackId === pack.id) setSelectedPackId(null);
          useToastStore.getState().show(t('customPacks.packDeleted'));
        },
      });
    },
    [deleteCustomPack, selectedPackId, setSelectedPackId, t],
  );

  const handleActivatePack = useCallback(
    (id: string | null) => {
      const prevMode = useSettingsStore.getState().autopilot.mode;
      setActiveCustomPackId(id);
      if (id !== null && prevMode === 'favorites') {
        useToastStore.getState().show(t('customPacks.favoritesAutoSwitch'));
      }
      // Auto-advance if current preset isn't in the activated pack
      if (id !== null) {
        const pack = useSettingsStore.getState().customPacks.find((p) => p.id === id);
        if (pack && !pack.presets.includes(currentPreset)) {
          // Delay to let pool recompute after store change
          setTimeout(() => onNextPreset(), 0);
        }
      }
    },
    [setActiveCustomPackId, t, currentPreset, onNextPreset],
  );

  const handleImportPack = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (customPacks.length >= 50) {
        useToastStore.getState().show(t('customPacks.maxPacksReached'));
        return;
      }
      const result = await parsePackImportFile(file);
      if (!result.ok) {
        useToastStore.getState().show(result.error);
        return;
      }
      const knownPresets = new Set(presetList);
      const validPresets = result.presets.filter((p) => knownPresets.has(p));
      const skipped = result.presets.length - validPresets.length;
      const id = createCustomPack(result.name, validPresets);
      if (id) {
        const msg =
          skipped > 0
            ? t('customPacks.packImportedPartial', {
                name: result.name,
                count: validPresets.length,
                skipped,
              })
            : t('customPacks.packImported', { name: result.name, count: validPresets.length });
        useToastStore.getState().show(msg);
        setSelectedPackId(id);
      }
    };
    input.click();
  }, [customPacks.length, createCustomPack, setSelectedPackId, t, presetList]);

  const handleExportPack = useCallback((pack: CustomPack) => {
    downloadPackExport(buildPackExport(pack));
  }, []);

  // Render packs tab
  const renderPacks = () => {
    if (selectedPack) {
      // Pack detail view
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {/* Header — stays outside scroll so focus ring isn't clipped */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedPackId(null);
                setPackSearch('');
              }}
              className="cursor-pointer border-none bg-transparent p-0 text-white/60 hover:text-white"
              aria-label={t('customPacks.back')}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <PackNameInput
              packId={selectedPack.id}
              name={selectedPack.name}
              onRename={renameCustomPack}
            />
            <span className="shrink-0 text-[10px] text-white/40">
              {t('customPacks.presetCount', { count: selectedPack.presets.length })}
            </span>
          </div>

          {/* Pack's presets — scrollable, shares space with add list */}
          {selectedPack.presets.length > 0 && (
            <div className="flex min-h-24 flex-1 flex-col gap-0.5 overflow-y-auto max-md:max-h-48">
              {selectedPack.presets.map((name) => {
                const isBlocked = blockedSet.has(name);
                const isExcluded = !isBlocked && quarantinedSet.has(name);
                const isMobileSkipped = !isBlocked && !isExcluded && mobileBlockedSet.has(name);
                return (
                  <div
                    key={name}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectPreset(name)}
                    onKeyDown={(e) => {
                      if (e.currentTarget !== e.target) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectPreset(name);
                      }
                    }}
                    className={`flex shrink-0 cursor-pointer items-center justify-between rounded px-2 py-1 text-xs ${
                      name === currentPreset
                        ? 'bg-orange-500/30 text-white'
                        : 'text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                      <span className="truncate">{name}</span>
                      {isBlocked && (
                        <span className="shrink-0 rounded bg-red-500/20 px-1 py-px text-[8px] text-red-400/80">
                          {t('customPacks.tagBlocked')}
                        </span>
                      )}
                      {isExcluded && (
                        <span className="shrink-0 rounded bg-yellow-500/20 px-1 py-px text-[8px] text-yellow-400/80">
                          {t('customPacks.tagExcluded')}
                        </span>
                      )}
                      {isMobileSkipped && (
                        <span className="shrink-0 rounded bg-blue-500/20 px-1 py-px text-[8px] text-blue-400/80">
                          {t('customPacks.tagMobileSkipped')}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removePresetFromCustomPack(selectedPack.id, name);
                        if (name === currentPreset && selectedPack.id === activeCustomPackId) {
                          onNextPreset();
                        }
                      }}
                      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-red-400/60 hover:bg-white/10 hover:text-red-400"
                      aria-label={t('customPacks.removePreset')}
                    >
                      −
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add presets — header + search stay pinned, list scrolls */}
          <div className="flex min-h-0 flex-[1.5] flex-col border-t border-white/10 pt-2">
            <p className="mb-1 text-[10px] font-semibold text-white/50">
              {t('customPacks.addPresets')}
            </p>
            <input
              type="text"
              placeholder={t('customPacks.searchPresets')}
              value={packSearch}
              onChange={(e) => setPackSearch(e.target.value)}
              className="mb-1 w-full rounded border-none bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            {addablePresets.length === 0 ? (
              <p className="py-1 text-center text-[10px] text-white/30">
                {t('customPacks.allPresetsAdded')}
              </p>
            ) : (
              <div className="min-h-0 flex-1 overflow-hidden">
                <Virtuoso
                  data={addablePresets}
                  style={{ height: isMobileDevice ? 'max(200px, calc(100dvh - 420px))' : '100%' }}
                  itemContent={(_index, name) => (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectPreset(name)}
                      onKeyDown={(e) => {
                        if (e.currentTarget !== e.target) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectPreset(name);
                        }
                      }}
                      className={`flex shrink-0 cursor-pointer items-center justify-between rounded px-2 py-0.5 text-xs ${
                        name === currentPreset
                          ? 'bg-orange-500/30 text-white'
                          : 'text-white/60 hover:bg-white/10'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          useSettingsStore.getState().addPresetToCustomPack(selectedPack.id, name);
                        }}
                        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border-none bg-transparent text-sm leading-none text-green-500/60 hover:bg-white/10 hover:text-green-400"
                        aria-label={`${t('presetBrowser.addToPack')} ${name}`}
                      >
                        +
                      </button>
                    </div>
                  )}
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    // Pack list view
    return (
      <div className="flex flex-col gap-2 max-md:min-h-0 max-md:flex-1">
        <div className="border-t border-white/10" />
        <div className="flex gap-2">
          <button
            onClick={handleCreatePack}
            className="cursor-pointer rounded border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-medium text-white/60 hover:bg-white/20"
          >
            {t('customPacks.createPack')}
          </button>
          <button
            onClick={handleImportPack}
            className="cursor-pointer rounded border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-medium text-white/60 hover:bg-white/20"
          >
            {t('customPacks.importPack')}
          </button>
        </div>

        <div className="border-t border-white/10" />

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {customPacks.length === 0 && (
            <p className="py-2 text-center text-xs text-white/40">{t('customPacks.emptyState')}</p>
          )}

          {customPacks.map((pack) => {
            const isActive = activeCustomPackId === pack.id;
            return (
              <div
                key={pack.id}
                className={`flex items-center justify-between rounded px-2 py-1.5 ${
                  isActive ? 'bg-orange-500/15 ring-1 ring-orange-500/30' : 'bg-white/5'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`truncate text-xs ${isActive ? 'text-orange-400' : 'text-white/70'}`}
                      data-ph-mask
                    >
                      {pack.name}
                    </span>
                    <span className="text-[9px] text-white/30">
                      {t('customPacks.presetCount', { count: pack.presets.length })}
                    </span>
                  </div>
                </div>
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {(isActive || pack.presets.length > 0) && (
                    <button
                      onClick={() => handleActivatePack(isActive ? null : pack.id)}
                      className={`cursor-pointer rounded border-none px-1.5 py-0.5 text-[9px] ${
                        isActive
                          ? 'bg-orange-500/30 text-orange-300 hover:bg-orange-500/40'
                          : 'bg-white/10 text-white/50 hover:bg-white/20'
                      }`}
                    >
                      {isActive ? t('customPacks.deactivate') : t('customPacks.activate')}
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedPackId(pack.id)}
                    className="cursor-pointer rounded border-none bg-white/10 px-1.5 py-0.5 text-[9px] text-white/50 hover:bg-white/20"
                  >
                    {t('customPacks.edit')}
                  </button>
                  <button
                    onClick={() => handleExportPack(pack)}
                    className="cursor-pointer rounded border-none bg-white/10 px-1.5 py-0.5 text-[9px] text-white/50 hover:bg-white/20"
                    title={t('customPacks.exportPack')}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                      <path
                        fillRule="evenodd"
                        d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeletePack(pack)}
                    className="cursor-pointer rounded border-none bg-white/10 px-1.5 py-0.5 text-[9px] text-red-400/60 hover:bg-red-500/20 hover:text-red-400"
                    title={t('customPacks.deletePack')}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`relative flex flex-col gap-3 overflow-hidden rounded-lg bg-black/60 p-4 backdrop-blur-sm max-md:min-h-0 max-md:flex-1 ${selectedPack ? 'md:h-[36rem]' : 'md:max-h-[32rem]'}`}
    >
      <div className="flex flex-col gap-2">
        {!isMobileDevice && (
          <div>
            <h3 className="text-sm font-semibold text-white">{tc('presets')}</h3>
            {activePackName && (
              <div className="mt-1 inline-flex w-fit items-center gap-1.5 rounded bg-orange-500/15 px-2 py-0.5 ring-1 ring-orange-500/30">
                <p className="min-w-0 truncate text-[10px] text-orange-400" data-ph-mask>
                  {t('customPacks.packActive', { name: activePackName })}
                </p>
                <button
                  onClick={() => handleActivatePack(null)}
                  className="shrink-0 cursor-pointer rounded-full border-none bg-red-500/80 px-2 py-0.5 text-[9px] font-semibold text-white hover:bg-red-500"
                  aria-label={t('customPacks.deactivatePack')}
                  title={t('customPacks.deactivatePack')}
                >
                  {t('customPacks.deactivate')}
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'favorites', 'blocked', 'excluded', 'history', 'packs'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                if (f !== 'packs') setSelectedPackId(null);
              }}
              className={`cursor-pointer rounded border-none px-2 py-0.5 text-[10px] capitalize ${
                filter === f
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              {f === 'packs' ? t('customPacks.tabs.packs') : t(`presetBrowser.tabs.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {filter !== 'packs' && (
        <div className="relative">
          <input
            type="text"
            placeholder={t('presetBrowser.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border-none bg-white/10 px-2 py-1 pr-7 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            onClick={() => setSearch('')}
            className={`absolute top-1/2 right-1.5 flex h-4 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-white/20 text-[10px] leading-none text-white/60 hover:bg-white/30 hover:text-white ${
              search ? 'visible' : 'invisible'
            }`}
            aria-label={t('presetBrowser.clearSearch')}
          >
            ✕
          </button>
        </div>
      )}

      <div
        className="min-h-0 flex-1 flex-col"
        style={{ display: filter === 'all' && !deferredSearch ? 'flex' : 'none' }}
      >
        {renderGroupedAll()}
      </div>
      {filter === 'excluded' && renderExcluded()}
      {filter === 'history' && renderHistory()}
      {filter === 'packs' && <div className="flex min-h-0 flex-1 flex-col">{renderPacks()}</div>}
      {(filter === 'favorites' || filter === 'blocked' || (deferredSearch && filter === 'all')) &&
        renderFlatList()}
    </div>
  );
}
