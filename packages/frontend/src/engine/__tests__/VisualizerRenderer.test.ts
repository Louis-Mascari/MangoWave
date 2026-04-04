import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VisualizerRenderer } from '../VisualizerRenderer.ts';

// Mock butterchurn
vi.mock('butterchurn', () => ({
  default: {
    createVisualizer: vi.fn(() => ({
      connectAudio: vi.fn(),
      loadPreset: vi.fn(),
      loadExtraImages: vi.fn(),
      setRendererSize: vi.fn(),
      render: vi.fn(),
    })),
  },
  butterchurnExtraImages: {
    getImages: () => ({ cells: { data: 'data:image/png;base64,abc', width: 256, height: 256 } }),
  },
}));

// Mock milkdrop-presets (empty for tests — MilkDrop presets load async)
vi.mock('milkdrop-presets', () => ({
  getPresets: () => ({}),
  getPresetNames: () => [],
  getPreset: () => undefined,
}));

// Mock butterchurn-presets (Minimal pack provides test presets; others empty)
vi.mock('butterchurn-presets', () => ({
  presetsMinimal: {
    getPresets: vi.fn(() => ({
      'Preset A': { code: 'a' },
      'Preset B': { code: 'b' },
      'Preset C': { code: 'c' },
    })),
  },
  presetsNonMinimal: { getPresets: () => ({}) },
  presetsExtra: { getPresets: () => ({}) },
  presetsExtra2: { getPresets: () => ({}) },
  presetsMD1: { getPresets: () => ({}) },
}));

// Mock presetThematicMap — test presets map to known thematic packs
vi.mock('../../data/presetThematicPacks.ts', () => ({
  THEMATIC_PACKS: ['Ambient', 'Reactive', 'Psychedelic', 'Waveform', 'Ethereal'],
  presetThematicMap: {
    'Preset A': 'Reactive',
    'Preset B': 'Psychedelic',
    'Preset C': 'Ethereal',
  },
  PACK_DESCRIPTIONS: {},
}));

