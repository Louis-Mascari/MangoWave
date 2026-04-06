import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { usePresetHistoryStore } from '../store/usePresetHistoryStore.ts';
import { useImportedPresetsStore } from '../store/useImportedPresetsStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import { pickPreset } from '../utils/pickPreset.ts';
import { quarantinedSet, mobileBlockedSet } from '../data/excludedPresets.ts';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import i18n from '../i18n/index.ts';
import type { VisualizerRenderer } from '../engine/VisualizerRenderer.ts';

interface UsePresetNavigationParams {
  rendererRef: React.RefObject<VisualizerRenderer | null>;
  currentPreset: string;
  presetPackMap: Map<string, string>;
  resetAutopilotRef: React.RefObject<() => void>;
}

export interface UsePresetNavigationReturn {
  pickNextPreset: () => void;
  handleNextPreset: () => void;
  handlePreviousPreset: () => void;
  handleSelectPreset: (name: string) => void;
  handleToggleFavorite: () => void;
  handleToggleBlock: () => void;
  canGoBack: boolean;
  mergedBlockedSet: Set<string>;
  isInEnabledPack: (name: string) => boolean;
  blockedPresets: string[];
  favoritePresets: string[];
  enabledPacks: string[];
  activeCustomPackId: string | null;
}

