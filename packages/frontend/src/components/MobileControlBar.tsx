import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { PresetBrowser } from './PresetBrowser.tsx';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import type { PanelView } from './ControlBar.tsx';

// Module-level counter (not a ref) to avoid React Compiler refs-during-render lint
let historyDepth = 0;

interface MobileControlBarProps {
  onNextPreset: () => void;
  onPreviousPreset?: () => void;
  canGoBack: boolean;
  onSelectPreset: (name: string) => void;
  onStop: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  presetList: string[];
  presetPackMap: Map<string, string>;
  currentPreset: string;
  autopilotEnabled: boolean;
  onToggleAutopilot: () => void;
  activePanel: PanelView;
  onTogglePanel: (panel: PanelView) => void;
  isFavorite: boolean;
  isBlocked: boolean;
  onToggleFavorite: () => void;
  onToggleBlock: () => void;
  isIdle: boolean;
  forceIdle: () => void;
  resetIdle: () => void;
  presetsLoading?: boolean;
  onUnpause?: () => void;
}

// Circular layout: 9 items evenly spaced around a 360° circle.
// Starting at 90° (top) going clockwise, same as original radial.
const ITEM_COUNT = 9;
const ITEM_SIZE = 44; // h-11 w-11

function circlePosition(index: number, radiusX: number, radiusY: number): { x: number; y: number } {
  const angle = 90 - (index * 360) / ITEM_COUNT;
  const rad = (angle * Math.PI) / 180;
  return {
    x: Math.cos(rad) * radiusX,
    y: Math.sin(rad) * radiusY,
  };
}

