import { useCallback, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { AudioEngine } from '../engine/AudioEngine.ts';
import { browserInfo } from '../utils/browserInfo.ts';
import i18n from '../i18n/index.ts';

export type CaptureSource = 'system' | 'mic' | null;

export interface UseAudioCaptureReturn {
  audioEngine: AudioEngine | null;
  isCapturing: boolean;
  captureSource: CaptureSource;
  error: string | null;
  clearError: () => void;
  startCapture: () => Promise<boolean>;
  startMicCapture: (deviceId?: string) => Promise<boolean>;
  stopCapture: () => void;
}

/**
 * Translates raw browser errors into clear, actionable messages
 * so users know exactly what went wrong and how to fix it.
 */
function humanizeAudioError(err: unknown, source: 'system' | 'mic'): string {
  const t = i18n.getFixedT(null, 'messages');

  if (!(err instanceof DOMException)) {
    return err instanceof Error
      ? t('errors.genericError', { message: err.message })
      : t('errors.unexpectedError');
  }

  switch (err.name) {
    case 'NotAllowedError':
      return source === 'system' ? t('errors.notAllowedSystem') : t('errors.notAllowedMic');

    case 'NotFoundError':
      return source === 'system' ? t('errors.notFoundSystem') : t('errors.notFoundMic');

    case 'NotSupportedError':
      return source === 'system' ? t('errors.notSupportedSystem') : t('errors.notSupportedMic');

    case 'NotReadableError':
      return source === 'system' ? t('errors.notReadableSystem') : t('errors.notReadableMic');

    case 'AbortError':
      return t('errors.abortError');

    default:
      return t('errors.genericError', { message: err.message });
  }
}

/**
 * Builds a browser/OS-aware message when screen share has no audio tracks.
 * Shows only the relevant OS tip instead of listing all platforms.
 */
function buildNoAudioMessage(): string {
  const t = i18n.getFixedT(null, 'messages');
  const lines = [t('errors.noAudioBase')];

  if (!browserInfo.isChromium) {
    lines.push(t('errors.noAudioNonChromium', { browser: browserInfo.browser }));
  }

  const { os } = browserInfo;
  if (os === 'Windows' || os === 'ChromeOS') {
    lines.push(t('errors.noAudioWindowsChromeOS', { os }));
  } else if (os === 'macOS') {
    lines.push(t('errors.noAudioMacOS'));
  } else if (os === 'Linux') {
    lines.push(t('errors.noAudioLinux'));
  } else {
    lines.push(t('errors.noAudioUnknown'));
  }

  return lines.join('\n\n');
}

export function useAudioCapture(): UseAudioCaptureReturn {
  const engineRef = useRef<AudioEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackEndedRef = useRef<(() => void) | null>(null);
  const startingRef = useRef(false);
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureSource, setCaptureSource] = useState<CaptureSource>(null);
  const [error, setError] = useState<string | null>(null);

  const removeTrackListeners = useCallback(() => {
    if (streamRef.current && trackEndedRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.removeEventListener('ended', trackEndedRef.current!);
      });
    }
    streamRef.current = null;
    trackEndedRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    removeTrackListeners();
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    setAudioEngine(null);
    setIsCapturing(false);
    setCaptureSource(null);
  }, [removeTrackListeners]);

  const startCapture = useCallback(async (): Promise<boolean> => {
    if (startingRef.current) return false;
    startingRef.current = true;
    try {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }

      setError(null);
      const engine = new AudioEngine();
      const stream = await engine.captureAudio();

      // Detect if user forgot to share audio (or browser/source doesn't support it)
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        engine.destroy();
        setError(buildNoAudioMessage());
        setIsCapturing(false);
        return false;
      }

      engine.initAudioPipeline(stream);

      // Listen for the browser's native "Stop sharing" button.
      // Store handler ref so listeners can be removed on cleanup/re-start.
      removeTrackListeners();
      const onTrackEnded = () => cleanup();
      trackEndedRef.current = onTrackEnded;
      streamRef.current = stream;
      stream.getTracks().forEach((track) => {
        track.addEventListener('ended', onTrackEnded);
      });

      engineRef.current = engine;
      setAudioEngine(engine);
      setIsCapturing(true);
      setCaptureSource('system');
      return true;
    } catch (err) {
      const isExpected =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' ||
          err.name === 'AbortError' ||
          err.name === 'NotSupportedError' ||
          err.name === 'NotReadableError' ||
          err.name === 'NotFoundError' ||
          err.name === 'InvalidStateError');
      if (!isExpected) {
        Sentry.captureException(err, { tags: { audioSource: 'system' } });
      }
      setError(humanizeAudioError(err, 'system'));
      setIsCapturing(false);
      return false;
    } finally {
      startingRef.current = false;
    }
  }, [cleanup, removeTrackListeners]);

  const startMicCapture = useCallback(async (deviceId?: string): Promise<boolean> => {
    if (startingRef.current) return false;
    startingRef.current = true;
    try {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }

      setError(null);
      const engine = new AudioEngine();
      await engine.initFromMicrophone(deviceId);

      engineRef.current = engine;
      setAudioEngine(engine);
      setIsCapturing(true);
      setCaptureSource('mic');
      return true;
    } catch (err) {
      const isExpected =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' ||
          err.name === 'AbortError' ||
          err.name === 'NotSupportedError' ||
          err.name === 'NotReadableError' ||
          err.name === 'NotFoundError' ||
          err.name === 'InvalidStateError');
      if (!isExpected) {
        Sentry.captureException(err, { tags: { audioSource: 'mic' } });
      }
      setError(humanizeAudioError(err, 'mic'));
      setIsCapturing(false);
      return false;
    } finally {
      startingRef.current = false;
    }
  }, []);

  const stopCapture = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    audioEngine,
    isCapturing,
    captureSource,
    error,
    clearError,
    startCapture,
    startMicCapture,
    stopCapture,
  };
}
