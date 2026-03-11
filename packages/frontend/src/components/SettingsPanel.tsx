import { useState } from 'react';
import { EQ_BANDS } from '../engine/AudioEngine.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { buildSpotifyAuthUrl } from '../services/spotifyApi.ts';
import { buildPkceAuthUrl } from '../services/spotifyPkce.ts';
import { Tooltip } from './Tooltip.tsx';
import { isMobileDevice } from '../utils/isMobileDevice.ts';

type Tab = 'equalizer' | 'performance' | 'shortcuts' | 'spotify';

const FPS_OPTIONS = [
  { label: 'Uncapped', value: 0 },
  { label: '60 FPS', value: 60 },
  { label: '30 FPS', value: 30 },
];

const RESOLUTION_OPTIONS = [
  { label: '100%', value: 1.0 },
  { label: '75%', value: 0.75 },
  { label: '50%', value: 0.5 },
  { label: '25%', value: 0.25 },
];

const FFT_OPTIONS = [512, 1024, 2048, 4096];

function formatFreq(freq: number): string {
  return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
}

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('equalizer');
  const getAuthMode = useSpotifyStore((s) => s.getAuthMode);
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const authMode = getAuthMode();
  const showSpotifyTab = !isMobileDevice && (authMode !== 'locked' || !!(accessToken || sessionId));

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <TabButton active={activeTab === 'equalizer'} onClick={() => setActiveTab('equalizer')}>
          Equalizer
        </TabButton>
        <TabButton active={activeTab === 'performance'} onClick={() => setActiveTab('performance')}>
          Performance
        </TabButton>
        <TabButton active={activeTab === 'shortcuts'} onClick={() => setActiveTab('shortcuts')}>
          Shortcuts
        </TabButton>
        {showSpotifyTab && (
          <TabButton active={activeTab === 'spotify'} onClick={() => setActiveTab('spotify')}>
            Spotify
          </TabButton>
        )}
      </div>

      {activeTab === 'equalizer' && <EqualizerTab />}
      {activeTab === 'performance' && <PerformanceTab />}
      {activeTab === 'shortcuts' && <ShortcutsTab />}
      {activeTab === 'spotify' && showSpotifyTab && <SpotifyTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded border-none px-3 py-1.5 text-xs font-medium ${
        active ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}

function EqualizerTab() {
  const eq = useSettingsStore((s) => s.eq);
  const setPreAmpGain = useSettingsStore((s) => s.setPreAmpGain);
  const setEQBandGain = useSettingsStore((s) => s.setEQBandGain);
  const resetEQ = useSettingsStore((s) => s.resetEQ);

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center text-sm font-semibold text-white">
          Equalizer
          <Tooltip text="Shapes which frequencies drive the visuals — does not change audio output. Boost bass for more intense movement, cut highs to calm treble reactions" />
        </h3>
        <button
          onClick={resetEQ}
          className="cursor-pointer rounded border-none bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/20"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          Pre-Amp
          <Tooltip text="Scales the overall signal — higher makes visuals more reactive, lower calms them. Purely visual, does not affect audio output" />
        </label>
        <input
          type="range"
          min="0"
          max="3"
          step="0.1"
          value={eq.preAmpGain}
          onChange={(e) => setPreAmpGain(parseFloat(e.target.value))}
          className="w-full accent-orange-500"
        />
        <span className="text-right text-xs text-white/50">{eq.preAmpGain.toFixed(1)}x</span>
      </div>

      <div className="flex gap-2">
        {EQ_BANDS.map((freq, i) => (
          <div key={freq} className="flex flex-col items-center gap-1">
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={eq.bandGains[i]}
              onChange={(e) => setEQBandGain(i, parseFloat(e.target.value))}
              // @ts-expect-error - orient="vertical" is a non-standard Firefox attribute
              orient="vertical"
              className="h-24 accent-orange-500"
              style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
            />
            <span className="text-[10px] text-white/50">{formatFreq(freq)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function PerformanceTab() {
  const performance = useSettingsStore((s) => s.performance);
  const setFpsCap = useSettingsStore((s) => s.setFpsCap);
  const setResolutionScale = useSettingsStore((s) => s.setResolutionScale);
  const audio = useSettingsStore((s) => s.audio);
  const setSmoothingConstant = useSettingsStore((s) => s.setSmoothingConstant);
  const setFftSize = useSettingsStore((s) => s.setFftSize);
  const presetNameDisplay = useSettingsStore((s) => s.presetNameDisplay);
  const setPresetNameDisplay = useSettingsStore((s) => s.setPresetNameDisplay);
  const songInfoDisplay = useSettingsStore((s) => s.songInfoDisplay);
  const setSongInfoDisplay = useSettingsStore((s) => s.setSongInfoDisplay);
  const autopilot = useSettingsStore((s) => s.autopilot);
  const setAutopilotEnabled = useSettingsStore((s) => s.setAutopilotEnabled);
  const setAutopilotInterval = useSettingsStore((s) => s.setAutopilotInterval);
  const setAutopilotFavoritesOnly = useSettingsStore((s) => s.setAutopilotFavoritesOnly);

  return (
    <>
      <h3 className="text-sm font-semibold text-white">Performance</h3>

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          Frame Rate
          <Tooltip text="Lower frame rates reduce GPU usage" />
        </label>
        <div className="flex gap-2">
          {FPS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFpsCap(opt.value)}
              className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
                performance.fpsCap === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          Resolution
          <Tooltip text="Lower resolution reduces GPU load but looks less sharp" />
        </label>
        <div className="flex gap-2">
          {RESOLUTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setResolutionScale(opt.value)}
              className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
                performance.resolutionScale === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          Audio Smoothing: {audio.smoothingConstant.toFixed(2)}
          <Tooltip text="Lower = snappier reaction to beats, higher = smoother movement. Effect is subtle — presets apply their own internal smoothing" />
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={audio.smoothingConstant}
          onChange={(e) => setSmoothingConstant(parseFloat(e.target.value))}
          className="w-full accent-orange-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          FFT Size
          <Tooltip text="Higher = more frequency detail but more latency. Effect is subtle — the engine maps to fixed internal frequency bands" />
        </label>
        <div className="flex gap-2">
          {FFT_OPTIONS.map((size) => (
            <button
              key={size}
              onClick={() => setFftSize(size)}
              className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
                audio.fftSize === size
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          Preset Name Display
          <Tooltip text="How long the preset name shows when switching presets" />
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setPresetNameDisplay('off')}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              presetNameDisplay === 'off'
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Off
          </button>
          <button
            onClick={() => setPresetNameDisplay('always')}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              presetNameDisplay === 'always'
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Always
          </button>
          <button
            onClick={() =>
              setPresetNameDisplay(typeof presetNameDisplay === 'number' ? presetNameDisplay : 5)
            }
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              typeof presetNameDisplay === 'number'
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Timed
          </button>
        </div>
        {typeof presetNameDisplay === 'number' && (
          <div className="mt-1">
            <label className="text-xs text-white/60">Duration: {presetNameDisplay}s</label>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={presetNameDisplay}
              onChange={(e) => setPresetNameDisplay(parseInt(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center text-xs text-white/60">
          Song Info Display
          <Tooltip text="How long the Now Playing banner shows when the song changes" />
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setSongInfoDisplay('off')}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              songInfoDisplay === 'off'
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Off
          </button>
          <button
            onClick={() => setSongInfoDisplay('always')}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              songInfoDisplay === 'always'
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Always
          </button>
          <button
            onClick={() =>
              setSongInfoDisplay(typeof songInfoDisplay === 'number' ? songInfoDisplay : 5)
            }
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              typeof songInfoDisplay === 'number'
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            Timed
          </button>
        </div>
        {typeof songInfoDisplay === 'number' && (
          <div className="mt-1">
            <label className="text-xs text-white/60">Duration: {songInfoDisplay}s</label>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={songInfoDisplay}
              onChange={(e) => setSongInfoDisplay(parseInt(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>
        )}
      </div>

      <div className="mt-1 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center text-xs font-semibold text-white/80">
            Autopilot
            <Tooltip text="Automatically cycles through presets at the set interval" />
          </label>
          <button
            onClick={() => setAutopilotEnabled(!autopilot.enabled)}
            className={`cursor-pointer rounded border-none px-3 py-1 text-xs ${
              autopilot.enabled
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {autopilot.enabled ? 'On' : 'Off'}
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <label className="text-xs text-white/60">Interval: {autopilot.interval}s</label>
          <input
            type="range"
            min="5"
            max="120"
            step="5"
            value={autopilot.interval}
            onChange={(e) => setAutopilotInterval(parseInt(e.target.value))}
            className="w-full accent-orange-500"
          />
        </div>

        <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={autopilot.favoritesOnly}
            onChange={(e) => setAutopilotFavoritesOnly(e.target.checked)}
            className="accent-orange-500"
          />
          Favorites only
        </label>
      </div>
    </>
  );
}

function SpotifyTab() {
  const user = useSpotifyStore((s) => s.user);
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const byocClientId = useSpotifyStore((s) => s.byocClientId);
  const isSpotifyUnlocked = useSpotifyStore((s) => s.isSpotifyUnlocked);
  const getAuthMode = useSpotifyStore((s) => s.getAuthMode);
  const setByocClientId = useSpotifyStore((s) => s.setByocClientId);
  const logout = useSpotifyStore((s) => s.logout);
  const authMode = getAuthMode();

  const isConnected = !!(accessToken || sessionId);
  const [byocInput, setByocInput] = useState(byocClientId ?? '');

  const handleByocConnect = async () => {
    const trimmed = byocInput.trim();
    if (!trimmed) return;
    setByocClientId(trimmed);
    const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
    const { url } = await buildPkceAuthUrl(trimmed, redirectUri);
    const popup = window.open(url, 'spotify-auth', 'popup,width=500,height=700');
    if (!popup || popup.closed) {
      window.location.href = url;
    }
  };

  const handleOwnerConnect = () => {
    const url = buildSpotifyAuthUrl();
    const popup = window.open(url, 'spotify-auth', 'popup,width=500,height=700');
    if (!popup || popup.closed) {
      window.location.href = url;
    }
  };

  if (authMode === 'locked') {
    return (
      <>
        <h3 className="text-sm font-semibold text-white">Spotify</h3>
        <p className="text-xs text-white/50">Spotify integration is not available.</p>
      </>
    );
  }

  return (
    <>
      <h3 className="text-sm font-semibold text-white">Spotify</h3>

      {isConnected ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-green-400">&#10003;</span>
            <span className="text-white/80">
              {user?.displayName ? `Connected as ${user.displayName}` : 'Connected'}
            </span>
            {byocClientId && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
                BYOC
              </span>
            )}
          </div>
          <p className="text-xs text-white/40">
            Now-playing metadata &amp; cloud-synced settings active. Playback controls require
            Premium. Share a screen, window, or tab playing Spotify for audio.
          </p>
          <button
            onClick={logout}
            className="w-fit cursor-pointer rounded border-none bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-white/50">
            Connect Spotify for now-playing metadata and cloud-synced settings. Spotify Premium also
            enables playback controls. You&apos;ll still need to share a screen, window, or tab
            playing Spotify for the visualizer to react to audio.
          </p>

          {isSpotifyUnlocked ? (
            <button
              onClick={handleOwnerConnect}
              className="w-fit cursor-pointer rounded border-none bg-[#1DB954]/20 px-3 py-1 text-xs text-[#1DB954] hover:bg-[#1DB954]/30"
            >
              Connect Spotify
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs text-white/50">
                Spotify&apos;s API limits each app key to 5 users, so you&apos;ll need your own.
                Register a free Spotify app at{' '}
                <span className="text-white/70">developer.spotify.com</span>, add{' '}
                <code className="rounded bg-white/10 px-1 text-[10px]">
                  {import.meta.env.VITE_SPOTIFY_REDIRECT_URI}
                </code>{' '}
                as a redirect URI, then paste your Client ID (not your secret key) below.
              </p>
              <input
                type="text"
                value={byocInput}
                onChange={(e) => setByocInput(e.target.value)}
                placeholder="Client ID (not secret key)"
                className="w-full rounded border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-[#1DB954] focus:outline-none"
              />
              <button
                onClick={handleByocConnect}
                disabled={!byocInput.trim()}
                className="w-fit cursor-pointer rounded border-none bg-[#1DB954]/20 px-3 py-1 text-xs text-[#1DB954] hover:bg-[#1DB954]/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Connect with PKCE
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const SHORTCUTS = [
  { key: 'Space / N', action: 'Next preset' },
  { key: 'P', action: 'Previous preset' },
  { key: 'F', action: 'Toggle fullscreen' },
  { key: 'Double-click', action: 'Toggle fullscreen' },
  { key: 'A', action: 'Toggle autopilot' },
  { key: 'S', action: 'Toggle favorite' },
  { key: 'B', action: 'Toggle block' },
  { key: 'Q', action: 'Toggle queue (local files)' },
  { key: 'Escape', action: 'Close panel / overlay' },
  { key: '? / H', action: 'Toggle shortcut overlay' },
];

function ShortcutsTab() {
  return (
    <>
      <h3 className="text-sm font-semibold text-white">Keyboard Shortcuts</h3>
      <div className="flex flex-col gap-2">
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between">
            <kbd className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-white/80">
              {s.key}
            </kbd>
            <span className="text-xs text-white/60">{s.action}</span>
          </div>
        ))}
      </div>
    </>
  );
}