export function MobileControlBar({
  onNextPreset,
  onPreviousPreset,
  canGoBack,
  onSelectPreset,
  onStop,
  onToggleFullscreen,
  isFullscreen,
  presetList,
  presetPackMap,
  currentPreset,
  autopilotEnabled,
  onToggleAutopilot,
  activePanel,
  onTogglePanel,
  isFavorite,
  isBlocked,
  onToggleFavorite,
  onToggleBlock,
  isIdle,
  forceIdle,
  resetIdle,
  presetsLoading,
  onUnpause,
}: MobileControlBarProps) {
  const { t } = useTranslation('messages');
  const { t: tc } = useTranslation('common');

  // Responsive layout: smaller circle in landscape to fit within reduced viewport height.
  // Using matchMedia instead of window.innerHeight to avoid layout thrashing.
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(orientation: landscape)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(orientation: landscape)');
    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Landscape: wider ellipse shifted up to clear the PlaybackPanel
  const circleRadiusX = isLandscape ? 150 : 110;
  const circleRadiusY = isLandscape ? 80 : 110;

  // "Just revealed" guard: after controls appear, block button clicks for 400ms so the
  // touch that revealed controls doesn't accidentally trigger a button action.
  const [justRevealed, setJustRevealed] = useState(false);
  const justRevealedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleReveal = useCallback(() => {
    resetIdle();
    setJustRevealed(true);
    if (justRevealedTimer.current) clearTimeout(justRevealedTimer.current);
    justRevealedTimer.current = setTimeout(() => setJustRevealed(false), 400);
  }, [resetIdle]);
  useEffect(
    () => () => {
      if (justRevealedTimer.current) clearTimeout(justRevealedTimer.current);
    },
    [],
  );

  const activeCustomPackId = useSettingsStore((s) => s.activeCustomPackId);
  const customPacks = useSettingsStore((s) => s.customPacks);
  const activePackName = useMemo(
    () => customPacks.find((p) => p.id === activeCustomPackId)?.name ?? null,
    [customPacks, activeCustomPackId],
  );

  const [modalPanel, setModalPanel] = useState<PanelView>('none');

  // History management for Android back button (modals only)
  const pushHistory = useCallback(() => {
    historyDepth += 1;
    history.pushState({ mobileUI: historyDepth }, '');
  }, []);

  const popHistory = useCallback(() => {
    if (historyDepth > 0) {
      historyDepth -= 1;
      history.back();
    }
  }, []);

  const closeModal = useCallback(() => {
    const wasOpen = modalPanel !== 'none';
    setModalPanel('none');
    onTogglePanel('none');
    if (wasOpen) popHistory();
  }, [modalPanel, onTogglePanel, popHistory]);

  // Handle browser back button
  useEffect(() => {
    const handlePopState = () => {
      if (historyDepth <= 0) return;
      historyDepth -= 1;

      if (modalPanel !== 'none') {
        setModalPanel('none');
        onTogglePanel('none');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [modalPanel, onTogglePanel]);

  // Open a modal panel (push history entry for back button)
  const openModal = useCallback(
    (panel: PanelView) => {
      setModalPanel(panel);
      onTogglePanel(panel);
      pushHistory();
    },
    [onTogglePanel, pushHistory],
  );

  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, modalPanel !== 'none');

  // Circle items clockwise from top:
  // Presets (12), Next (1:20), Favorite (2:40), Settings (4), Exit (5:20), Fullscreen (6:40), Autopilot (8), Block (9:20), Previous (10:40)
  const circleItems = [
    {
      label: tc('presets'),
      icon: presetsLoading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            className="opacity-25"
          />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        'P'
      ),
      action: () => openModal('presets'),
    },
    {
      label: t('mobile.next'),
      icon: '▶',
      action: () => {
        onNextPreset();
        resetIdle();
      },
    },
    {
      label: isFavorite ? t('mobile.unfavorite') : t('mobile.favorite'),
      icon: '★',
      action: () => {
        onToggleFavorite();
        resetIdle();
      },
      active: isFavorite,
      activeColor: 'yellow' as const,
    },
    {
      label: tc('settings'),
      icon: '⚙',
      action: () => openModal('settings'),
    },
    {
      label: tc('exit'),
      icon: '✕',
      action: onStop,
    },
    {
      label: isFullscreen ? t('controlBar.exitFS') : tc('fullscreen'),
      icon: '⛶',
      action: () => {
        onToggleFullscreen();
        resetIdle();
      },
      active: isFullscreen,
    },
    {
      label: tc('autopilot'),
      icon: 'A',
      action: () => {
        onToggleAutopilot();
        resetIdle();
      },
      active: autopilotEnabled,
    },
    {
      label: isBlocked ? t('mobile.unblock') : t('mobile.block'),
      icon: '⊘',
      action: () => {
        onToggleBlock();
        resetIdle();
      },
      active: isBlocked,
      activeColor: 'red' as const,
    },
    {
      label: tc('previous'),
      icon: '◀',
      action: () => {
        onPreviousPreset?.();
        resetIdle();
      },
      disabled: !canGoBack,
    },
  ];

  return (
    <div>
      {/* Transparent overlay — toggles controls on tap.
          Always present (except when modal open) to intercept taps before they reach buttons.
          When idle: tap reveals controls (with justRevealed guard preventing accidental button clicks).
          When visible: tap hides controls via forceIdle. On mobile, useIdleTimer's window
          listeners are suppressed (suppressEvents), so this overlay is the sole input handler. */}
      {modalPanel === 'none' && (
        <div
          role="presentation"
          className="fixed inset-0 z-[47]"
          onClick={isIdle ? handleReveal : forceIdle}
        />
      )}

      {/* Circular action buttons — centered on screen, fade with idle state (matches PlaybackPanel) */}
      <div
        data-testid="mobile-circle"
        className={`pointer-events-none fixed left-1/2 z-[55] transition-opacity duration-500 ${isIdle ? 'opacity-0' : 'opacity-100'}`}
        style={{ top: isLandscape ? '40%' : '50%', transform: 'translate(-50%, -50%)' }}
      >
        {circleItems.map((item, i) => {
          const { x, y } = circlePosition(i, circleRadiusX, circleRadiusY);

          return (
            <div
              key={item.label}
              className={`absolute flex flex-col items-center ${isIdle || justRevealed ? 'pointer-events-none' : 'pointer-events-auto'}`}
              style={{
                left: `${x - ITEM_SIZE / 2}px`,
                bottom: `${y - ITEM_SIZE / 2}px`,
              }}
            >
              <button
                onClick={item.action}
                disabled={item.disabled}
                aria-label={item.label}
                className={`flex h-11 w-11 items-center justify-center rounded-full border-none text-sm shadow-[0_0_10px_rgba(0,0,0,0.5)] ${
                  item.disabled
                    ? 'cursor-not-allowed bg-gray-900/90 text-white/20'
                    : item.active
                      ? `cursor-pointer ${
                          item.activeColor === 'yellow'
                            ? 'bg-yellow-900/80 text-yellow-400'
                            : item.activeColor === 'red'
                              ? 'bg-red-900/80 text-red-400'
                              : 'bg-orange-500 text-white'
                        }`
                      : 'cursor-pointer bg-gray-900/90 text-white/80'
                }`}
              >
                {item.icon}
              </button>
              <span
                className={`mt-0.5 max-w-16 truncate rounded-sm bg-gray-900/90 px-1 text-center text-[10px] leading-tight ${
                  item.disabled ? 'text-white/20' : 'text-white/80'
                }`}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Modal panels */}
      {modalPanel !== 'none' && (
        <div className="fixed inset-0 z-[60] flex animate-fade-in items-stretch justify-center bg-black/50 backdrop-blur-sm">
          <div
            ref={modalRef}
            role="dialog"
            aria-label={
              activePanel === 'settings'
                ? tc('settings')
                : activePanel === 'presets'
                  ? tc('presets')
                  : tc('queue')
            }
            className="relative mx-2 my-2 flex max-h-full w-full flex-col overflow-hidden rounded-lg bg-gray-900/95 landscape:my-1"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3 landscape:py-1.5">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">
                  {activePanel === 'settings' && tc('settings')}
                  {activePanel === 'presets' && tc('presets')}
                  {activePanel === 'playlist' && tc('queue')}
                </h3>
                {activePanel === 'presets' && activePackName && (
                  <div className="flex items-center gap-1.5">
                    <p className="min-w-0 truncate text-[10px] text-orange-400/60" data-ph-mask>
                      {t('customPacks.packActive', { name: activePackName })}
                    </p>
                    <button
                      onClick={() => useSettingsStore.getState().setActiveCustomPackId(null)}
                      className="shrink-0 cursor-pointer rounded-full border-none bg-red-500/80 px-2 py-0.5 text-[9px] font-semibold text-white hover:bg-red-500"
                      aria-label={t('customPacks.deactivatePack')}
                    >
                      {t('customPacks.deactivate')}
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={closeModal}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-white/10 text-sm text-white/70 hover:bg-white/20"
                aria-label={tc('close')}
              >
                ✕
              </button>
            </div>
            <div
              className={`flex flex-1 flex-col p-3 landscape:p-2 ${activePanel === 'presets' ? 'overflow-hidden' : 'overflow-y-auto'}`}
            >
              {activePanel === 'settings' && <SettingsPanel />}
              {activePanel === 'presets' && (
                <PresetBrowser
                  presetList={presetList}
                  presetPackMap={presetPackMap}
                  currentPreset={currentPreset}
                  onSelectPreset={onSelectPreset}
                  onNextPreset={onNextPreset}
                  onUnpause={onUnpause}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
