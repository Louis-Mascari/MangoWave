import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import {
  NextTrackIcon,
  GearIcon,
  KeyboardIcon,
  StarIcon,
  BlockIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
} from './icons.tsx';

interface OnboardingOverlayProps {
  onComplete: () => void;
  /** Called when the overlay starts closing — lets the caller show controls immediately. */
  onClosing?: () => void;
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
    icon: <NextTrackIcon className="h-10 w-10 text-orange-400" />,
  },
  {
    titleKey: 'onboarding.desktop.curateTitle',
    descKey: 'onboarding.desktop.curateDesc',
    icon: (
      <span className="inline-flex items-center gap-2 text-orange-400">
        <StarIcon className="h-8 w-8" />
        <BlockIcon className="h-8 w-8" />
      </span>
    ),
  },
  {
    titleKey: 'onboarding.desktop.tuneTitle',
    descKey: 'onboarding.desktop.tuneDesc',
    icon: <GearIcon className="h-10 w-10 text-orange-400" />,
  },
  {
    titleKey: 'onboarding.desktop.shortcutsTitle',
    descKey: 'onboarding.desktop.shortcutsDesc',
    icon: <KeyboardIcon className="h-10 w-10 text-orange-400" />,
  },
];

const MOBILE_TIPS: Tip[] = [
  {
    titleKey: 'onboarding.mobile.menuTitle',
    descKey: 'onboarding.mobile.menuDesc',
    icon: (
      <svg
        viewBox="0 0 36 36"
        fill="none"
        className="inline-block h-10 w-10 text-orange-400"
        aria-hidden="true"
      >
        <circle cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="2" />
        <circle cx="18" cy="14" r="2" fill="currentColor" />
        <path d="M18 18v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    titleKey: 'onboarding.mobile.navigateTitle',
    descKey: 'onboarding.mobile.navigateDesc',
    icon: (
      <span className="inline-flex items-center gap-3 text-orange-400">
        <ChevronLeftIcon className="h-8 w-8" />
        <ChevronRightIcon className="h-8 w-8" />
      </span>
    ),
  },
  {
    titleKey: 'onboarding.mobile.curateTitle',
    descKey: 'onboarding.mobile.curateDesc',
    icon: (
      <span className="inline-flex items-center gap-2 text-orange-400">
        <StarIcon className="h-8 w-8" />
        <BlockIcon className="h-8 w-8" />
      </span>
    ),
  },
  {
    titleKey: 'onboarding.mobile.autopilotTitle',
    descKey: 'onboarding.mobile.autopilotDesc',
    icon: (
      <span className="inline-flex items-center gap-3 text-orange-400">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-current text-lg font-bold">
          A
        </span>
        <GearIcon className="h-9 w-9" />
      </span>
    ),
  },
];

const FADE_OUT_MS = 800;

export function OnboardingOverlay({ onComplete, onClosing }: OnboardingOverlayProps) {
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
    onClosing?.();
    fadeTimerRef.current = setTimeout(onComplete, FADE_OUT_MS);
  }, [closing, onComplete, onClosing]);

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
          <div className="mb-3 flex justify-center">{tip.icon}</div>
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
