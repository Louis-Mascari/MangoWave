import { useIdleTimer } from '../hooks/useIdleTimer.ts';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { buildSpotifyAuthUrl } from '../services/spotifyApi.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { PresetBrowser } from './PresetBrowser.tsx';
import { PlaybackControls } from './PlaybackControls.tsx';
import type { PlaybackAdapter } from './PlaybackControls.tsx';
import { MediaPlaylist } from './MediaPlaylist.tsx';
import { LocalSeekBar } from './LocalSeekBar.tsx';
import { useMediaPlayerStore } from '../store/useMediaPlayerStore.ts';

export type PanelView = 'none' | 'settings' | 'presets' | 'playlist';

interface ControlBarProps {
  onNextPreset: () => void;
  onSelectPreset: (name: string) => void;
  onStop: () => void;
  onToggleFullscreen: () => void;
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
  playbackAdapter: PlaybackAdapter;
}

export function ControlBar({
  onNextPreset,
  onSelectPreset,
  onStop,
  onToggleFullscreen,
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
  playbackAdapter,
}: ControlBarProps) {
  const isIdle = useIdleTimer(3000, 5000);
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const user = useSpotifyStore((s) => s.user);
  const logout = useSpotifyStore((s) => s.logout);
  const getAuthMode = useSpotifyStore((s) => s.getAuthMode);

  const isSpotifyConnected = !!accessToken;
  const authMode = getAuthMode();
  const hasLocalTracks = useMediaPlayerStore((s) => s.tracks.length > 0);

  const handleSpotifyConnect = () => {
    const url = buildSpotifyAuthUrl();
    const popup = window.open(url, 'spotify-auth', 'popup,width=500,height=700');
    if (!popup || popup.closed) {
      // Popup blocked — fall back to confirm + redirect
      if (
        window.confirm(
          'Connecting to Spotify requires a page redirect which will stop your current session. Continue?',
        )
      ) {
        window.location.href = url;
      }
    }
  };

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 transition-opacity duration-500 ${
        isIdle && activePanel === 'none' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {activePanel !== 'none' && (
        <div className="mx-4 mb-2">
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

      <div className="flex items-center justify-between bg-black/50 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <BarButton onClick={onNextPreset}>Next Preset</BarButton>

          {currentPreset && (
            <>
              <span className="w-48 truncate text-xs text-white/60" title={currentPreset}>
                {currentPreset}
              </span>
              <button
                onClick={onToggleFavorite}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
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
                title={isBlocked ? 'Unblock preset' : 'Block preset'}
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

          <BarButton onClick={() => onTogglePanel('presets')} active={activePanel === 'presets'}>
            Presets
          </BarButton>
          <BarButton onClick={() => onTogglePanel('settings')} active={activePanel === 'settings'}>
            Settings
          </BarButton>
          <BarButton onClick={onToggleAutopilot} active={autopilotEnabled}>
            Autopilot
          </BarButton>
          {hasLocalTracks && (
            <BarButton
              onClick={() => onTogglePanel('playlist')}
              active={activePanel === 'playlist'}
            >
              Queue
            </BarButton>
          )}
        </div>

        <div className="flex items-center gap-2">
          <PlaybackControls adapter={playbackAdapter} />
          {onSeek && <LocalSeekBar onSeek={onSeek} />}

          {isSpotifyConnected ? (
            <>
              <BarButton onClick={onToggleNowPlaying} active={showNowPlaying}>
                Now Playing
              </BarButton>
              <BarButton onClick={logout}>
                {user?.displayName ? `${user.displayName} ×` : 'Disconnect'}
              </BarButton>
            </>
          ) : (
            authMode !== 'locked' && (
              <BarButton onClick={handleSpotifyConnect}>Connect Spotify</BarButton>
            )
          )}

          <div className="mx-1 h-5 w-px bg-white/20" />

          <BarButton onClick={onToggleFullscreen}>Fullscreen</BarButton>
          <BarButton onClick={onStop}>Stop</BarButton>
        </div>
      </div>
    </div>
  );
}

function BarButton({
  onClick,
  active = false,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded border-none px-3 py-1.5 text-xs font-medium ${
        active ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}
