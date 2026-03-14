import { useCallback, useRef, useState } from 'react';
import { AudioEngine } from '../engine/AudioEngine.ts';

export type CaptureSource = 'system' | 'mic' | null;

export interface UseAudioCaptureReturn {
  audioEngine: AudioEngine | null;
  isCapturing: boolean;
  captureSource: CaptureSource;
  error: string | null;
  clearError: () => void;
  startCapture: () => Promise<boolean>;
  startMicCapture: () => Promise<boolean>;
  stopCapture: () => void;
}

/**
 * Translates raw browser errors into clear, actionable messages
 * so users know exactly what went wrong and how to fix it.
 */
function humanizeAudioError(err: unknown, source: 'system' | 'mic'): string {
  if (!(err instanceof DOMException)) {
    return err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
  }

  switch (err.name) {
    case 'NotAllowedError':
      return source === 'system'
        ? 'Screen sharing was cancelled or denied. Please try again and select a screen, window, or tab to share.'
        : 'Microphone access was denied. Please allow microphone access in your browser settings and try again.';

    case 'NotFoundError':
      return source === 'system'
        ? 'No screen or window was available to share. Please make sure a display is connected and try again.'
        : 'No microphone was found. Please connect a microphone and try again.';

    case 'NotSupportedError':
      return source === 'system'
        ? 'Your browser does not support audio capture via screen sharing. Please try Chrome, Edge, or Opera.'
        : 'Your browser does not support microphone access. Please try a modern browser such as Chrome, Firefox, or Edge.';

    case 'NotReadableError':
      return source === 'system'
        ? 'Could not access the screen. Another application may be preventing screen capture.'
        : 'Your microphone could not be accessed. It may be in use by another application — try closing it and trying again.';

    case 'AbortError':
      return 'The request was cancelled. Please try again when you are ready.';

    default:
      return `Something went wrong: ${err.message}. Please try again.`;
  }
}

export function useAudioCapture(): UseAudioCaptureReturn {
  const engineRef = useRef<AudioEngine | null>(null);
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureSource, setCaptureSource] = useState<CaptureSource>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    setAudioEngine(null);
    setIsCapturing(false);
    setCaptureSource(null);
  }, []);

  const startCapture = useCallback(async (): Promise<boolean> => {
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
        setError(
          'No audio was included in the screen share. Please try again and make sure ' +
            'to check "Share audio" (or "Share system audio") in the browser dialog.\n\n' +
            'Audio sharing requires Chrome, Edge, or Opera on desktop. ' +
            'Firefox, Safari, and mobile browsers do not support audio capture.\n\n' +
            'On Windows and ChromeOS, all sharing modes support audio. ' +
            'On macOS (Sonoma or later), screen and window sharing support audio in Chrome — ' +
            'older macOS versions are limited to tab sharing. ' +
            'On Linux, tab sharing is the most reliable option for audio.',
        );
        setIsCapturing(false);
        return false;
      }

      engine.initAudioPipeline(stream);

      // Listen for the browser's native "Stop sharing" button
      stream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          cleanup();
        });
      });

      engineRef.current = engine;
      setAudioEngine(engine);
      setIsCapturing(true);
      setCaptureSource('system');
      return true;
    } catch (err) {
      setError(humanizeAudioError(err, 'system'));
      setIsCapturing(false);
      return false;
    }
  }, [cleanup]);

  const startMicCapture = useCallback(async (): Promise<boolean> => {
    try {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }

      setError(null);
      const engine = new AudioEngine();
      await engine.initFromMicrophone();

      engineRef.current = engine;
      setAudioEngine(engine);
      setIsCapturing(true);
      setCaptureSource('mic');
      return true;
    } catch (err) {
      setError(humanizeAudioError(err, 'mic'));
      setIsCapturing(false);
      return false;
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
