export interface VisualizerInstance {
  connectAudio(audioNode: AudioNode): void;
  loadPreset(preset: object, blendTime: number): void;
  loadExtraImages(
    imageData: Record<string, { data: string; width: number; height: number }>,
  ): void;
  setRendererSize(
    width: number,
    height: number,
    opts?: { meshWidth?: number; meshHeight?: number; textureRatio?: number },
  ): void;
  setOutputAA(useAA: boolean): void;
  render(): void;
}

declare const butterchurn: {
  createVisualizer(
    audioContext: AudioContext,
    canvas: HTMLCanvasElement,
    opts: {
      width: number;
      height: number;
      pixelRatio: number;
      meshWidth?: number;
      meshHeight?: number;
      textureRatio?: number;
      outputFXAA?: boolean;
    },
  ): VisualizerInstance;
};

export default butterchurn;
