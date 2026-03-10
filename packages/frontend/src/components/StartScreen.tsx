import { useCallback, useEffect, useRef, useState } from 'react';
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

type ModalView = 'none' | 'share-audio' | 'local-files' | 'microphone';

const hasDisplayMedia = !!navigator.mediaDevices?.getDisplayMedia;

// Detect mobile/tablet: no getDisplayMedia, or touch-primary device with small screen
const isMobileDevice =
  !hasDisplayMedia ||
  (navigator.maxTouchPoints > 0 &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.innerWidth < 1024);

export function StartScreen({ onStart, onLocalFiles, onMicCapture, error }: StartScreenProps) {
  const sessionId = useSpotifyStore((s) => s.sessionId);
  const user = useSpotifyStore((s) => s.user);
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const byocClientId = useSpotifyStore((s) => s.byocClientId);
  const logout = useSpotifyStore((s) => s.logout);
  const getAuthMode = useSpotifyStore((s) => s.getAuthMode);
  const isSpotifyUnlocked = useSpotifyStore((s) => s.isSpotifyUnlocked);
  const setByocClientId = useSpotifyStore((s) => s.setByocClientId);
  const authMode = getAuthMode();

  const [activeModal, setActiveModal] = useState<ModalView>('none');
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
      closeModal();
      onLocalFiles(files);
    }
    e.target.value = '';
  };

  const closeModal = useCallback(() => setActiveModal('none'), []);

  // Close modal on Escape
  useEffect(() => {
    if (activeModal === 'none') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeModal, closeModal]);

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-4 py-8 font-sans text-[#e0e0e0]">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {/* Logo + Title */}
        <div className="flex flex-col items-center gap-3">
          <a href="https://mangowave.app" target="_blank" rel="noopener noreferrer">
            <img
              src={logoSrc}
              alt="MangoWave logo"
              className="start-logo h-32 w-32 sm:h-40 sm:w-40"
            />
          </a>
          <h1
            className="text-4xl font-extrabold leading-[1.3] tracking-tight sm:text-5xl"
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

        {/* CTA */}
        <p className="text-sm font-medium text-white/70">Choose an audio source to get started</p>

        {/* Mode cards */}
        <div className="flex w-full max-w-2xl flex-col items-stretch gap-4 sm:flex-row">
          {!isMobileDevice && (
            <ModeCard
              icon="🖥️"
              title="Share Audio"
              description="Capture system or tab audio via screen sharing"
              onClick={() => setActiveModal('share-audio')}
              color="orange"
            />
          )}
          <ModeCard
            icon="🎵"
            title="Play Local Files"
            description="Play audio files from your device"
            onClick={() => setActiveModal('local-files')}
            color="purple"
          />
          <ModeCard
            icon="🎤"
            title="Use Microphone"
            description="Visualize ambient sound — silent mode"
            onClick={() => setActiveModal('microphone')}
            color="cyan"
          />
        </div>

        {/* Mobile callout — only shown on mobile/tablet devices */}
        {isMobileDevice && (
          <p className="max-w-sm text-center text-xs text-[#666]">
            Use a laptop or desktop to also capture audio from any screen, window, or browser tab
            using screen sharing.
          </p>
        )}

        {/* Error */}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {/* Modals */}
      {activeModal === 'share-audio' && (
        <Modal title="Share Audio" onClose={closeModal}>
          <ol className="flex flex-col gap-3 text-sm text-[#aaa]">
            <li>
              <span className="font-medium text-[#e0e0e0]">1. Click Start</span> and choose a
              screen, window, or tab to share
            </li>
            <li>
              <span className="font-medium text-[#ff8c32]">2. Check &quot;Share audio&quot;</span> —
              this is required for the visualizer to react to sound
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

          {/* Spotify connect inside Share Audio modal */}
          {authMode !== 'locked' && (
            <div className="mt-4 border-t border-white/10 pt-4">
              {isSpotifyConnected ? (
                <div className="flex flex-col items-center gap-1.5">
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
                  <p className="text-[10px] text-[#666]">
                    Now-playing metadata &amp; cloud-synced settings active. Playback controls
                    require Premium. Share a screen, window, or tab playing Spotify for audio.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-center text-xs text-[#666]">Optional</p>
                  <p className="text-center text-xs text-[#888]">
                    Connect Spotify for now-playing metadata and cloud-synced settings. Spotify
                    Premium also enables playback controls. You&apos;ll still need to share a
                    screen, window, or tab playing Spotify for the visualizer to react to audio.
                  </p>
                  {isSpotifyUnlocked ? (
                    <button
                      onClick={() => {
                        window.location.href = buildSpotifyAuthUrl();
                      }}
                      className="spotify-btn cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-[#1DB954] hover:bg-white/10"
                    >
                      Connect Spotify
                    </button>
                  ) : (
                    <div className="flex w-full flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-xs text-[#888]">
                        Spotify&apos;s API limits each app key to 5 users, so you&apos;ll need your
                        own. Register a free Spotify app at{' '}
                        <span className="text-[#aaa]">developer.spotify.com</span>, add{' '}
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
                        className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] px-4 py-1.5 text-sm font-medium text-[#1DB954] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Connect with PKCE
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            onClick={onStart}
            className="start-btn mt-5 w-full cursor-pointer rounded-xl border-none px-10 py-3 text-lg font-semibold text-white"
          >
            Start Visualizer
          </button>
        </Modal>
      )}

      {activeModal === 'local-files' && (
        <Modal title="Play Local Files" onClose={closeModal}>
          <div className="flex flex-col gap-3 text-sm text-[#aaa]">
            <p>
              Select audio files from your device. They&apos;ll play through your speakers while the
              visualizer reacts to the music.
            </p>
            <ul className="flex flex-col gap-1.5 text-xs text-[#888]">
              <li>Supports MP3, WAV, FLAC, OGG, AAC, and more</li>
              <li>Build a queue and control playback with shuffle, repeat, and seek</li>
              <li>Add or remove tracks at any time from the Queue panel</li>
            </ul>
          </div>
          <button
            onClick={handleFileSelect}
            className="start-btn mt-5 w-full cursor-pointer rounded-xl border-none px-10 py-3 text-lg font-semibold text-white"
          >
            Choose Files
          </button>
        </Modal>
      )}

      {activeModal === 'microphone' && (
        <Modal title="Use Microphone" onClose={closeModal}>
          <div className="flex flex-col gap-3 text-sm text-[#aaa]">
            <p>
              Feed your microphone into the visualizer. Great for live instruments, ambient sound,
              or parties.
            </p>
            <ul className="flex flex-col gap-1.5 text-xs text-[#888]">
              <li>Silent mode — no audio plays through your speakers</li>
              <li>Requires microphone permission from your browser</li>
            </ul>
          </div>
          <button
            onClick={onMicCapture}
            className="start-btn mt-5 w-full cursor-pointer rounded-xl border-none px-10 py-3 text-lg font-semibold text-white"
          >
            Start Microphone
          </button>
        </Modal>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*"
        onChange={handleFilesChosen}
        className="hidden"
      />

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

const cardColors = {
  orange: 'border-orange-500/40 hover:border-orange-500/70',
  purple: 'border-purple-500/40 hover:border-purple-500/70',
  cyan: 'border-cyan-500/40 hover:border-cyan-500/70',
} as const;

function ModeCard({
  icon,
  title,
  description,
  onClick,
  color,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
  color: keyof typeof cardColors;
}) {
  return (
    <button
      onClick={onClick}
      className={`mode-card flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-2xl border bg-white/[0.04] px-5 py-6 text-center transition-all duration-200 hover:bg-white/[0.08] ${cardColors[color]}`}
    >
      <span className="text-3xl">{icon}</span>
      <span className="text-sm font-semibold text-white">{title}</span>
      <span className="text-xs text-[#999]">{description}</span>
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-[#111] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 cursor-pointer border-none bg-transparent text-lg text-white/40 hover:text-white/80"
          aria-label="Close"
        >
          ✕
        </button>
        <h2 className="mb-4 text-xl font-bold text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}
