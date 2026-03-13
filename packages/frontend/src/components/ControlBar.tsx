import { useIdleTimer } from '../hooks/useIdleTimer.ts';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { PresetBrowser } from './PresetBrowser.tsx';
import { MediaPlaylist } from './MediaPlaylist.tsx';
import { MobileControlBar } from './MobileControlBar.tsx';

export type PanelView = 'none' | 'settings' | 'presets' | 'playlist';

interface ControlBarProps {
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
  onAddLocalFiles?: (files: File[]) => void;
  onClearPlaylist?: () => void;
  onMobileMenuChange?: (open: boolean) => void;
  onForcePlaybackIdle?: () => void;
  hasPlaybackPanel?: boolean;
}

export function ControlBar(props: ControlBarProps) {
  return (
    <>
      <DesktopControlBar {...props} />
      <MobileControlBar
        onNextPreset={props.onNextPreset}
        onPreviousPreset={props.onPreviousPreset}
        canGoBack={props.canGoBack}
        onSelectPreset={props.onSelectPreset}
        onStop={props.onStop}
        onToggleFullscreen={props.onToggleFullscreen}
        isFullscreen={props.isFullscreen}
        presetList={props.presetList}
        presetPackMap={props.presetPackMap}
        currentPreset={props.currentPreset}
        autopilotEnabled={props.autopilotEnabled}
        onToggleAutopilot={props.onToggleAutopilot}
        activePanel={props.activePanel}
        onTogglePanel={props.onTogglePanel}
        isFavorite={props.isFavorite}
        isBlocked={props.isBlocked}
        onToggleFavorite={props.onToggleFavorite}
        onToggleBlock={props.onToggleBlock}
        onMenuOpenChange={props.onMobileMenuChange}
        onForcePlaybackIdle={props.onForcePlaybackIdle}
        hasPlaybackPanel={props.hasPlaybackPanel}
      />
    </>
  );
}

function DesktopControlBar({
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
  onAddLocalFiles,
  onClearPlaylist,
}: ControlBarProps) {
  const { isIdle, pause, resume } = useIdleTimer(3000, 5000);

  return (
    <div
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={`fixed inset-x-0 bottom-0 z-50 hidden transition-opacity duration-500 md:block ${
        isIdle && activePanel === 'none' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Click-outside backdrop to close panels */}
      {activePanel !== 'none' && (
        <div className="fixed inset-0 z-[-1]" onClick={() => onTogglePanel('none')} />
      )}
      {activePanel !== 'none' && (
        <div
          className={`mx-4 mb-2 lg:max-w-lg ${
            activePanel === 'settings'
              ? 'lg:ml-auto'
              : activePanel === 'playlist'
                ? 'lg:mx-auto'
                : 'lg:mr-auto'
          }`}
        >
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
            <MediaPlaylist
              onAddFiles={onAddLocalFiles}
              onClear={onClearPlaylist}
              onClose={() => onTogglePanel('none')}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 bg-black/50 px-4 py-2 backdrop-blur-sm">
        {/* LEFT: Preset Controls */}
        <div className="flex items-center gap-2">
          <BarButton onClick={() => onTogglePanel('presets')} active={activePanel === 'presets'}>
            Presets
          </BarButton>

          <IconButton
            onClick={() => onPreviousPreset?.()}
            disabled={!canGoBack}
            aria-label="Previous preset"
            title="Previous preset (P)"
          >
            ◀
          </IconButton>

          {currentPreset && (
            <div className="flex items-center gap-1 rounded bg-white/5 px-2 py-0.5">
              <button
                onClick={onToggleBlock}
                title={isBlocked ? 'Unblock preset (B)' : 'Block preset (B)'}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
                  isBlocked ? 'text-red-400' : 'text-white/30 hover:bg-white/10 hover:text-red-400'
                }`}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <circle cx="10" cy="10" r="8" />
                  <line x1="5" y1="5" x2="15" y2="15" />
                </svg>
              </button>
              <span className="w-56 truncate text-xs text-white/60" title={currentPreset}>
                {currentPreset}
              </span>
              <button
                onClick={onToggleFavorite}
                title={isFavorite ? 'Remove from favorites (S)' : 'Add to favorites (S)'}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
                  isFavorite
                    ? 'text-yellow-400'
                    : 'text-white/30 hover:bg-white/10 hover:text-yellow-400'
                }`}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            </div>
          )}

          <IconButton onClick={onNextPreset} aria-label="Next preset" title="Next preset (N)">
            ▶
          </IconButton>

          <BarButton
            onClick={onToggleAutopilot}
            active={autopilotEnabled}
            title="Toggle autopilot (A)"
            hotkey="A"
          >
            Autopilot
          </BarButton>
        </div>

        {/* RIGHT: App Controls */}
        <div className="flex items-center gap-2">
          <BarButton onClick={() => onTogglePanel('settings')} active={activePanel === 'settings'}>
            Settings
          </BarButton>
          <BarButton
            onClick={onToggleFullscreen}
            active={isFullscreen}
            title="Toggle fullscreen (F)"
            hotkey="F"
          >
            Fullscreen
          </BarButton>
          <BarButton onClick={onStop}>Exit</BarButton>
        </div>
      </div>
    </div>
  );
}

function BarButton({
  onClick,
  active = false,
  title,
  hotkey,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  hotkey?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`cursor-pointer rounded border-none px-3 py-1.5 text-xs font-medium ${
        active ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
      }`}
    >
      {children}
      {hotkey && !isMobileDevice && (
        <kbd className="ml-1.5 rounded bg-white/10 px-1 py-0.5 font-mono text-[10px] text-white/40">
          {hotkey}
        </kbd>
      )}
    </button>
  );
}

function IconButton({
  onClick,
  disabled = false,
  children,
  ...rest
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  'aria-label': string;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded border-none px-2 py-1.5 text-xs ${
        disabled
          ? 'cursor-not-allowed bg-white/5 text-white/20'
          : 'cursor-pointer bg-white/10 text-white/80 hover:bg-white/20'
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}
