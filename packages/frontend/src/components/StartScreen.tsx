import { useRef, useState } from 'react';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { buildSpotifyAuthUrl } from '../services/spotifyApi.ts';
import { buildPkceAuthUrl } from '../services/spotifyPkce.ts';
import logoSrc from '../assets/logo.png';

interface StartScreenProps {
  onStart: () => void;
  onLocalFiles: (files: File[]) => void;
  onMicCapture: () => void;
  error: string | null;
}

const hasDisplayMedia = !!navigator.mediaDevices?.getDisplayMedia;

export function StartScreen({ onStart, onLocalFiles, onMicCapture, error }: StartScreenProps) {
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const user = useSpotifyStore((s) => s.user);
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const byocClientId = useSpotifyStore((s) => s.byocClientId);
  const logout = useSpotifyStore((s) => s.logout);
  const getAuthMode = useSpotifyStore((s) => s.getAuthMode);
  const setByocClientId = useSpotifyStore((s) => s.setByocClientId);
  const authMode = getAuthMode();

  const [showByoc, setShowByoc] = useState(false);
  const [byocInput, setByocInput] = useState(byocClientId ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSpotifyConnected = !!(sessionId || accessToken);

  const handleByocConnect = async () => {
    const trimmed = byocInput.trim();
    if (!trimmed) return;
    setByocClientId(trimmed);
    const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
    const { url } = await buildPkceAuthUrl(trimmed, redirectUri);
    window.location.href = url;
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      onLocalFiles(files);
    }
    // Reset so same files can be re-selected
    e.target.value = '';
  };

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-4 py-8 font-sans text-[#e0e0e0]">
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        {/* Logo + Title */}
        <div className="flex flex-col items-center gap-3">
          <a href="https://mangowave.app" target="_blank" rel="noopener noreferrer">
            <img src={logoSrc} alt="MangoWave logo" className="start-logo h-40 w-40" />
          </a>
          <h1
            className="text-5xl font-extrabold leading-[1.3] tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #ff8c32 0%, #e050e0 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              paddingBottom: '0.1em',
            }}
          >
            MangoWave
          </h1>
          <p className="text-sm text-[#999]">Audio-reactive visualizer for your browser</p>
        </div>

        {/* Epilepsy warning */}
        <div className="max-w-lg rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center">
          <p className="text-xs font-semibold text-amber-400">Photosensitivity Warning</p>
          <p className="mt-1 text-xs text-amber-300/70">
            This visualizer displays rapid flashing lights and patterns. If you have epilepsy or are
            sensitive to flashing lights, please use caution.
          </p>
        </div>

        {/* Audio sharing guide */}
        {hasDisplayMedia && (
          <div className="max-w-lg rounded-2xl border border-white/[0.07] bg-white/[0.04] px-6 py-5">
            <h2 className="mb-3 text-base font-semibold text-white">How it works</h2>
            <ol className="flex flex-col gap-3 text-sm text-[#aaa]">
              <li>
                <span className="font-medium text-[#e0e0e0]">1. Click Start</span> and choose a
                screen, window, or tab to share
              </li>
              <li>
                <span className="font-medium text-[#ff8c32]">2. Check &quot;Share audio&quot;</span>{' '}
                — this is required for the visualizer to react to sound
              </li>
              <li>
                <span className="font-medium text-[#e0e0e0]">3. Play music</span> and watch the
                visuals respond
              </li>
            </ol>
            <p className="mt-3 text-xs text-[#888]">
              Tip: Share your entire screen or a window for the cleanest experience — sharing a tab
              shows an unhideable browser banner. Go fullscreen (F) for full immersion.
            </p>
          </div>
        )}

        {/* Spotify connect — hidden in locked mode */}
        {authMode !== 'locked' && (
          <div className="flex max-w-lg flex-col items-center gap-2">
            {isSpotifyConnected ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-400">&#10003;</span>
                <span className="text-[#ccc]">
                  {user?.displayName ? `Connected as ${user.displayName}` : 'Spotify connected'}
                </span>
                <button
                  onClick={logout}
                  className="spotify-disconnect cursor-pointer rounded border-none bg-white/10 px-2 py-0.5 text-xs text-white/60 transition-[box-shadow] duration-150 hover:bg-white/20"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <>
                <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <span className="text-right text-xs text-[#666]">
                    For now-playing info
                    <br />
                    and playback controls.
                  </span>
                  <button
                    onClick={() => {
                      window.location.href = buildSpotifyAuthUrl();
                    }}
                    className="spotify-btn shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-[#1DB954] hover:bg-white/10"
                  >
                    Connect Spotify
                  </button>
                  <span className="text-left text-xs text-[#666]">
                    Audio always comes
                    <br />
                    from screen sharing.
                  </span>
                </div>

                {/* BYOC collapsible section */}
                <button
                  onClick={() => setShowByoc(!showByoc)}
                  className="mt-1 cursor-pointer border-none bg-transparent text-xs text-[#666] underline hover:text-[#999]"
                >
                  {showByoc ? 'Hide' : 'Use your own Spotify credentials'}
                </button>
                {showByoc && (
                  <div className="flex w-full max-w-sm flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-xs text-[#888]">
                      Create a Spotify app at{' '}
                      <span className="text-[#aaa]">developer.spotify.com</span>, add{' '}
                      <code className="rounded bg-white/10 px-1 text-[10px]">
                        {import.meta.env.VITE_SPOTIFY_REDIRECT_URI}
                      </code>{' '}
                      as a redirect URI, then paste your Client ID below.
                    </p>
                    <input
                      type="text"
                      value={byocInput}
                      onChange={(e) => setByocInput(e.target.value)}
                      placeholder="Spotify Client ID"
                      className="w-full rounded border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-[#1DB954] focus:outline-none"
                    />
                    <button
                      onClick={handleByocConnect}
                      disabled={!byocInput.trim()}
                      className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] px-4 py-1.5 text-sm font-medium text-[#1DB954] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Connect with PKCE
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-3">
          {hasDisplayMedia && (
            <button
              onClick={onStart}
              className="start-btn cursor-pointer rounded-xl border-none px-10 py-3 text-lg font-semibold text-white"
            >
              Start Visualizer
            </button>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleFileSelect}
              className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.06] px-6 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
            >
              Play Local Files
            </button>
            <button
              onClick={onMicCapture}
              className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.06] px-6 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
            >
              Use Microphone
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="audio/*"
            onChange={handleFilesChosen}
            className="hidden"
          />
        </div>

        {/* Error */}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {/* Footer links */}
      <div className="flex items-center gap-4 pb-4 pt-2">
        <a
          href="https://github.com/Louis-Mascari/MangoWave"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-[#666] no-underline transition-colors hover:text-[#aaa]"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub
        </a>
        <a
          href="https://ko-fi.com/louismascari"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-[#ff8c32] no-underline transition-colors hover:text-[#ffab66]"
        >
          <svg viewBox="0 0 32 32" width="14" height="14" fill="currentColor">
            <path d="M6 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm20 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM8 12h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm18 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM6 26a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
          </svg>
          Buy Mango a Treat
        </a>
      </div>
    </div>
  );
}
