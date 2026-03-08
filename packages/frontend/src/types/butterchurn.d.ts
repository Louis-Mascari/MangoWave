declare module 'butterchurn' {
  interface VisualizerInstance {
    connectAudio(audioNode: AudioNode): void;
    loadPreset(preset: object, blendTime: number): void;
    setRendererSize(width: number, height: number): void;
    render(): void;
  }

  const butterchurn: {
    createVisualizer(
      audioContext: AudioContext,
      canvas: HTMLCanvasElement,
      opts: { width: number; height: number; pixelRatio: number },
    ): VisualizerInstance;
  };

  export default butterchurn;
}

declare module 'butterchurn-presets' {
  const butterchurnPresets: {
    getPresets(): Record<string, object>;
  };

  export default butterchurnPresets;
}
