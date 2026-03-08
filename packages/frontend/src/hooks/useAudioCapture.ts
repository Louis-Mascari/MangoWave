import { useCallback, useRef, useState } from 'react';
import { AudioEngine } from '../engine/AudioEngine.ts';

export interface UseAudioCaptureReturn {
  audioEngine: AudioEngine | null;
  isCapturing: boolean;
  error: string | null;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
}

export function useAudioCapture(): UseAudioCaptureReturn {
  const engineRef = useRef<AudioEngine | null>(null);
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    setAudioEngine(null);
    setIsCapturing(false);
  }, []);

  const startCapture = useCallback(async () => {
    try {
      // Destroy previous engine if one exists (prevents memory leak)
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to capture audio';
      setError(message);
      setIsCapturing(false);
    }
  }, [cleanup]);

  const stopCapture = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return {
    audioEngine,
    isCapturing,
    error,
    startCapture,
    stopCapture,
  };
}
