import { useTranslation } from 'react-i18next';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { PresetBrowser } from './PresetBrowser.tsx';
import { MediaPlaylist } from './MediaPlaylist.tsx';
import { MobileControlBar } from './MobileControlBar.tsx';
import { ChevronLeftIcon, ChevronRightIcon, BlockIcon, StarIcon } from './icons.tsx';

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
  isIdle: boolean;
  forceIdle: () => void;
  resetIdle: () => void;
  onPauseIdle: () => void;
  onResumeIdle: () => void;
  presetsLoading?: boolean;
  renderPaused?: boolean;
  onTogglePause?: () => void;
  onUnpause?: () => void;
}

export function ControlBar(props: ControlBarProps) {
  if (isMobileDevice) {
    return (
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
        isIdle={props.isIdle}
        forceIdle={props.forceIdle}
        resetIdle={props.resetIdle}
        presetsLoading={props.presetsLoading}
        onUnpause={props.onUnpause}
      />
    );
  }

  return <DesktopControlBar {...props} />;
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
  isIdle,
  onPauseIdle,
  onResumeIdle,
  presetsLoading,
  renderPaused,
  onTogglePause,
  onUnpause,
}: ControlBarProps) {
  const { t } = useTranslation('messages');
  const { t: tc } = useTranslation('common');
  const { t: ts } = useTranslation('settings');

  return (
    <div
      onMouseEnter={onPauseIdle}
      onMouseLeave={onResumeIdle}
      className={`fixed inset-x-0 bottom-0 z-50 transition-opacity duration-500 ${
        isIdle && activePanel === 'none' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Click-outside backdrop to close panels */}
      {activePanel !== 'none' && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div className="fixed inset-0 z-[-1]" onClick={() => onTogglePanel('none')} />
      )}
      {activePanel !== 'none' && (
        <div
          className={`mx-4 mb-2 overflow-y-auto lg:max-w-lg ${
            activePanel === 'settings'
              ? 'lg:ml-auto'
              : activePanel === 'playlist'
                ? 'lg:mx-auto'
                : 'lg:mr-auto'
          }`}
          style={{ maxHeight: 'calc(100dvh - 56px)' }}
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
          {activePanel === 'playlist' && onAddLocalFiles && onClearPlaylist && (
            <MediaPlaylist
              onAddFiles={onAddLocalFiles}
              onClear={onClearPlaylist}
              onClose={() => onTogglePanel('none')}
            />
          )}
        </div>
      )}

      <div
        role="toolbar"
        aria-label={tc('controls')}
        className="flex items-center justify-between gap-2 bg-black/50 px-4 py-2 backdrop-blur-sm"
      >
        {/* LEFT: Preset Controls */}
        <div className="flex items-center gap-2">
          <BarButton onClick={() => onTogglePanel('presets')} active={activePanel === 'presets'}>
            {tc('presets')}
            {presetsLoading && (
              <svg
                className="ml-1.5 inline-block h-3 w-3 animate-spin text-white/40"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="opacity-25"
                />
                <path
                  d="M4 12a8 8 0 018-8"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </BarButton>

          <IconButton
            onClick={() => onPreviousPreset?.()}
            disabled={!canGoBack}
            aria-label={ts('shortcutActions.previousPreset')}
            title={t('controlBar.previousPreset')}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </IconButton>

          {currentPreset && (
            <div className="flex items-center gap-1 rounded bg-white/5 px-2 py-0.5">
              <button
                onClick={onToggleBlock}
                title={isBlocked ? t('controlBar.unblockPreset') : t('controlBar.blockPreset')}
                aria-label={isBlocked ? t('controlBar.unblockPreset') : t('controlBar.blockPreset')}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
                  isBlocked ? 'text-red-400' : 'text-white/40 hover:bg-white/10 hover:text-red-400'
                }`}
              >
                <BlockIcon className="h-4 w-4" />
              </button>
              <span className="w-56 truncate text-xs text-white/60" title={currentPreset}>
                {currentPreset}
              </span>
              <button
                onClick={onToggleFavorite}
                title={
                  isFavorite ? t('controlBar.removeFromFavorites') : t('controlBar.addToFavorites')
                }
                aria-label={
                  isFavorite ? t('controlBar.removeFromFavorites') : t('controlBar.addToFavorites')
                }
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border-none bg-transparent ${
                  isFavorite
                    ? 'text-yellow-400'
                    : 'text-white/40 hover:bg-white/10 hover:text-yellow-400'
                }`}
              >
                <StarIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          <IconButton
            onClick={onNextPreset}
            aria-label={ts('shortcutActions.nextPreset')}
            title={t('controlBar.nextPreset')}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </IconButton>

          <BarButton
            onClick={onToggleAutopilot}
            active={autopilotEnabled}
            title={t('controlBar.toggleAutopilot')}
            hotkey="A"
          >
            {tc('autopilot')}
          </BarButton>
        </div>

        {/* RIGHT: App Controls */}
        <div className="flex items-center gap-2">
          <BarButton onClick={() => onTogglePanel('settings')} active={activePanel === 'settings'}>
            {tc('settings')}
          </BarButton>
          {onTogglePause && (
            <BarButton
              onClick={onTogglePause}
              active={renderPaused}
              title={renderPaused ? t('controlBar.resumeRendering') : t('controlBar.togglePause')}
              hotkey="V"
            >
              {tc('pause')}
            </BarButton>
          )}
          <BarButton
            onClick={onToggleFullscreen}
            active={isFullscreen}
            title={t('controlBar.toggleFullscreen')}
            hotkey="F"
          >
            {tc('fullscreen')}
          </BarButton>
          <BarButton onClick={onStop}>{tc('exit')}</BarButton>
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
      className={`flex h-7 items-center justify-center rounded border-none px-2 text-xs ${
        disabled
          ? 'cursor-not-allowed bg-white/5 text-white/20'
          : 'cursor-pointer bg-white/10 text-orange-400/70 hover:bg-orange-500/20 hover:text-orange-400'
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}
