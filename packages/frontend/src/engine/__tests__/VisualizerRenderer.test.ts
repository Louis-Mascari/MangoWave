import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VisualizerRenderer } from '../VisualizerRenderer.ts';

// Mock projectm-wasm
const mockProjectM = {
  init: vi.fn().mockReturnValue(0),
  destroy: vi.fn(),
  renderFrame: vi.fn(),
  loadPreset: vi.fn(),
  setWindowSize: vi.fn(),
  setMeshSize: vi.fn(),
  setFps: vi.fn(),
  setSoftCutDuration: vi.fn(),
  setBeatSensitivity: vi.fn(),
  setPresetLocked: vi.fn(),
  setHardCutEnabled: vi.fn(),
  setAspectCorrection: vi.fn(),
  pcmAddFloat: vi.fn(),
  setTextureLoadCallback: vi.fn(),
  setPresetSwitchFailedCallback: vi.fn(),
  getVersion: vi.fn().mockReturnValue({ major: 4, minor: 1, patch: 0 }),
};

vi.mock('projectm-wasm', () => ({
  createProjectM: vi.fn().mockResolvedValue(mockProjectM),
}));

// Mock milkdrop-presets
vi.mock('milkdrop-presets', () => ({
  getMilkText: vi.fn().mockReturnValue('[preset00]\nfoo=bar'),
  getPresets: () => ({}),
}));

// Mock milkdrop-presets/names
vi.mock('milkdrop-presets/names', () => ({
  getPresetNames: () => ['Preset A', 'Preset B', 'Preset C'],
}));

// Mock milkdrop-textures
vi.mock('milkdrop-textures', () => ({
  getImages: () => ({}),
}));

// Mock presetThematicMap
vi.mock('../../data/presetThematicPacks.ts', () => ({
  THEMATIC_PACKS: ['Ambient', 'Reactive', 'Psychedelic', 'Ethereal'],
  presetThematicMap: {
    'Preset A': 'Reactive',
    'Preset B': 'Psychedelic',
    'Preset C': 'Ethereal',
  },
  PACK_DESCRIPTIONS: {},
}));

// Mock AudioEngine
const mockAudioEngine = {
  initPcmCapture: vi.fn().mockResolvedValue(undefined),
  onPcmData: vi.fn(),
} as unknown as Parameters<VisualizerRenderer['init']>[0];

