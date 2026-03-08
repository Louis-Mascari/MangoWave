import { useState } from 'react';
import { useIdleTimer } from '../hooks/useIdleTimer.ts';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { buildSpotifyAuthUrl } from '../services/spotifyApi.ts';
import { EQPanel } from './EQPanel.tsx';
import { PerformancePanel } from './PerformancePanel.tsx';
import { PresetBrowser } from './PresetBrowser.tsx';
import { PlaybackControls } from './PlaybackControls.tsx';

interface ControlBarProps {
  onNextPreset: () => void;
  onSelectPreset: (name: string) => void;
  onStop: () => void;
  onToggleFullscreen: () => void;
  onToggleNowPlaying: () => void;
  showNowPlaying: boolean;
  presetList: string[];
  currentPreset: string;
}

type PanelView = 'none' | 'eq' | 'performance' | 'presets';

export function ControlBar({
  onNextPreset,
  onSelectPreset,
  onStop,
  onToggleFullscreen,
  onToggleNowPlaying,
  showNowPlaying,
  presetList,
  currentPreset,
}: ControlBarProps) {
  const isIdle = useIdleTimer(3000);
  const [activePanel, setActivePanel] = useState<PanelView>('none');
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const user = useSpotifyStore((s) => s.user);
  const logout = useSpotifyStore((s) => s.logout);

  const isSpotifyConnected = !!accessToken;

  const togglePanel = (panel: PanelView) => {
    setActivePanel((current) => (current === panel ? 'none' : panel));
  };

  const handleSpotifyConnect = () => {
    window.location.href = buildSpotifyAuthUrl();
  };

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 transition-opacity duration-500 ${
        isIdle && activePanel === 'none' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {activePanel !== 'none' && (
        <div className="mx-4 mb-2">
          {activePanel === 'eq' && <EQPanel />}
          {activePanel === 'performance' && <PerformancePanel />}
          {activePanel === 'presets' && (
            <PresetBrowser
              presetList={presetList}
              currentPreset={currentPreset}
              onSelectPreset={onSelectPreset}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between bg-black/50 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <BarButton onClick={onNextPreset}>Next Preset</BarButton>
          <BarButton onClick={() => togglePanel('presets')} active={activePanel === 'presets'}>
            Presets
          </BarButton>
          <BarButton onClick={() => togglePanel('eq')} active={activePanel === 'eq'}>
            EQ
          </BarButton>
          <BarButton
            onClick={() => togglePanel('performance')}
            active={activePanel === 'performance'}
          >
            Performance
          </BarButton>

          <div className="mx-1 h-5 w-px bg-white/20" />

          <PlaybackControls />

          {isSpotifyConnected && (
            <BarButton onClick={onToggleNowPlaying} active={showNowPlaying}>
              Now Playing
            </BarButton>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isSpotifyConnected ? (
            <BarButton onClick={logout}>
              {user?.displayName ? `${user.displayName} ×` : 'Disconnect'}
            </BarButton>
          ) : (
            <BarButton onClick={handleSpotifyConnect}>Connect Spotify</BarButton>
          )}
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
