import { useCallback, useRef, useState } from 'react';
import { AudioEngine } from '../engine/AudioEngine.ts';

export type CaptureSource = 'system' | 'mic' | null;

export interface UseAudioCaptureReturn {
  audioEngine: AudioEngine | null;
  isCapturing: boolean;
  captureSource: CaptureSource;
  error: string | null;
  startCapture: () => Promise<void>;
  startMicCapture: () => Promise<void>;
  stopCapture: () => void;
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

  const startCapture = useCallback(async () => {
    try {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }

      setError(null);
      const engine = new AudioEngine();
      const stream = await engine.captureAudio();
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to capture audio';
      setError(message);
      setIsCapturing(false);
    }
  }, [cleanup]);

  const startMicCapture = useCallback(async () => {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(message);
      setIsCapturing(false);
    }
  }, []);

  const stopCapture = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return {
    audioEngine,
    isCapturing,
    captureSource,
    error,
    startCapture,
    startMicCapture,
    stopCapture,
  };
}