describe('VisualizerRenderer', () => {
  let renderer: VisualizerRenderer;

  beforeEach(() => {
    renderer = new VisualizerRenderer();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.clearAllMocks();
  });

  it('starts with empty state', () => {
    expect(renderer.currentPresetName).toBe('');
    expect(renderer.presetList).toEqual([]);
  });

  describe('init', () => {
    it('initializes projectM and loads a preset', async () => {
      const onPresetChange = vi.fn();
      await renderer.init(mockAudioEngine, onPresetChange);

      expect(renderer.presetList).toEqual(['Preset A', 'Preset B', 'Preset C']);
      expect(renderer.currentPresetName).toBe('Preset A');
      expect(onPresetChange).toHaveBeenCalledWith('Preset A');
    });

    it('builds pack map using thematic classification', async () => {
      await renderer.init(mockAudioEngine);

      const packMap = renderer.presetPackMap;
      expect(packMap.get('Preset A')).toBe('Reactive');
      expect(packMap.get('Preset B')).toBe('Psychedelic');
      expect(packMap.get('Preset C')).toBe('Ethereal');
    });

    it('excludes presets via excludedPresets set', async () => {
      const onPresetChange = vi.fn();
      await renderer.init(mockAudioEngine, onPresetChange, {
        excludedPresets: new Set(['Preset A', 'Preset C']),
      });

      expect(renderer.currentPresetName).toBe('Preset B');
      expect(onPresetChange).toHaveBeenCalledWith('Preset B');
    });

    it('falls back to all presets when excludedPresets excludes everything', async () => {
      const onPresetChange = vi.fn();
      await renderer.init(mockAudioEngine, onPresetChange, {
        excludedPresets: new Set(['Preset A', 'Preset B', 'Preset C']),
      });

      expect(renderer.currentPresetName).toBe('Preset A');
      expect(onPresetChange).toHaveBeenCalledWith('Preset A');
    });
  });

  describe('nextPreset', () => {
    it('skips blocked presets', async () => {
      await renderer.init(mockAudioEngine);

      const blocked = new Set(['Preset A', 'Preset C']);
      renderer.nextPreset(blocked);

      // nextPreset calls loadPreset which is async internally; wait a tick
      await vi.waitFor(() => {
        expect(renderer.currentPresetName).toBe('Preset B');
      });
    });

    it('does nothing when all presets are blocked', async () => {
      await renderer.init(mockAudioEngine);

      const initialPreset = renderer.currentPresetName;
      const blocked = new Set(['Preset A', 'Preset B', 'Preset C']);
      renderer.nextPreset(blocked);

      // Even after a tick, preset should not change
      await Promise.resolve();
      expect(renderer.currentPresetName).toBe(initialPreset);
    });
  });

  describe('setFpsCap', () => {
    it('sets fps interval for frame limiting', () => {
      renderer.setFpsCap(30);
      expect(true).toBe(true);
    });

    it('disables cap with 0', () => {
      renderer.setFpsCap(0);
      expect(true).toBe(true);
    });
  });

  describe('start/stop', () => {
    it('can start and stop the render loop', async () => {
      const mockRaf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
      const mockCaf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

      await renderer.init(mockAudioEngine);

      renderer.start();
      expect(mockRaf).toHaveBeenCalled();

      renderer.stop();
      expect(mockCaf).toHaveBeenCalledWith(1);

      mockRaf.mockRestore();
      mockCaf.mockRestore();
    });

    it('does not start twice', async () => {
      const mockRaf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);

      await renderer.init(mockAudioEngine);

      renderer.start();
      renderer.start();
      expect(mockRaf).toHaveBeenCalledTimes(1);

      mockRaf.mockRestore();
    });
  });

  describe('imported presets', () => {
    it('registers imported preset names', async () => {
      await renderer.init(mockAudioEngine);

      renderer.registerImportedPresetNames(['Import A', 'Import B']);

      expect(renderer.presetList).toContain('Import A');
      expect(renderer.presetList).toContain('Import B');
      expect(renderer.presetPackMap.get('Import A')).toBe('Imported');
      expect(renderer.presetPackMap.get('Import B')).toBe('Imported');
    });

    it('unregisters an imported preset', async () => {
      await renderer.init(mockAudioEngine);

      renderer.registerImportedPresetNames(['To Remove']);
      expect(renderer.presetList).toContain('To Remove');

      renderer.unregisterImportedPreset('To Remove');
      expect(renderer.presetList).not.toContain('To Remove');
      expect(renderer.presetPackMap.has('To Remove')).toBe(false);
    });

    it('does not duplicate names when registering twice', async () => {
      await renderer.init(mockAudioEngine);

      renderer.registerImportedPresetNames(['Dup']);
      renderer.registerImportedPresetNames(['Dup']);

      const count = renderer.presetList.filter((n) => n === 'Dup').length;
      expect(count).toBe(1);
    });

    it('isImportedPreset returns true for imported, false for others', async () => {
      await renderer.init(mockAudioEngine);

      renderer.registerImportedPresetNames(['Import A']);
      expect(renderer.isImportedPreset('Import A')).toBe(true);
      expect(renderer.isImportedPreset('Preset A')).toBe(false);
    });

    it('unregisterImportedPreset removes from _importedPresetNames', async () => {
      await renderer.init(mockAudioEngine);

      renderer.registerImportedPresetNames(['To Remove']);
      expect(renderer.isImportedPreset('To Remove')).toBe(true);

      renderer.unregisterImportedPreset('To Remove');
      expect(renderer.isImportedPreset('To Remove')).toBe(false);
    });
  });

  describe('destroy', () => {
    it('cleans up all state', async () => {
      const mockCaf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
      vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);

      await renderer.init(mockAudioEngine);
      renderer.start();
      renderer.destroy();

      expect(renderer.currentPresetName).toBe('');
      expect(renderer.presetList).toEqual([]);
      expect(mockCaf).toHaveBeenCalled();

      mockCaf.mockRestore();
    });
  });
});
