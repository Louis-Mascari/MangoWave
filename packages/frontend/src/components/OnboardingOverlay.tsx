import { useCallback, useEffect, useRef, useState } from 'react';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import logoUrl from '../assets/logo.png';

interface OnboardingOverlayProps {
  onComplete: () => void;
}

interface Tip {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const DESKTOP_TIPS: Tip[] = [
  {
    title: 'Skip Presets',
    description:
      'Press Space or N to skip to the next preset. Each one responds to your music differently.',
    icon: '⏭',
  },
  {
    title: 'Curate Your Experience',
    description:
      'Open the Presets panel to browse, favorite, or block presets. Build a collection of your favorites and let autopilot cycle through them.',
    icon: '🎨',
  },
  {
    title: 'Tune the Visuals',
    description:
      'Open Settings to adjust the equalizer, smoothing, and rendering quality — shaping how the visuals react to your music.',
    icon: '⚙',
  },
  {
    title: 'Keyboard Shortcuts',
    description: 'Press H to see all keyboard shortcuts, or find them in the Settings menu.',
    icon: '⌨',
  },
];

const MOBILE_TIPS: Tip[] = [
  {
    title: 'The Menu',
    description:
      'Tap the logo in the corner to open the radial menu. It gives you quick access to everything — presets, settings, fullscreen, and more.',
    icon: (
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/60">
        <img src={logoUrl} alt="MangoWave logo" className="h-11 w-11 object-contain" />
      </div>
    ),
  },
  {
    title: 'Navigate Presets',
    description:
      'Use Next (▶) and Previous (◀) to skip between presets. Each one reacts to your music in its own way.',
    icon: '⏭',
  },
  {
    title: 'Curate Your Experience',
    description:
      "Favorite (★) the presets you love, block (⊘) the ones you don't. Open Presets (P) to browse and filter your collection.",
    icon: '🎨',
  },
  {
    title: 'Autopilot & Settings',
    description:
      'Toggle Autopilot (A) to cycle through presets automatically. Open Settings (⚙) to adjust the equalizer and rendering.',
    icon: '⚙',
  },
];

const FADE_OUT_MS = 800;

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const tips = isMobileDevice ? MOBILE_TIPS : DESKTOP_TIPS;
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up fade-out timer on unmount
  useEffect(
    () => () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    },
    [],
  );

  const tip = tips[step];
  const isLast = step === tips.length - 1;

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    fadeTimerRef.current = setTimeout(onComplete, FADE_OUT_MS);
  }, [closing, onComplete]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/93 transition-opacity"
      style={{
        opacity: closing ? 0 : 1,
        transitionDuration: `${FADE_OUT_MS}ms`,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="mx-4 w-full max-w-sm rounded-xl bg-gray-900/95 p-6 shadow-2xl">
        {/* Progress dots */}
        <div className="mb-4 flex justify-center gap-1.5">
          {tips.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-orange-500' : 'w-1.5 bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Tip content */}
        <div className="text-center">
          <div className="mb-3 text-3xl">{tip.icon}</div>
          <h3 className="mb-2 text-base font-semibold text-white">{tip.title}</h3>
          <p className="text-sm leading-relaxed text-white/60">{tip.description}</p>
        </div>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={handleClose}
            className="cursor-pointer border-none bg-transparent px-3 py-1.5 text-xs text-white/40 hover:text-white/60"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="cursor-pointer rounded-lg border-none bg-white/10 px-4 py-1.5 text-xs text-white/70 hover:bg-white/20"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (isLast ? handleClose() : setStep(step + 1))}
              className="cursor-pointer rounded-lg border-none bg-orange-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
