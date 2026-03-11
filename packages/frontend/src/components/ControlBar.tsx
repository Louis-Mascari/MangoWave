import { useIdleTimer } from '../hooks/useIdleTimer.ts';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { PresetBrowser } from './PresetBrowser.tsx';
import { PlaybackControls } from './PlaybackControls.tsx';
import type { PlaybackAdapter } from './PlaybackControls.tsx';
import { MediaPlaylist } from './MediaPlaylist.tsx';
import { LocalSeekBar } from './LocalSeekBar.tsx';
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
  onToggleNowPlaying: () => void;
  showNowPlaying: boolean;
  presetList: string[];
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
  onSeek?: (time: number) => void;
  onVolumeChange?: (volume: number) => void;
  volume?: number;
  isMuted?: boolean;
  onToggleMute?: () => void;
  playbackAdapter: PlaybackAdapter;
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
        currentPreset={props.currentPreset}
        autopilotEnabled={props.autopilotEnabled}
        onToggleAutopilot={props.onToggleAutopilot}
        activePanel={props.activePanel}
        onTogglePanel={props.onTogglePanel}
        onAddLocalFiles={props.onAddLocalFiles}
        onClearPlaylist={props.onClearPlaylist}
        onSeek={props.onSeek}
        onVolumeChange={props.onVolumeChange}
        volume={props.volume}
        isMuted={props.isMuted}
        onToggleMute={props.onToggleMute}
        playbackAdapter={props.playbackAdapter}
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
  onToggleNowPlaying,
  showNowPlaying,
  presetList,
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
  onSeek,
  onVolumeChange,
  volume,
  isMuted,
  onToggleMute,
  playbackAdapter,
}: ControlBarProps) {
  const isIdle = useIdleTimer(3000, 5000);
  const isSpotifyConnected = !!useSpotifyStore((s) => s.accessToken);
  const isLocalSource = playbackAdapter.source === 'local';
  const hasPlaybackControls =
    playbackAdapter.source === 'local' || playbackAdapter.source === 'spotify';

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 hidden transition-opacity duration-500 md:block ${
        isIdle && activePanel === 'none' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {activePanel !== 'none' && (
        <div
          className={`mx-4 mb-2 lg:max-w-[30%] ${
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
              currentPreset={currentPreset}
              onSelectPreset={onSelectPreset}
              onNextPreset={onNextPreset}
            />
          )}
          {activePanel === 'playlist' && onAddLocalFiles && onClearPlaylist && (
            <MediaPlaylist onAddFiles={onAddLocalFiles} onClear={onClearPlaylist} />
          )}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-black/50 px-4 py-2 backdrop-blur-sm">
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
            <>
              <span className="w-56 truncate text-xs text-white/60" title={currentPreset}>
                {currentPreset}
              </span>
              <button
                onClick={onToggleFavorite}
                title={isFavorite ? 'Remove from favorites (S)' : 'Add to favorites (S)'}
                className="cursor-pointer rounded border-none bg-transparent px-1.5 py-1 text-sm hover:bg-white/10"
              >
                {isFavorite ? (
                  <span className="text-yellow-400">&#9733;</span>
                ) : (
                  <span className="text-white/40">&#9734;</span>
                )}
              </button>
              <button
                onClick={onToggleBlock}
                title={isBlocked ? 'Unblock preset (B)' : 'Block preset (B)'}
                className="cursor-pointer rounded border-none bg-transparent px-1.5 py-1 text-sm hover:bg-white/10"
              >
                {isBlocked ? (
                  <span className="text-red-400">&#8856;</span>
                ) : (
                  <span className="text-white/40">&#8856;</span>
                )}
              </button>
            </>
          )}

          <IconButton onClick={onNextPreset} aria-label="Next preset" title="Next preset (N)">
            ▶
          </IconButton>

          <BarButton
            onClick={onToggleAutopilot}
            active={autopilotEnabled}
            title="Toggle autopilot (A)"
          >
            Autopilot
          </BarButton>
        </div>

        {/* CENTER: Media (only when there's a controllable source) */}
        <div className="flex items-center justify-center gap-2">
          {hasPlaybackControls && (
            <>
              <PlaybackControls adapter={playbackAdapter} />
              {onSeek && onVolumeChange != null && volume != null && onToggleMute != null && (
                <LocalSeekBar
                  onSeek={onSeek}
                  onVolumeChange={onVolumeChange}
                  volume={volume}
                  isMuted={isMuted ?? false}
                  onToggleMute={onToggleMute}
                />
              )}
              {isSpotifyConnected && (
                <BarButton onClick={onToggleNowPlaying} active={showNowPlaying}>
                  Now Playing
                </BarButton>
              )}
              {isLocalSource && (
                <BarButton
                  onClick={() => onTogglePanel('playlist')}
                  active={activePanel === 'playlist'}
                  title="Toggle queue (Q)"
                >
                  Queue
                </BarButton>
              )}
            </>
          )}
        </div>

        {/* RIGHT: App Controls */}
        <div className="flex items-center justify-end gap-2">
          <BarButton onClick={() => onTogglePanel('settings')} active={activePanel === 'settings'}>
            Settings
          </BarButton>
          <BarButton
            onClick={onToggleFullscreen}
            active={isFullscreen}
            title="Toggle fullscreen (F)"
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
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
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