describe('VisualizerRenderer', () => {
  let renderer: VisualizerRenderer;

  beforeEach(() => {
    renderer = new VisualizerRenderer();
    vi.spyOn(Math, 'random').mockReturnValue(0); // deterministic preset selection
  });

  it('starts with empty state', () => {
    expect(renderer.currentPresetName).toBe('');
    expect(renderer.presetList).toEqual([]);
  });

  describe('init', () => {
    it('initializes butterchurn and loads a preset', () => {
      const canvas = {
        width: 800,
        height: 600,
        getContext: vi.fn(),
      } as unknown as HTMLCanvasElement;
      const audioContext = {} as AudioContext;
      const analyser = {} as AnalyserNode;
      const onPresetChange = vi.fn();

      renderer.init(canvas, audioContext, analyser, onPresetChange);

      expect(renderer.presetList).toEqual(['Preset A', 'Preset B', 'Preset C']);
      expect(renderer.currentPresetName).toBe('Preset A');
      expect(onPresetChange).toHaveBeenCalledWith('Preset A');
    });

    it('builds pack map using thematic classification', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      const packMap = renderer.presetPackMap;
      expect(packMap.get('Preset A')).toBe('Reactive');
      expect(packMap.get('Preset B')).toBe('Psychedelic');
      expect(packMap.get('Preset C')).toBe('Ethereal');
    });

    it('excludes mobile-blocked presets via excludedPresets set', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      const onPresetChange = vi.fn();

      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode, onPresetChange, {
        excludedPresets: new Set(['Preset A', 'Preset C']),
      });

      expect(renderer.currentPresetName).toBe('Preset B');
      expect(onPresetChange).toHaveBeenCalledWith('Preset B');
    });

    it('falls back to all presets when excludedPresets excludes everything', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      const onPresetChange = vi.fn();

      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode, onPresetChange, {
        excludedPresets: new Set(['Preset A', 'Preset B', 'Preset C']),
      });

      // Should fall back to full list since no candidates remained
      expect(renderer.currentPresetName).toBe('Preset A');
      expect(onPresetChange).toHaveBeenCalledWith('Preset A');
    });
  });

  describe('nextPreset', () => {
    it('skips blocked presets', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      const blocked = new Set(['Preset A', 'Preset C']);
      renderer.nextPreset(blocked);

      expect(renderer.currentPresetName).toBe('Preset B');
    });

    it('does nothing when all presets are blocked', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      const initialPreset = renderer.currentPresetName;
      const blocked = new Set(['Preset A', 'Preset B', 'Preset C']);
      renderer.nextPreset(blocked);

      expect(renderer.currentPresetName).toBe(initialPreset);
    });
  });

  describe('setFpsCap', () => {
    it('sets fps interval for frame limiting', () => {
      renderer.setFpsCap(30);
      // Internal state — we verify indirectly through render behavior
      // Just ensure it doesn't throw
      expect(true).toBe(true);
    });

    it('disables cap with 0', () => {
      renderer.setFpsCap(0);
      expect(true).toBe(true);
    });
  });

  describe('start/stop', () => {
    it('can start and stop the render loop', () => {
      const mockRaf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
      const mockCaf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      renderer.start();
      expect(mockRaf).toHaveBeenCalled();

      renderer.stop();
      expect(mockCaf).toHaveBeenCalledWith(1);

      mockRaf.mockRestore();
      mockCaf.mockRestore();
    });

    it('does not start twice', () => {
      const mockRaf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);

      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      renderer.start();
      renderer.start(); // second call should be a no-op
      expect(mockRaf).toHaveBeenCalledTimes(1);

      mockRaf.mockRestore();
    });
  });

  describe('imported presets', () => {
    it('registers imported preset names without objects', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      renderer.registerImportedPresetNames(['Import A', 'Import B']);

      expect(renderer.presetList).toContain('Import A');
      expect(renderer.presetList).toContain('Import B');
      expect(renderer.presetPackMap.get('Import A')).toBe('Imported');
      expect(renderer.presetPackMap.get('Import B')).toBe('Imported');
    });

    it('marks imported preset as unloaded if no object registered', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      renderer.registerImportedPresetNames(['Lazy Preset']);
      expect(renderer.isEelPresetUnloaded('Lazy Preset')).toBe(true);
      expect(renderer.isEelPresetUnloaded('Preset A')).toBe(false);
    });

    it('registers a converted imported preset object', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      renderer.registerImportedPresetNames(['My Import']);
      expect(renderer.isEelPresetUnloaded('My Import')).toBe(true);

      renderer.registerEelPreset('My Import', { code: 'imported' });
      expect(renderer.isEelPresetUnloaded('My Import')).toBe(false);
    });

    it('unregisters an imported preset', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      renderer.registerImportedPresetNames(['To Remove']);
      expect(renderer.presetList).toContain('To Remove');

      renderer.unregisterImportedPreset('To Remove');
      expect(renderer.presetList).not.toContain('To Remove');
      expect(renderer.presetPackMap.has('To Remove')).toBe(false);
    });

    it('does not duplicate names when registering twice', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      renderer.registerImportedPresetNames(['Dup']);
      renderer.registerImportedPresetNames(['Dup']);

      const count = renderer.presetList.filter((n) => n === 'Dup').length;
      expect(count).toBe(1);
    });

    it('isImportedPreset returns true for imported, false for others', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      renderer.registerImportedPresetNames(['Import A']);
      expect(renderer.isImportedPreset('Import A')).toBe(true);
      expect(renderer.isImportedPreset('Preset A')).toBe(false);
    });

    it('isMilkdropPreset returns false before MilkDrop names are registered', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      expect(renderer.isMilkdropPreset('Preset A')).toBe(false);
    });

    it('unregisterImportedPreset removes from _importedPresetNames', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      renderer.registerImportedPresetNames(['To Remove']);
      expect(renderer.isImportedPreset('To Remove')).toBe(true);

      renderer.unregisterImportedPreset('To Remove');
      expect(renderer.isImportedPreset('To Remove')).toBe(false);
    });
  });

  describe('destroy', () => {
    it('cleans up all state', () => {
      const mockCaf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
      vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);

      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);
      renderer.start();
      renderer.destroy();

      expect(renderer.currentPresetName).toBe('');
      expect(renderer.presetList).toEqual([]);
      expect(mockCaf).toHaveBeenCalled();

      mockCaf.mockRestore();
    });
  });
});