export function usePresetNavigation({
  rendererRef,
  currentPreset,
  presetPackMap,
  resetAutopilotRef,
}: UsePresetNavigationParams): UsePresetNavigationReturn {
  const blockedPresets = useSettingsStore((s) => s.blockedPresets);
  const favoritePresets = useSettingsStore((s) => s.favoritePresets);
  const transitionTime = useSettingsStore((s) => s.transitionTime);
  const excludedOverrides = useSettingsStore((s) => s.excludedOverrides);
  const enabledPacks = useSettingsStore((s) => s.enabledPacks);
  const customPacks = useSettingsStore((s) => s.customPacks);
  const activeCustomPackId = useSettingsStore((s) => s.activeCustomPackId);
  const toggleFavoritePreset = useSettingsStore((s) => s.toggleFavoritePreset);
  const toggleBlockPreset = useSettingsStore((s) => s.toggleBlockPreset);
  const autopilotMode = useSettingsStore((s) => s.autopilot.mode);
  const autopilotEnabled = useSettingsStore((s) => s.autopilot.enabled);
  const autopilotFavoriteWeight = useSettingsStore((s) => s.autopilot.favoriteWeight);

  const canGoBack = usePresetHistoryStore((s) => s.cursor > 0);

  // Build effective quarantine set (quarantined minus user overrides)
  const effectiveQuarantineSet = useMemo(() => {
    const overrideSet = new Set(excludedOverrides);
    const result = new Set<string>();
    for (const name of quarantinedSet) {
      if (!overrideSet.has(name)) {
        result.add(name);
      }
    }
    return result;
  }, [excludedOverrides]);

  // Merged blocked set: user blocks + effective quarantine
  const mergedBlockedSet = useMemo(() => {
    const set = new Set(blockedPresets);
    for (const name of effectiveQuarantineSet) {
      set.add(name);
    }
    return set;
  }, [blockedPresets, effectiveQuarantineSet]);

  // Check if a preset belongs to any enabled built-in pack
  const enabledPackSet = useMemo(() => new Set(enabledPacks), [enabledPacks]);
  const isInEnabledPack = useCallback(
    (name: string) => {
      if (enabledPackSet.size === 0) return false;
      const sourcePack = presetPackMap.get(name);
      return !!sourcePack && enabledPackSet.has(sourcePack);
    },
    [enabledPackSet, presetPackMap],
  );

  // Active custom pack's preset set (for pool filtering)
  const activeCustomPackPresets = useMemo(() => {
    if (!activeCustomPackId) return null;
    const pack = customPacks.find((p) => p.id === activeCustomPackId);
    return pack ? new Set(pack.presets) : null;
  }, [activeCustomPackId, customPacks]);

  /**
   * Lazily convert an imported preset (if needed), register it with the renderer,
   * then load it. Falls back to next preset on failure.
   */
  const loadPresetWithLazyConvert = useCallback(
    async (
      renderer: VisualizerRenderer,
      name: string,
      blendTime: number,
      fallbackToNext?: () => void,
    ) => {
      if (renderer.isEelPresetUnloaded(name)) {
        let preset: object | null = null;
        if (renderer.isImportedPreset(name)) {
          preset = await useImportedPresetsStore.getState().getConvertedPreset(name);
        } else if (renderer.isMilkdropPreset(name)) {
          const { loadMilkdropPreset } = await import('../engine/milkdropPresetsLoader.ts');
          preset = await loadMilkdropPreset(name);
        }
        if (!preset) {
          useToastStore
            .getState()
            .show(i18n.t('importedPresets.conversionFailed', { name, ns: 'messages' }));
          fallbackToNext?.();
          return;
        }
        renderer.registerEelPreset(name, preset);
      }
      renderer.loadPreset(name, blendTime);
    },
    [],
  );

  // Shared shuffle pick: used by both manual next and autopilot
  const pickNextPreset = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const allPresets = renderer.presetList;

    let pool: string[];
    if (activeCustomPackPresets) {
      // Custom pack active: pool is pack's presets minus blocked
      pool = allPresets.filter((p) => activeCustomPackPresets.has(p) && !mergedBlockedSet.has(p));
    } else if (autopilotMode === 'favorites' && favoritePresets.length > 0) {
      // Favorites mode: pool is favorites only (not blocked), ignores pack filtering
      pool = favoritePresets.filter((p) => !mergedBlockedSet.has(p));
    } else if (enabledPacks.length > 0) {
      pool = allPresets.filter((p) => !mergedBlockedSet.has(p) && isInEnabledPack(p));
    } else if (presetPackMap.size > 0) {
      pool = []; // Packs initialized but none enabled
    } else {
      pool = allPresets.filter((p) => !mergedBlockedSet.has(p));
    }

    // On mobile, exclude presets known to cause freezing (unless user overrode)
    if (isMobileDevice) {
      const overrideSet = new Set(useSettingsStore.getState().excludedOverrides);
      pool = pool.filter((p) => !mobileBlockedSet.has(p) || overrideSet.has(p));
    }

    if (pool.length === 0) {
      if (presetPackMap.size > 0) {
        useToastStore
          .getState()
          .show(i18n.t('toasts.noPresetsAvailable', { ns: 'messages' }), { type: 'warning' });
      }
      return;
    }

    const historyStore = usePresetHistoryStore.getState();
    const result = pickPreset(
      pool,
      historyStore.playedSet,
      favoritePresets,
      autopilotMode,
      autopilotFavoriteWeight,
    );
    if (!result) return;

    if (result.roundReset) historyStore.resetRound();
    historyStore.markPlayed(result.pick);
    loadPresetWithLazyConvert(renderer, result.pick, transitionTime, () => {
      // On conversion failure, fall back to a random built-in preset
      renderer.nextPreset(mergedBlockedSet, transitionTime);
    });
  }, [
    rendererRef,
    mergedBlockedSet,
    activeCustomPackPresets,
    enabledPacks,
    isInEnabledPack,
    presetPackMap,
    favoritePresets,
    autopilotMode,
    autopilotFavoriteWeight,
    transitionTime,
    loadPresetWithLazyConvert,
  ]);

  const handleNextPreset = useCallback(() => {
    pickNextPreset();
    resetAutopilotRef.current();
  }, [pickNextPreset, resetAutopilotRef]);

  const handlePreviousPreset = useCallback(() => {
    const historyStore = usePresetHistoryStore.getState();
    const overrideSet = new Set(useSettingsStore.getState().excludedOverrides);
    let name = historyStore.goBack();
    // Skip mobile-blocked presets (unless overridden) when navigating back
    if (isMobileDevice) {
      while (name && mobileBlockedSet.has(name) && !overrideSet.has(name)) {
        name = historyStore.goBack();
      }
    }
    if (name) {
      historyStore.markPlayed(name);
      const renderer = rendererRef.current;
      if (renderer) {
        loadPresetWithLazyConvert(renderer, name, transitionTime);
      }
      resetAutopilotRef.current();
    }
  }, [rendererRef, transitionTime, resetAutopilotRef, loadPresetWithLazyConvert]);

  const handleSelectPreset = useCallback(
    (name: string) => {
      usePresetHistoryStore.getState().markPlayed(name);
      const renderer = rendererRef.current;
      if (renderer) {
        loadPresetWithLazyConvert(renderer, name, transitionTime);
      }
      resetAutopilotRef.current();
    },
    [rendererRef, transitionTime, resetAutopilotRef, loadPresetWithLazyConvert],
  );

  const handleToggleFavorite = useCallback(() => {
    if (!currentPreset) return;
    const wasFavorite = useSettingsStore.getState().favoritePresets.includes(currentPreset);
    toggleFavoritePreset(currentPreset);
    useToastStore
      .getState()
      .show(
        wasFavorite
          ? i18n.t('toasts.removedFromFavorites', { ns: 'messages' })
          : i18n.t('toasts.addedToFavorites', { ns: 'messages' }),
      );
  }, [currentPreset, toggleFavoritePreset]);

  const handleToggleBlock = useCallback(() => {
    if (!currentPreset) return;
    const isCurrentlyBlocked = useSettingsStore.getState().blockedPresets.includes(currentPreset);
    toggleBlockPreset(currentPreset);
    useToastStore
      .getState()
      .show(
        isCurrentlyBlocked
          ? i18n.t('toasts.presetUnblocked', { ns: 'messages' })
          : i18n.t('toasts.presetBlocked', { ns: 'messages' }),
      );
    // If we just blocked the current preset, skip to next
    if (!isCurrentlyBlocked) {
      handleNextPreset();
    }
  }, [currentPreset, toggleBlockPreset, handleNextPreset]);

  // Reset autopilot timer and shuffle round when mode changes
  useEffect(() => {
    resetAutopilotRef.current();
    usePresetHistoryStore.getState().resetRound();
  }, [autopilotMode, enabledPacks, activeCustomPackId, resetAutopilotRef]);

  // Auto-disable autopilot when no packs are selected (and no custom pack active)
  useEffect(() => {
    if (enabledPacks.length === 0 && !activeCustomPackId && autopilotEnabled) {
      useSettingsStore.getState().setAutopilotEnabled(false);
    }
  }, [enabledPacks, activeCustomPackId, autopilotEnabled]);

  // If initial preset isn't in an enabled pack, pick one that is.
  // Only runs once — the renderer's init() already filters blocked/quarantined.
  const didFixInitialPreset = useRef(false);
  useEffect(() => {
    if (
      !didFixInitialPreset.current &&
      currentPreset &&
      enabledPacks.length > 0 &&
      presetPackMap.size > 0
    ) {
      didFixInitialPreset.current = true;
      if (!isInEnabledPack(currentPreset)) {
        pickNextPreset();
      }
    }
  }, [currentPreset, enabledPacks, presetPackMap, isInEnabledPack, pickNextPreset]);

  return {
    pickNextPreset,
    handleNextPreset,
    handlePreviousPreset,
    handleSelectPreset,
    handleToggleFavorite,
    handleToggleBlock,
    canGoBack,
    mergedBlockedSet,
    isInEnabledPack,
    blockedPresets,
    favoritePresets,
    enabledPacks,
    activeCustomPackId,
  };
}
