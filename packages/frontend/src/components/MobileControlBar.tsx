import { useCallback, useEffect, useState } from 'react';
import { useIdleTimer } from '../hooks/useIdleTimer.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { PresetBrowser } from './PresetBrowser.tsx';
import type { PanelView } from './ControlBar.tsx';
import logoUrl from '../assets/logo.png';

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
  onMenuOpenChange?: (open: boolean) => void;
  onForcePlaybackIdle?: () => void;
  hasPlaybackPanel?: boolean;
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
  onMenuOpenChange,
  onForcePlaybackIdle,
  hasPlaybackPanel,
}: MobileControlBarProps) {
  const { isIdle, forceIdle } = useIdleTimer(5000, 5000);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalPanel, setModalPanel] = useState<PanelView>('none');

  // History management for Android back button
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

  const openMenu = useCallback(() => {
    setMenuOpen(true);
    onMenuOpenChange?.(true);
    pushHistory();
  }, [pushHistory, onMenuOpenChange]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    onMenuOpenChange?.(false);
    popHistory();
  }, [popHistory, onMenuOpenChange]);

  const openModal = useCallback(
    (panel: PanelView) => {
      setModalPanel(panel);
      onTogglePanel(panel);
      onMenuOpenChange?.(true);
      pushHistory();
    },
    [onTogglePanel, pushHistory, onMenuOpenChange],
  );

  const closeModal = useCallback(() => {
    const wasOpen = modalPanel !== 'none';
    setModalPanel('none');
    onTogglePanel('none');
    onMenuOpenChange?.(false);
    if (wasOpen) popHistory();
  }, [modalPanel, onTogglePanel, popHistory, onMenuOpenChange]);

  // Handle browser back button
  useEffect(() => {
    const handlePopState = () => {
      if (historyDepth <= 0) return;
      historyDepth -= 1;

      if (modalPanel !== 'none') {
        setModalPanel('none');
        onTogglePanel('none');
      } else if (menuOpen) {
        setMenuOpen(false);
        onMenuOpenChange?.(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [menuOpen, modalPanel, onTogglePanel, onMenuOpenChange]);

  // Auto-close radial menu after 10s of inactivity (resets on interaction)
  useEffect(() => {
    if (!menuOpen) return;

    let timer: ReturnType<typeof setTimeout>;
    const startTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setMenuOpen(false);
        onMenuOpenChange?.(false);
        while (historyDepth > 0) {
          historyDepth -= 1;
          history.back();
        }
      }, 10_000);
    };

    const resetTimer = () => startTimer();
    startTimer();

    const events = ['touchstart', 'mousemove', 'mousedown'] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [menuOpen, onMenuOpenChange]);

  // Transition from radial menu directly to a modal without dropping mobileMenuOpen.
  // closeMenu() sets mobileMenuOpen(false), which would flash the PlaybackPanel
  // before openModal() sets it back to true. Instead, close the menu visually
  // but keep mobileMenuOpen true, then open the modal.
  const menuToModal = useCallback(
    (panel: PanelView) => {
      setMenuOpen(false);
      popHistory();
      // Don't call onMenuOpenChange(false) — keep it true through the transition
      setTimeout(() => openModal(panel), 50);
    },
    [popHistory, openModal],
  );

  // Radial items clockwise from 12 o'clock:
  // Top half (preset): Previous(10), Block(11), Presets(12), Next(1), Favorite(2)
  // Bottom half (app): Settings(3), Exit(4), Fullscreen(6), Autopilot(8)
  const radialItems = [
    {
      label: 'Presets',
      icon: 'P',
      action: () => menuToModal('presets'),
    },
    {
      label: 'Next',
      icon: '▶',
      action: () => {
        onNextPreset();
        closeMenu();
        forceIdle();
        onForcePlaybackIdle?.();
      },
    },
    {
      label: isFavorite ? 'Unfavorite' : 'Favorite',
      icon: '★',
      action: () => {
        onToggleFavorite();
        closeMenu();
        forceIdle();
        onForcePlaybackIdle?.();
      },
      active: isFavorite,
      activeColor: 'yellow' as const,
    },
    {
      label: 'Settings',
      icon: '⚙',
      action: () => menuToModal('settings'),
    },
    {
      label: 'Exit',
      icon: '✕',
      action: () => {
        onStop();
        closeMenu();
      },
    },
    {
      label: isFullscreen ? 'Exit FS' : 'Fullscreen',
      icon: '⛶',
      action: () => {
        onToggleFullscreen();
        closeMenu();
        forceIdle();
        onForcePlaybackIdle?.();
      },
      active: isFullscreen,
    },
    {
      label: 'Autopilot',
      icon: 'A',
      action: () => {
        onToggleAutopilot();
        closeMenu();
        forceIdle();
        onForcePlaybackIdle?.();
      },
      active: autopilotEnabled,
    },
    {
      label: isBlocked ? 'Unblock' : 'Block',
      icon: '⊘',
      action: () => {
        onToggleBlock();
        closeMenu();
        forceIdle();
        onForcePlaybackIdle?.();
      },
      active: isBlocked,
      activeColor: 'red' as const,
    },
    {
      label: 'Previous',
      icon: '◀',
      action: () => {
        onPreviousPreset?.();
        closeMenu();
        forceIdle();
        onForcePlaybackIdle?.();
      },
      disabled: !canGoBack,
    },
  ];

  // Radial layout: 360° circle, items evenly spaced starting from top (90°) going clockwise
  const itemCount = radialItems.length;
  const radius = 110;

  // FAB size (px) — used for centering items relative to hub
  const fabSize = 56; // h-14 w-14
  const itemSize = 44; // h-11 w-11
  const itemOffset = (fabSize - itemSize) / 2;

  return (
    <div className="md:hidden">
      {/* Backdrop overlay when menu is open */}
      {menuOpen && <div className="fixed inset-0 z-[54] bg-black/30" onClick={closeMenu} />}

      {/* FAB hub — slides from bottom-right to center when open */}
      <div
        className="fixed z-[55] transition-all duration-400"
        style={{
          bottom: menuOpen ? `calc(50% - ${fabSize / 2}px)` : hasPlaybackPanel ? '110px' : '16px',
          right: menuOpen ? `calc(50% - ${fabSize / 2}px)` : '16px',
        }}
      >
        {/* Radial menu items (positioned relative to FAB center) */}
        {radialItems.map((item, i) => {
          // 360° circle starting at 90° (top), going clockwise
          const angle = 90 - (i * 360) / itemCount;
          const rad = (angle * Math.PI) / 180;
          const dx = Math.cos(rad) * radius;
          const dy = Math.sin(rad) * radius;

          return (
            <button
              key={item.label}
              onClick={item.action}
              disabled={item.disabled}
              aria-label={item.label}
              title={item.label}
              className={`absolute z-[56] flex h-11 w-11 items-center justify-center rounded-full border-none text-sm shadow-lg transition-all ${
                menuOpen
                  ? 'pointer-events-auto scale-100 opacity-100'
                  : 'pointer-events-none scale-50 opacity-0'
              } ${
                item.disabled
                  ? 'cursor-not-allowed bg-white/5 text-white/20'
                  : item.active
                    ? `cursor-pointer ${
                        item.activeColor === 'yellow'
                          ? 'bg-yellow-500/30 text-yellow-400'
                          : item.activeColor === 'red'
                            ? 'bg-red-500/30 text-red-400'
                            : 'bg-orange-500 text-white'
                      }`
                    : 'cursor-pointer bg-white/15 text-white/80 backdrop-blur-sm'
              }`}
              style={{
                // Position relative to FAB center: cos→horizontal, sin→vertical
                bottom: `${dy + itemOffset}px`,
                left: `${dx + itemOffset}px`,
                transitionDelay: menuOpen ? `${i * 40}ms` : '0ms',
                transitionDuration: '250ms',
              }}
            >
              {item.icon}
            </button>
          );
        })}

        {/* FAB button */}
        <button
          onClick={menuOpen ? closeMenu : openMenu}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className={`relative flex h-14 w-14 items-center justify-center rounded-full border-none bg-black/60 shadow-lg backdrop-blur-sm transition-all duration-400 ${
            menuOpen
              ? 'rotate-45 opacity-100'
              : isIdle
                ? 'pointer-events-none opacity-0'
                : 'opacity-100'
          } cursor-pointer`}
        >
          <img src={logoUrl} alt="Menu" className="h-[52px] w-[52px] object-contain" />
        </button>
      </div>

      {/* Modal panels */}
      {modalPanel !== 'none' && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative mx-2 my-2 flex max-h-full w-full flex-col overflow-hidden rounded-lg bg-gray-900/95 landscape:my-1">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 landscape:py-1.5">
              <h3 className="text-sm font-semibold text-white">
                {activePanel === 'settings' && 'Settings'}
                {activePanel === 'presets' && 'Presets'}
                {activePanel === 'playlist' && 'Queue'}
              </h3>
              <button
                onClick={closeModal}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-white/10 text-sm text-white/70 hover:bg-white/20"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 landscape:p-2">
              {activePanel === 'settings' && <SettingsPanel />}
              {activePanel === 'presets' && (
                <PresetBrowser
                  presetList={presetList}
                  presetPackMap={presetPackMap}
                  currentPreset={currentPreset}
                  onSelectPreset={onSelectPreset}
                  onNextPreset={onNextPreset}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
