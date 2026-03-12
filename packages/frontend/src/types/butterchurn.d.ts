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

declare module 'butterchurn-presets/lib/butterchurnPresetsExtra.min' {
  const butterchurnPresetsExtra: {
    getPresets(): Record<string, object>;
  };

  export default butterchurnPresetsExtra;
}

declare module 'butterchurn-presets/lib/butterchurnPresetsExtra2.min' {
  const butterchurnPresetsExtra2: {
    getPresets(): Record<string, object>;
  };

  export default butterchurnPresetsExtra2;
}

declare module 'butterchurn-presets/lib/butterchurnPresetsMD1.min' {
  const butterchurnPresetsMD1: {
    getPresets(): Record<string, object>;
  };

  export default butterchurnPresetsMD1;
}

declare module 'butterchurn-presets/lib/butterchurnPresetsNonMinimal.min' {
  const butterchurnPresetsNonMinimal: {
    getPresets(): Record<string, object>;
  };

  export default butterchurnPresetsNonMinimal;
}

declare module 'butterchurn-presets/lib/butterchurnPresetsMinimal.min' {
  const butterchurnPresetsMinimal: {
    getPresets(): Record<string, object>;
  };

  export default butterchurnPresetsMinimal;
}
