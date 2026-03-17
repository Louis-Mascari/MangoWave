import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpotifyStore } from '../store/useSpotifyStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import { buildSpotifyAuthUrl } from '../services/spotifyApi.ts';
import { isMobileDevice } from '../utils/isMobileDevice.ts';
import { browserInfo } from '../utils/browserInfo.ts';
import { validateAudioFiles, rejectionMessage } from '../utils/audioFileValidation.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { supportedLanguages, type SupportedLanguage } from '../i18n/index.ts';
import logoSrc from '../assets/logo.png';

interface StartScreenProps {
  onStart: () => void;
  onLocalFiles: (files: File[]) => void;
  onMicCapture: () => void;
  error: string | null;
  onClearError: () => void;
}

type ModalView = 'none' | 'share-audio' | 'local-files' | 'microphone';

export function StartScreen({
  onStart,
  onLocalFiles,
  onMicCapture,
  error,
  onClearError,
}: StartScreenProps) {
  const { t } = useTranslation('start');
  const { t: tc } = useTranslation('common');

  const sessionId = useSpotifyStore((s) => s.sessionId);
  const user = useSpotifyStore((s) => s.user);
  const accessToken = useSpotifyStore((s) => s.accessToken);
  const logout = useSpotifyStore((s) => s.logout);
  const getAuthMode = useSpotifyStore((s) => s.getAuthMode);
  const authMode = getAuthMode();

  const [activeModal, setActiveModalRaw] = useState<ModalView>('none');
  const [fileError, setFileError] = useState<string | null>(null);
  const setActiveModal = useCallback(
    (view: ModalView) => {
      if (view !== 'none') {
        if (error) onClearError();
        setFileError(null);
      }
      setActiveModalRaw(view);
    },
    [error, onClearError],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSpotifyConnected = !!(sessionId || accessToken);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      const { valid, rejected } = validateAudioFiles(files);
      if (valid.length > 0) {
        if (rejected.length > 0) {
          // Mixed: toast the rejection since modal is about to close
          useToastStore.getState().show(rejectionMessage(rejected), { type: 'warning' });
        }
        closeModal();
        onLocalFiles(valid);
      } else if (rejected.length > 0) {
        // All rejected: show error in modal so user can retry
        setFileError(rejectionMessage(rejected));
      }
    }
    e.target.value = '';
  };

  const closeModal = useCallback(() => {
    setActiveModal('none');
    if (error) onClearError();
  }, [setActiveModal, error, onClearError]);

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
    <div
      data-testid="start-screen"
      className="flex h-full flex-col items-center overflow-y-auto px-4 py-8 font-sans text-[#e0e0e0]"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {/* Logo + Title */}
        <div className="flex flex-col items-center gap-3">
          <a href="https://mangowave.app" target="_blank" rel="noopener noreferrer">
            <div className="logo-glow">
              <img src={logoSrc} alt="MangoWave logo" className="h-32 w-32 sm:h-40 sm:w-40" />
            </div>
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
            {tc('mangowave')}
          </h1>
          <p className="text-sm text-[#999]">{t('subtitle')}</p>
        </div>

        {/* Epilepsy warning */}
        <div className="max-w-lg rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center">
          <p className="text-xs font-semibold text-amber-400">{t('photosensitivityWarning')}</p>
          <p className="mt-1 text-xs text-amber-300/70">{t('photosensitivityDescription')}</p>
        </div>

        {/* CTA */}
        <p className="text-sm font-medium text-white/70">{t('chooseAudioSource')}</p>

        {/* Mode cards */}
        <div className="flex w-full max-w-2xl flex-col items-stretch gap-4 sm:flex-row">
          {!isMobileDevice && (
            <ModeCard
              icon={
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-8 w-8"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              }
              title={t('shareAudio')}
              description={t('shareAudioDescription')}
              onClick={() => setActiveModal('share-audio')}
              color="orange"
            />
          )}
          <ModeCard
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-8 w-8"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            }
            title={t('playLocalFiles')}
            description={t('localFilesDescription')}
            onClick={() => setActiveModal('local-files')}
            color="purple"
          />
          <ModeCard
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-8 w-8"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            }
            title={t('useMicrophone')}
            description={t('micDescription')}
            onClick={() => setActiveModal('microphone')}
            color="cyan"
          />
        </div>

        {/* Mobile callout — only shown on mobile/tablet devices */}
        {isMobileDevice && (
          <p className="max-w-sm text-center text-xs text-[#666]">{t('mobileCallout')}</p>
        )}

        {/* Error — only on base page when no modal is covering it */}
        {error && activeModal === 'none' && (
          <div className="max-w-lg rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center">
            <p className="text-xs font-semibold text-red-400">{t('somethingWentWrong')}</p>
            <p className="mt-1 whitespace-pre-line text-xs text-red-300/70">{error}</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {activeModal === 'share-audio' && (
        <Modal title={t('shareAudio')} onClose={closeModal}>
          {/* Browser compat banner — only for non-Chromium browsers */}
          {!browserInfo.isChromium && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-xs font-semibold text-amber-400">
                {t('shareAudioModal.browserNoSupport', { browser: browserInfo.browser })}
              </p>
              <p className="mt-1 text-xs text-amber-300/70">
                {t('shareAudioModal.browserCompatMessage')}{' '}
                <button
                  onClick={() => setActiveModal('local-files')}
                  className="cursor-pointer border-none bg-transparent text-xs text-amber-300 underline"
                >
                  {t('shareAudioModal.localFiles')}
                </button>{' '}
                {tc('or')}{' '}
                <button
                  onClick={() => setActiveModal('microphone')}
                  className="cursor-pointer border-none bg-transparent text-xs text-amber-300 underline"
                >
                  {t('shareAudioModal.microphone')}
                </button>{' '}
                {t('shareAudioModal.asAudioSource')}
              </p>
            </div>
          )}

          {/* Unified step list */}
          <ol className="flex list-none flex-col gap-3 text-sm text-[#aaa]">
            <StepItem number={1}>
              <span className="font-medium text-[#e0e0e0]">{t('shareAudioModal.step1Bold')}</span>{' '}
              {t('shareAudioModal.step1')}
            </StepItem>
            <StepItem number={2}>
              <span className="font-medium text-[#ff8c32]">{t('shareAudioModal.step2Bold')}</span>{' '}
              {t('shareAudioModal.step2')}
            </StepItem>
            <StepItem number={3}>
              <span className="font-medium text-[#e0e0e0]">{t('shareAudioModal.step3Bold')}</span>{' '}
              {t('shareAudioModal.step3')}
            </StepItem>
          </ol>

          {/* OS-specific tip */}
          <OSTip />

          {/* Collapsible sensitivity tips */}
          <CollapsibleTip />

          {/* Spotify connect inside Share Audio modal */}
          <SpotifySection
            isSpotifyConnected={isSpotifyConnected}
            user={user}
            logout={logout}
            isOwnerMode={authMode === 'owner'}
          />

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-xs font-semibold text-red-400">{t('somethingWentWrong')}</p>
              <p className="mt-1 whitespace-pre-line text-xs text-red-300/70">{error}</p>
            </div>
          )}

          <button
            onClick={onStart}
            className="start-btn mt-5 w-full cursor-pointer rounded-xl border-none px-10 py-3 text-lg font-semibold text-white"
          >
            {t('shareAudioModal.startVisualizer')}
          </button>
        </Modal>
      )}

      {activeModal === 'local-files' && (
        <Modal title={t('playLocalFiles')} onClose={closeModal}>
          <ol className="flex list-none flex-col gap-3 text-sm text-[#aaa]">
            <StepItem number={1}>
              <span className="font-medium text-[#e0e0e0]">{t('localFilesModal.step1Bold')}</span>{' '}
              {t('localFilesModal.step1')}
            </StepItem>
            <StepItem number={2}>
              <span className="font-medium text-[#e0e0e0]">{t('localFilesModal.step2Bold')}</span>{' '}
              {t('localFilesModal.step2')}
            </StepItem>
          </ol>
          <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
            <p className="text-xs text-blue-300/70">{t('localFilesModal.infoBox')}</p>
          </div>
          {fileError && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-xs font-semibold text-red-400">
                {t('localFilesModal.unsupportedFile')}
              </p>
              <p className="mt-1 whitespace-pre-line text-xs text-red-300/70">{fileError}</p>
            </div>
          )}
          <button
            onClick={handleFileSelect}
            className="start-btn mt-5 w-full cursor-pointer rounded-xl border-none px-10 py-3 text-lg font-semibold text-white"
          >
            {t('localFilesModal.chooseFiles')}
          </button>
        </Modal>
      )}

      {activeModal === 'microphone' && (
        <Modal title={t('useMicrophone')} onClose={closeModal}>
          <ol className="flex list-none flex-col gap-3 text-sm text-[#aaa]">
            <StepItem number={1}>
              <span className="font-medium text-[#e0e0e0]">{t('micModal.step1Bold')}</span>{' '}
              {t('micModal.step1')}
            </StepItem>
            <StepItem number={2}>
              <span className="font-medium text-[#e0e0e0]">{t('micModal.step2Bold')}</span>{' '}
              {t('micModal.step2')}
            </StepItem>
          </ol>
          <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
            <p className="text-xs text-blue-300/70">{t('micModal.infoBox')}</p>
          </div>
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-xs font-semibold text-red-400">{t('somethingWentWrong')}</p>
              <p className="mt-1 whitespace-pre-line text-xs text-red-300/70">{error}</p>
            </div>
          )}
          <button
            onClick={onMicCapture}
            className="start-btn mt-5 w-full cursor-pointer rounded-xl border-none px-10 py-3 text-lg font-semibold text-white"
          >
            {t('micModal.startMicrophone')}
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

      {/* Footer */}
      <div className="flex flex-col items-center gap-3 pb-4 pt-2">
        <div className="flex items-center gap-8">
          <a
            href="https://github.com/Louis-Mascari/MangoWave"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-[#666] no-underline transition-colors hover:text-[#aaa]"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            {tc('github')}
          </a>
          <a
            href="https://ko-fi.com/louismascari"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-[#ff8c32] no-underline transition-colors hover:text-[#ffab66]"
          >
            <svg viewBox="0 0 32 32" width="24" height="24" fill="currentColor">
              <path d="M6 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm20 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM8 12h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm18 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM6 26a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
            </svg>
            {tc('buyMangoATreat')}
          </a>
          <a
            href="https://github.com/Louis-Mascari/MangoWave/issues/new/choose"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-[#666] no-underline transition-colors hover:text-[#aaa]"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {tc('feedback')}
          </a>
        </div>
        <LanguagePicker />
      </div>
    </div>
  );
}

function SpotifySection({
  isSpotifyConnected,
  user,
  logout,
  isOwnerMode,
}: {
  isSpotifyConnected: boolean;
  user: { displayName?: string | null } | null;
  logout: () => void;
  isOwnerMode: boolean;
}) {
  const { t } = useTranslation('start');
  const { t: tc } = useTranslation('common');
  const { t: tm } = useTranslation('messages');

  const [expanded, setExpanded] = useState(isSpotifyConnected);
  const [isConnecting, setIsConnecting] = useState(false);

  if (!isOwnerMode && !isSpotifyConnected) return null;

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      {isSpotifyConnected ? (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-green-400">&#10003;</span>
            <span className="text-[#ccc]">
              {user?.displayName
                ? t('spotify.connectedAs', { name: user.displayName })
                : t('spotify.connected')}
            </span>
            <button
              onClick={logout}
              className="spotify-disconnect cursor-pointer rounded border-none bg-white/10 px-2 py-0.5 text-xs text-white/60 transition-[box-shadow] duration-150 hover:bg-white/20"
            >
              {tc('disconnect')}
            </button>
          </div>
          <p className="text-[10px] text-[#666]">{t('spotify.connectedInfo')}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex cursor-pointer items-center gap-1.5 border-none bg-transparent text-xs text-[#888] transition-colors hover:text-[#bbb]"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#1DB954">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            {t('spotify.connectOptional')}
          </button>
          <div
            className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-in-out"
            style={{
              gridTemplateRows: expanded ? '1fr' : '0fr',
              opacity: expanded ? 1 : 0,
            }}
          >
            <div className="min-h-0">
              <div className="flex flex-col items-center gap-2 pt-1">
                <p className="text-center text-xs text-[#888]">{t('spotify.connectDescription')}</p>
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => {
                      if (isConnecting) return;
                      setIsConnecting(true);
                      try {
                        const url = buildSpotifyAuthUrl();
                        const popup = window.open(
                          url,
                          'spotify-auth',
                          'popup,width=500,height=700',
                        );
                        if (!popup || popup.closed) {
                          window.location.href = url;
                        } else {
                          const check = setInterval(() => {
                            if (popup.closed) {
                              clearInterval(check);
                              setIsConnecting(false);
                            }
                          }, 500);
                        }
                      } catch {
                        setIsConnecting(false);
                        useToastStore
                          .getState()
                          .show(tm('spotify.popupBlocked'), { type: 'error' });
                      }
                    }}
                    disabled={isConnecting}
                    className="spotify-btn cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-[#1DB954] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isConnecting ? t('spotify.connecting') : t('spotify.connectSpotify')}
                  </button>
                  <p className="text-[10px] text-[#666]">{t('spotify.devInfo')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cardColors = {
  orange: 'border-orange-500/40 hover:border-orange-500/70',
  purple: 'border-purple-500/40 hover:border-purple-500/70',
  cyan: 'border-cyan-500/40 hover:border-cyan-500/70',
} as const;

const glowColors = { orange: '#ff8c32', purple: '#e050e0', cyan: '#22d3ee' } as const;

function ModeCard({
  icon,
  title,
  description,
  onClick,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  color: keyof typeof cardColors;
}) {
  return (
    <button
      onClick={onClick}
      className={`mode-card flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-2xl border bg-white/[0.04] px-5 py-6 text-center transition-all duration-200 hover:bg-white/[0.08] ${cardColors[color]}`}
      style={{ '--glow-color': glowColors[color] } as React.CSSProperties}
    >
      <span className="text-white/70">{icon}</span>
      <span className="text-sm font-semibold text-white">{title}</span>
      <span className="text-xs text-[#999]">{description}</span>
    </button>
  );
}

function StepItem({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff8c32] to-[#e050e0] text-xs font-bold text-white">
        {number}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function OSTip() {
  const { t } = useTranslation('start');
  const { os, isChromium } = browserInfo;
  let tip: string;
  if (os === 'Windows' || os === 'ChromeOS') {
    tip = t('osTips.windowsChromeOS', { os });
  } else if (os === 'macOS') {
    tip = isChromium ? t('osTips.macOSChromium') : t('osTips.macOSNonChromium');
  } else if (os === 'Linux') {
    tip = t('osTips.linux');
  } else {
    tip = t('osTips.unknown');
  }

  return (
    <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
      <p className="text-xs text-blue-300/70">{tip}</p>
    </div>
  );
}

function CollapsibleTip() {
  const { t } = useTranslation('start');
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 text-xs text-[#888]">
      <button
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-1 border-none bg-transparent text-xs text-[#999] hover:text-[#bbb]"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5 transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        {t('sensitivityTips.title')}
      </button>
      <div
        className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-in-out"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          opacity: open ? 1 : 0,
        }}
      >
        <div className="min-h-0">
          <p className="pt-2">{t('sensitivityTips.description')}</p>
        </div>
      </div>
    </div>
  );
}

function LanguagePicker() {
  const { i18n } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[#666]"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value as SupportedLanguage)}
        className="cursor-pointer rounded border border-white/10 bg-transparent px-2 py-0.5 text-xs text-[#888] focus:border-orange-500 focus:outline-none"
      >
        {(Object.entries(supportedLanguages) as [SupportedLanguage, string][]).map(
          ([code, name]) => (
            <option key={code} value={code} className="bg-neutral-900 text-white">
              {name}
            </option>
          ),
        )}
      </select>
    </div>
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
  const { t: tc } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, true);
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-label={title}
        className="relative mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-[#111] p-6 shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 cursor-pointer border-none bg-transparent text-lg text-white/40 hover:text-white/80"
          aria-label={tc('close')}
        >
          ✕
        </button>
        <h2 className="mb-4 text-xl font-bold text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}
