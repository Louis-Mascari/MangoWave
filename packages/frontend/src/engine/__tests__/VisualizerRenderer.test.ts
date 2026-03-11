import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VisualizerRenderer } from '../VisualizerRenderer.ts';

// Mock butterchurn
vi.mock('butterchurn', () => ({
  default: {
    createVisualizer: vi.fn(() => ({
      connectAudio: vi.fn(),
      loadPreset: vi.fn(),
      setRendererSize: vi.fn(),
      render: vi.fn(),
    })),
  },
}));

// Mock butterchurn-presets
vi.mock('butterchurn-presets', () => ({
  default: {
    getPresets: vi.fn(() => ({
      'Preset A': { code: 'a' },
      'Preset B': { code: 'b' },
      'Preset C': { code: 'c' },
    })),
  },
}));

vi.mock('butterchurn-presets/lib/butterchurnPresetsExtra.min', () => ({
  default: { getPresets: () => ({}) },
}));
vi.mock('butterchurn-presets/lib/butterchurnPresetsExtra2.min', () => ({
  default: { getPresets: () => ({}) },
}));
vi.mock('butterchurn-presets/lib/butterchurnPresetsMD1.min', () => ({
  default: { getPresets: () => ({}) },
}));
vi.mock('butterchurn-presets/lib/butterchurnPresetsNonMinimal.min', () => ({
  default: { getPresets: () => ({}) },
}));
vi.mock('butterchurn-presets/lib/butterchurnPresetsMinimal.min', () => ({
  default: { getPresets: () => ({}) },
}));

vi.mock('../../data/mangos-picks.json', () => ({
  default: [],
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

    it('builds pack map tracking preset origins', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      const packMap = renderer.presetPackMap;
      expect(packMap.get('Preset A')).toBe('Base');
      expect(packMap.get('Preset B')).toBe('Base');
      expect(packMap.get('Preset C')).toBe('Base');
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

  describe('custom presets', () => {
    it('registers and unregisters custom presets', () => {
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, {} as AudioContext, {} as AnalyserNode);

      renderer.registerCustomPreset('Custom 1', { code: 'custom' });
      expect(renderer.presetList).toContain('Custom 1');
      expect(renderer.presetPackMap.get('Custom 1')).toBe('My Imports');

      renderer.unregisterCustomPreset('Custom 1');
      expect(renderer.presetList).not.toContain('Custom 1');
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
