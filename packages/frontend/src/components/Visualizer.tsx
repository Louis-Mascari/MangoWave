import { useCallback, useEffect, useRef, useState } from 'react';
import { VisualizerRenderer } from '../engine/VisualizerRenderer.ts';
import type { AudioEngine } from '../engine/AudioEngine.ts';

interface VisualizerProps {
  audioEngine: AudioEngine;
  resolutionScale?: number; // 0.25 to 1.0, default 1.0
}

export function Visualizer({ audioEngine, resolutionScale = 1.0 }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<VisualizerRenderer | null>(null);
  const [presetName, setPresetName] = useState('');

  const handlePresetChange = useCallback((name: string) => {
    setPresetName(name);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = audioEngine.context;
    const analyser = audioEngine.analyserNode;

    if (!canvas || !ctx || !analyser) return;

    const renderer = new VisualizerRenderer();
    rendererRef.current = renderer;

    const updateSize = () => {
      const width = Math.floor(window.innerWidth * resolutionScale);
      const height = Math.floor(window.innerHeight * resolutionScale);
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
  }, [audioEngine, resolutionScale, handlePresetChange]);

  return (
    <>
      <canvas ref={canvasRef} className="fixed top-0 left-0 block h-screen w-screen" />
      {presetName && (
        <div className="pointer-events-none fixed bottom-15 left-4 font-mono text-sm text-white/70 drop-shadow-[0_0_4px_black]">
          {presetName}
        </div>
      )}
    </>
  );
}
