import { useCallback, useEffect, useRef, useState } from 'react';
import { VisualizerRenderer } from '../engine/VisualizerRenderer.ts';
import type { AudioEngine } from '../engine/AudioEngine.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { PresetNotification } from './PresetNotification.tsx';

interface VisualizerProps {
  audioEngine: AudioEngine;
  rendererRef: React.RefObject<VisualizerRenderer | null>;
}

export function Visualizer({ audioEngine, rendererRef }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presetName, setPresetName] = useState('');
  const { performance, eq } = useSettingsStore();

  const handlePresetChange = useCallback((name: string) => {
    setPresetName(name);
  }, []);

  // Initialize renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = audioEngine.context;
    const analyser = audioEngine.analyserNode;

    if (!canvas || !ctx || !analyser) return;

    const renderer = new VisualizerRenderer();
    rendererRef.current = renderer;

    const updateSize = () => {
      const width = Math.floor(window.innerWidth * performance.resolutionScale);
      const height = Math.floor(window.innerHeight * performance.resolutionScale);
      canvas.width = width;
      canvas.height = height;
      renderer.setSize(width, height);
    };

    updateSize();
    renderer.init(canvas, ctx, analyser, handlePresetChange);
    renderer.start();

    window.addEventListener('resize', updateSize);

    return () => {
      window.removeEventListener('resize', updateSize);
      renderer.destroy();
      rendererRef.current = null;
    };
    // Only re-init on audioEngine change, not on every settings change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEngine]);

  // Sync performance settings to renderer
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    renderer.setFpsCap(performance.fpsCap);
  }, [performance.fpsCap, rendererRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const width = Math.floor(window.innerWidth * performance.resolutionScale);
    const height = Math.floor(window.innerHeight * performance.resolutionScale);
    canvas.width = width;
    canvas.height = height;
    renderer.setSize(width, height);
  }, [performance.resolutionScale, rendererRef]);

  // Sync EQ settings to audio engine
  useEffect(() => {
    audioEngine.setPreAmpGain(eq.preAmpGain);
  }, [audioEngine, eq.preAmpGain]);

  useEffect(() => {
    eq.bandGains.forEach((gain, i) => {
      audioEngine.setEQBandGain(i, gain);
    });
  }, [audioEngine, eq.bandGains]);

  return (
    <>
      <canvas ref={canvasRef} className="fixed top-0 left-0 block h-screen w-screen" />
      <PresetNotification message={presetName} />
    </>
  );
}
