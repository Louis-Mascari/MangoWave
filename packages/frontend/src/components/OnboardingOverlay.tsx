import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { NextTrackIcon, PaletteIcon, GearIcon, KeyboardIcon } from './icons.tsx';
interface OnboardingOverlayProps {
  onComplete: () => void;
}

interface Tip {
  titleKey: string;
  descKey: string;
  icon: React.ReactNode;
}

const DESKTOP_TIPS: Tip[] = [
  {
    titleKey: 'onboarding.desktop.skipPresetsTitle',
    descKey: 'onboarding.desktop.skipPresetsDesc',
    icon: <NextTrackIcon className="h-8 w-8" />,
  },
  {
    titleKey: 'onboarding.desktop.curateTitle',
    descKey: 'onboarding.desktop.curateDesc',
    icon: <PaletteIcon className="h-8 w-8" />,
  },
  {
    titleKey: 'onboarding.desktop.tuneTitle',
    descKey: 'onboarding.desktop.tuneDesc',
    icon: <GearIcon className="h-8 w-8" />,
  },
  {
    titleKey: 'onboarding.desktop.shortcutsTitle',
    descKey: 'onboarding.desktop.shortcutsDesc',
    icon: <KeyboardIcon className="h-8 w-8" />,
  },
];

const MOBILE_TIPS: Tip[] = [
  {
    titleKey: 'onboarding.mobile.menuTitle',
    descKey: 'onboarding.mobile.menuDesc',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 36 36"
        fill="none"
        className="inline-block h-10 w-10"
      >
        <circle cx="18" cy="18" r="14" stroke="#f97316" strokeWidth="2" />
        <circle cx="18" cy="14" r="2" fill="#f97316" />
        <path d="M18 18v8" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    titleKey: 'onboarding.mobile.navigateTitle',
    descKey: 'onboarding.mobile.navigateDesc',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 36 36"
        fill="none"
        className="inline-block h-8 w-8"
      >
        <path d="M6 8l10 10L6 28V8z" fill="#f97316" />
        <path d="M18 8l10 10-10 10V8z" fill="#f97316" />
        <rect x="29" y="8" width="3" height="20" rx="1" fill="#f97316" />
      </svg>
    ),
  },
  {
    titleKey: 'onboarding.mobile.curateTitle',
    descKey: 'onboarding.mobile.curateDesc',
    icon: <PaletteIcon className="h-8 w-8" />,
  },
  {
    titleKey: 'onboarding.mobile.autopilotTitle',
    descKey: 'onboarding.mobile.autopilotDesc',
    icon: <GearIcon className="h-8 w-8" />,
  },
];

const FADE_OUT_MS = 800;

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const { t } = useTranslation('start');
  const { t: tc } = useTranslation('common');
  const tips = isMobileDevice ? MOBILE_TIPS : DESKTOP_TIPS;
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, true);

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
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
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
      <div
        ref={containerRef}
        role="dialog"
        aria-label={t('onboarding.title', { defaultValue: 'Getting Started' })}
        className="mx-4 w-full max-w-sm rounded-xl bg-gray-900/95 p-6 shadow-2xl"
      >
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
          <h3 className="mb-2 text-base font-semibold text-white">{t(tip.titleKey)}</h3>
          <p className="text-sm leading-relaxed text-white/60">{t(tip.descKey)}</p>
        </div>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={handleClose}
            className="cursor-pointer border-none bg-transparent px-3 py-1.5 text-xs text-white/40 hover:text-white/60"
          >
            {tc('skip')}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="cursor-pointer rounded-lg border-none bg-white/10 px-4 py-1.5 text-xs text-white/70 hover:bg-white/20"
              >
                {tc('back')}
              </button>
            )}
            <button
              onClick={() => (isLast ? handleClose() : setStep(step + 1))}
              className="cursor-pointer rounded-lg border-none bg-orange-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
            >
              {isLast ? tc('gotIt') : tc('next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
