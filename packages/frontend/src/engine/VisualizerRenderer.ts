import butterchurn from 'butterchurn';
import butterchurnPresets from 'butterchurn-presets';
import butterchurnPresetsExtra from 'butterchurn-presets/lib/butterchurnPresetsExtra.min';
import butterchurnPresetsExtra2 from 'butterchurn-presets/lib/butterchurnPresetsExtra2.min';
import butterchurnPresetsMD1 from 'butterchurn-presets/lib/butterchurnPresetsMD1.min';
import butterchurnPresetsNonMinimal from 'butterchurn-presets/lib/butterchurnPresetsNonMinimal.min';
import butterchurnPresetsMinimal from 'butterchurn-presets/lib/butterchurnPresetsMinimal.min';

export class VisualizerRenderer {
  private visualizer: ReturnType<typeof butterchurn.createVisualizer> | null = null;
  private animationFrameId: number | null = null;
  private presets: Record<string, object> = {};
  private presetKeys: string[] = [];
  private currentPresetIndex = 0;
  private fpsInterval = 0; // 0 = uncapped
  private lastFrameTime = 0;
  private onPresetChange?: (name: string) => void;

  get currentPresetName(): string {
    return this.presetKeys[this.currentPresetIndex] ?? '';
  }

  get presetList(): string[] {
    return [...this.presetKeys];
  }

  init(
    canvas: HTMLCanvasElement,
    audioContext: AudioContext,
    analyserNode: AnalyserNode,
    onPresetChange?: (name: string) => void,
  ): void {
    this.onPresetChange = onPresetChange;

    this.visualizer = butterchurn.createVisualizer(audioContext, canvas, {
      width: canvas.width,
      height: canvas.height,
      pixelRatio: window.devicePixelRatio || 1,
    });

    this.visualizer.connectAudio(analyserNode);

    this.presets = {
      ...butterchurnPresets.getPresets(),
      ...butterchurnPresetsExtra.getPresets(),
      ...butterchurnPresetsExtra2.getPresets(),
      ...butterchurnPresetsMD1.getPresets(),
      ...butterchurnPresetsNonMinimal.getPresets(),
      ...butterchurnPresetsMinimal.getPresets(),
    };
    this.presetKeys = Object.keys(this.presets);

    // Load a random initial preset
    if (this.presetKeys.length > 0) {
      this.currentPresetIndex = Math.floor(Math.random() * this.presetKeys.length);
      const presetName = this.presetKeys[this.currentPresetIndex];
      this.visualizer.loadPreset(this.presets[presetName], 0);
      this.onPresetChange?.(presetName);
    }
  }

  setSize(width: number, height: number): void {
    if (this.visualizer) {
      this.visualizer.setRendererSize(width, height);
    }
  }

  setFpsCap(fps: number): void {
    this.fpsInterval = fps > 0 ? 1000 / fps : 0;
  }

  loadPreset(name: string, blendTime = 2.0): void {
    if (!this.visualizer) return;
    if (this.presets[name]) {
      this.visualizer.loadPreset(this.presets[name], blendTime);
      this.currentPresetIndex = this.presetKeys.indexOf(name);
      this.onPresetChange?.(name);
    }
  }

  nextPreset(blockedPresets: Set<string> = new Set(), blendTime = 2.0): void {
    const available = this.presetKeys.filter((k) => !blockedPresets.has(k));
    if (available.length === 0) return;
    const randomIndex = Math.floor(Math.random() * available.length);
    this.loadPreset(available[randomIndex], blendTime);
  }

  start(): void {
    if (this.animationFrameId !== null) return;
    this.lastFrameTime = performance.now();
    this.render();
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private render = (): void => {
    this.animationFrameId = requestAnimationFrame(this.render);

    const now = performance.now();
    if (this.fpsInterval > 0) {
      const elapsed = now - this.lastFrameTime;
      if (elapsed < this.fpsInterval) return;
      this.lastFrameTime = now - (elapsed % this.fpsInterval);
    }

    if (this.visualizer) {
      this.visualizer.render();
    }
  };

  destroy(): void {
    this.stop();
    this.visualizer = null;
    this.presets = {};
    this.presetKeys = [];
  }
}
