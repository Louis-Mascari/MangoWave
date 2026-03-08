import logoSrc from '../assets/logo.png';

interface StartScreenProps {
  onStart: () => void;
  error: string | null;
}

export function StartScreen({ onStart, error }: StartScreenProps) {
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-4 py-8 font-sans text-[#e0e0e0]">
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        {/* Logo + Title */}
        <div className="flex flex-col items-center gap-3">
          <img
            src={logoSrc}
            alt="MangoWave logo"
            className="h-40 w-40"
            style={{ filter: 'drop-shadow(0 0 48px rgba(255, 140, 50, 0.35))' }}
          />
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
        <div className="max-w-lg rounded-2xl border border-white/[0.07] bg-white/[0.04] px-6 py-5">
          <h2 className="mb-3 text-base font-semibold text-white">How it works</h2>
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
        </div>

        {/* Spotify info */}
        <p className="max-w-md text-center text-xs text-[#666]">
          Optionally connect Spotify for now-playing metadata, playback controls, and cloud-synced
          settings.
        </p>

        {/* Start button */}
        <button
          onClick={onStart}
          className="cursor-pointer rounded-xl border-none px-10 py-3 text-lg font-semibold text-white"
          style={{
            background: 'linear-gradient(135deg, #ff8c32, #e050e0)',
            boxShadow: '0 4px 28px rgba(255, 140, 50, 0.3)',
          }}
        >
          Start Visualizer
        </button>

        {/* Shortcut hint */}
        <p className="text-xs text-[#888]">
          Press <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[#aaa]">?</kbd>{' '}
          during playback to see keyboard shortcuts
        </p>

        {/* Error */}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}
