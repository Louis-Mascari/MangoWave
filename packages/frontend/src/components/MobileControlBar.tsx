import { useCallback, useEffect, useState } from 'react';
import { useIdleTimer } from '../hooks/useIdleTimer.ts';
import { useMediaPlayerStore } from '../store/useMediaPlayerStore.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { PresetBrowser } from './PresetBrowser.tsx';
import { MediaPlaylist } from './MediaPlaylist.tsx';
import type { PanelView } from './ControlBar.tsx';
import type { PlaybackAdapter } from './PlaybackControls.tsx';
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
  onAddLocalFiles?: (files: File[]) => void;
  onClearPlaylist?: () => void;
  onSeek?: (time: number) => void;
  onVolumeChange?: (volume: number) => void;
  volume?: number;
  isMuted?: boolean;
  onToggleMute?: () => void;
  playbackAdapter: PlaybackAdapter;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function MobileSeekBar({
  onSeek,
  playbackAdapter,
}: {
  onSeek: (time: number) => void;
  playbackAdapter: PlaybackAdapter;
}) {
  const currentTime = useMediaPlayerStore((s) => s.currentTime);
  const duration = useMediaPlayerStore((s) => s.duration);

  if (!duration || duration <= 0) return null;

  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-black/60 px-3 py-2 backdrop-blur-sm">
      {/* Seek bar row */}
      <div className="flex w-full items-center gap-1.5">
        <span className="text-[10px] tabular-nums text-white/50">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="seek-bar h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-orange-500"
          aria-label="Seek"
        />
        <span className="text-[10px] tabular-nums text-white/50">{formatTime(duration)}</span>
      </div>
      {/* Transport controls row */}
      <div className="flex items-center gap-3">
        {playbackAdapter.onToggleShuffle != null && (
          <button
            onClick={playbackAdapter.onToggleShuffle}
            className={`border-none bg-transparent p-0 text-sm ${
              playbackAdapter.shuffle ? 'text-orange-400' : 'text-white/40'
            }`}
            aria-label={playbackAdapter.shuffle ? 'Disable shuffle' : 'Enable shuffle'}
          >
            🔀
          </button>
        )}
        <button
          onClick={playbackAdapter.onPrevious}
          disabled={!playbackAdapter.canControl}
          className="border-none bg-transparent p-0 text-sm text-white/70"
          aria-label="Previous track"
        >
          ⏮
        </button>
        <button
          onClick={playbackAdapter.isPlaying ? playbackAdapter.onPause : playbackAdapter.onPlay}
          disabled={!playbackAdapter.canControl}
          className="flex h-9 w-9 items-center justify-center rounded-full border-none bg-white/15 text-base text-white"
          aria-label={playbackAdapter.isPlaying ? 'Pause' : 'Play'}
        >
          {playbackAdapter.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={playbackAdapter.onNext}
          disabled={!playbackAdapter.canControl}
          className="border-none bg-transparent p-0 text-sm text-white/70"
          aria-label="Next track"
        >
          ⏭
        </button>
        {playbackAdapter.onCycleRepeat != null && (
          <button
            onClick={playbackAdapter.onCycleRepeat}
            className={`border-none bg-transparent p-0 text-sm ${
              playbackAdapter.repeatMode !== 'off' ? 'text-orange-400' : 'text-white/40'
            }`}
            aria-label={
              playbackAdapter.repeatMode === 'one'
                ? 'Repeat one'
                : playbackAdapter.repeatMode === 'all'
                  ? 'Repeat all'
                  : 'Repeat off'
            }
          >
            {playbackAdapter.repeatMode === 'one' ? '🔂' : '🔁'}
          </button>
        )}
      </div>
    </div>
  );
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
  onAddLocalFiles,
  onClearPlaylist,
  onSeek,
  playbackAdapter,
}: MobileControlBarProps) {
  const isIdle = useIdleTimer(3000, 5000);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalPanel, setModalPanel] = useState<PanelView>('none');
  const isLocalSource = playbackAdapter.source === 'local';

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
    pushHistory();
  }, [pushHistory]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    popHistory();
  }, [popHistory]);

  const openModal = useCallback(
    (panel: PanelView) => {
      setModalPanel(panel);
      onTogglePanel(panel);
      pushHistory();
    },
    [onTogglePanel, pushHistory],
  );

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
      } else if (menuOpen) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [menuOpen, modalPanel, onTogglePanel]);

  // Auto-close radial menu after 10s of inactivity (resets on interaction)
  useEffect(() => {
    if (!menuOpen) return;

    let timer: ReturnType<typeof setTimeout>;
    const startTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setMenuOpen(false);
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
  }, [menuOpen]);

  const radialItems = [
    {
      label: 'Previous',
      icon: '◀',
      action: () => {
        onPreviousPreset?.();
        closeMenu();
      },
      disabled: !canGoBack,
    },
    {
      label: 'Next',
      icon: '▶',
      action: () => {
        onNextPreset();
        closeMenu();
      },
    },
    {
      label: 'Autopilot',
      icon: 'A',
      action: () => {
        onToggleAutopilot();
        closeMenu();
      },
      active: autopilotEnabled,
    },
    {
      label: 'Presets',
      icon: '☰',
      action: () => {
        closeMenu();
        setTimeout(() => openModal('presets'), 50);
      },
    },
    {
      label: 'Settings',
      icon: '⚙',
      action: () => {
        closeMenu();
        setTimeout(() => openModal('settings'), 50);
      },
    },
    {
      label: isFullscreen ? 'Exit FS' : 'Fullscreen',
      icon: '⛶',
      action: () => {
        onToggleFullscreen();
        closeMenu();
      },
      active: isFullscreen,
    },
    {
      label: 'Exit',
      icon: '✕',
      action: () => {
        onStop();
        closeMenu();
      },
    },
    ...(isLocalSource
      ? [
          {
            label: 'Queue',
            icon: '📋',
            action: () => {
              closeMenu();
              setTimeout(() => openModal('playlist'), 50);
            },
          },
        ]
      : []),
  ];

  // Radial layout: items fan out in a 140° arc above the centered FAB
  const itemCount = radialItems.length;
  const radius = 130;
  // Standard math angles: 0°=right, 90°=up, 180°=left
  // CSS mapping: positive sin → positive `bottom` (upward), positive cos → positive `right` (leftward)
  // Arc from 20° (upper-right) to 160° (upper-left) gives a wide symmetric spread above the FAB
  const startAngle = 20;
  const endAngle = 160;

  // FAB size (px) — used for centering items relative to hub
  const fabSize = 56; // h-14 w-14
  const itemSize = 44; // h-11 w-11
  const itemOffset = (fabSize - itemSize) / 2;

  return (
    <div className="md:hidden">
      {/* Mobile seek bar (local files only, hidden when radial menu open) */}
      {isLocalSource && onSeek && !menuOpen && (
        <div
          className={`fixed bottom-20 left-4 right-4 z-50 flex justify-center transition-opacity duration-500 ${
            isIdle ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <MobileSeekBar onSeek={onSeek} playbackAdapter={playbackAdapter} />
        </div>
      )}

      {/* Backdrop overlay when menu is open */}
      {menuOpen && <div className="fixed inset-0 z-[54] bg-black/30" onClick={closeMenu} />}

      {/* FAB hub — slides from bottom-right to bottom-center when open */}
      <div
        className="fixed z-[55] transition-all duration-400"
        style={{
          bottom: '16px',
          right: menuOpen ? `calc(50% - ${fabSize / 2}px)` : '16px',
        }}
      >
        {/* Radial menu items (positioned relative to FAB center) */}
        {radialItems.map((item, i) => {
          const angle = startAngle + (i * (endAngle - startAngle)) / (itemCount - 1);
          const rad = (angle * Math.PI) / 180;
          // x/y offsets from FAB center
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
                    ? 'cursor-pointer bg-orange-500 text-white'
                    : 'cursor-pointer bg-white/15 text-white/80 backdrop-blur-sm'
              }`}
              style={{
                // Position relative to FAB's top-left corner, centered on FAB center
                bottom: `${dy + itemOffset}px`,
                right: `${dx + itemOffset}px`,
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
          <img src={logoUrl} alt="Menu" className="h-8 w-8 object-contain" />
        </button>
      </div>

      {/* Modal panels */}
      {modalPanel !== 'none' && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative mx-2 my-2 flex max-h-full w-full flex-col overflow-hidden rounded-lg bg-gray-900/95">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
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
            <div className="flex-1 overflow-y-auto p-3">
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
              {activePanel === 'playlist' && onAddLocalFiles && onClearPlaylist && (
                <MediaPlaylist onAddFiles={onAddLocalFiles} onClear={onClearPlaylist} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
