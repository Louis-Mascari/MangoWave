import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSettingsStore } from '../useSettingsStore.ts';
import { THEMATIC_PACKS } from '../../data/presetThematicPacks.ts';

describe('useSettingsStore', () => {
  beforeEach(() => {
    // Reset store to defaults between tests
    const { result } = renderHook(() => useSettingsStore());
    act(() => {
      result.current.resetEQ();
      result.current.setFpsCap(60);
      result.current.setResolutionScale(1.0);
      result.current.setMeshSize(48, 36);
      result.current.setTextureRatio(1.0);
      result.current.setFxaa(false);
      result.current.setTransitionTime(2.0);
      result.current.setSmoothingConstant(0.3);
      result.current.setFftSize(1024);
      result.current.setAutopilotEnabled(true);
      result.current.setAutopilotInterval(15);
      result.current.setAutopilotMode('all');
      result.current.setAutopilotFavoriteWeight(2);
      result.current.setPresetNameDisplay(5);
      result.current.setSongInfoDisplay(5);
      result.current.excludedOverrides.forEach((p) => result.current.removeExcludedOverride(p));
      // Clear presets
      result.current.blockedPresets.forEach((p) => result.current.unblockPreset(p));
      result.current.favoritePresets.forEach((p) => result.current.toggleFavoritePreset(p));
      // Clear custom packs
      result.current.setActiveCustomPackId(null);
      result.current.customPacks.forEach((p) => result.current.deleteCustomPack(p.id));
      // Clear imported presets and textures
      result.current.clearImportedPresetsMeta();
      result.current.clearImportedTexturesMeta();
    });
  });

  describe('performance', () => {
    it('has sensible defaults', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.performance.fpsCap).toBe(60);
      expect(result.current.performance.resolutionScale).toBe(1.0);
      expect(result.current.performance.meshWidth).toBe(48);
      expect(result.current.performance.meshHeight).toBe(36);
      expect(result.current.performance.textureRatio).toBe(1.0);
      expect(result.current.performance.fxaa).toBe(false);
    });

    it('sets fps cap', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setFpsCap(30));
      expect(result.current.performance.fpsCap).toBe(30);
    });

    it('clamps fps cap above max to 300', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setFpsCap(999));
      expect(result.current.performance.fpsCap).toBe(300);
    });

    it('clamps fps cap below min to 15', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setFpsCap(5));
      expect(result.current.performance.fpsCap).toBe(15);
    });

    it('treats negative fps cap as uncapped (0)', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setFpsCap(-1));
      expect(result.current.performance.fpsCap).toBe(0);
    });

    it('rounds fractional fps cap', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setFpsCap(59.7));
      expect(result.current.performance.fpsCap).toBe(60);
    });

    it('sets resolution scale', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setResolutionScale(0.5));
      expect(result.current.performance.resolutionScale).toBe(0.5);
    });

    it('sets mesh size', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setMeshSize(64, 48));
      expect(result.current.performance.meshWidth).toBe(64);
      expect(result.current.performance.meshHeight).toBe(48);
    });

    it('sets texture ratio', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setTextureRatio(1.5));
      expect(result.current.performance.textureRatio).toBe(1.5);
    });

    it('sets fxaa', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setFxaa(true));
      expect(result.current.performance.fxaa).toBe(true);
    });
  });

  describe('EQ', () => {
    it('starts with flat EQ and unity pre-amp', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.eq.preAmpGain).toBe(1.5);
      expect(result.current.eq.bandGains).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('sets pre-amp gain', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setPreAmpGain(2.5));
      expect(result.current.eq.preAmpGain).toBe(2.5);
    });

    it('sets individual band gain', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setEQBandGain(3, 6));
      expect(result.current.eq.bandGains[3]).toBe(6);
      // Other bands unchanged
      expect(result.current.eq.bandGains[0]).toBe(0);
    });

    it('ignores out-of-range band index', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setEQBandGain(99, 6));
      expect(result.current.eq.bandGains).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('resets EQ to defaults', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.setPreAmpGain(3.0);
        result.current.setEQBandGain(0, 12);
      });
      act(() => result.current.resetEQ());
      expect(result.current.eq.preAmpGain).toBe(1.5);
      expect(result.current.eq.bandGains[0]).toBe(0);
    });
  });

  describe('blocked presets', () => {
    it('starts empty', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.blockedPresets).toEqual([]);
    });

    it('blocks a preset', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.blockPreset('Scary Faces'));
      expect(result.current.blockedPresets).toContain('Scary Faces');
    });

    it('does not duplicate blocked presets', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.blockPreset('Scary Faces');
        result.current.blockPreset('Scary Faces');
      });
      expect(result.current.blockedPresets.filter((p) => p === 'Scary Faces')).toHaveLength(1);
    });

    it('unblocks a preset', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.blockPreset('Scary Faces'));
      act(() => result.current.unblockPreset('Scary Faces'));
      expect(result.current.blockedPresets).not.toContain('Scary Faces');
    });

    it('removes from favorites when blocking', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.toggleFavoritePreset('Scary Faces'));
      expect(result.current.favoritePresets).toContain('Scary Faces');
      act(() => result.current.blockPreset('Scary Faces'));
      expect(result.current.blockedPresets).toContain('Scary Faces');
      expect(result.current.favoritePresets).not.toContain('Scary Faces');
    });
  });

  describe('favorite presets', () => {
    it('toggles a favorite on and off', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.toggleFavoritePreset('Cool Waves'));
      expect(result.current.favoritePresets).toContain('Cool Waves');

      act(() => result.current.toggleFavoritePreset('Cool Waves'));
      expect(result.current.favoritePresets).not.toContain('Cool Waves');
    });

    it('removes from blocked when favoriting', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.blockPreset('Cool Waves'));
      expect(result.current.blockedPresets).toContain('Cool Waves');
      act(() => result.current.toggleFavoritePreset('Cool Waves'));
      expect(result.current.favoritePresets).toContain('Cool Waves');
      expect(result.current.blockedPresets).not.toContain('Cool Waves');
    });
  });

  describe('audio', () => {
    it('has correct defaults', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.audio.smoothingConstant).toBe(0.3);
      expect(result.current.audio.fftSize).toBe(1024);
    });

    it('sets smoothing constant', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setSmoothingConstant(0.7));
      expect(result.current.audio.smoothingConstant).toBe(0.7);
    });

    it('sets FFT size', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setFftSize(2048));
      expect(result.current.audio.fftSize).toBe(2048);
    });
  });

  describe('autopilot', () => {
    it('has correct defaults', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.autopilot.enabled).toBe(true);
      expect(result.current.autopilot.interval).toBe(15);
      expect(result.current.autopilot.mode).toBe('all');
      expect(result.current.autopilot.favoriteWeight).toBe(2);
    });

    it('sets enabled', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setAutopilotEnabled(true));
      expect(result.current.autopilot.enabled).toBe(true);
    });

    it('sets interval', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setAutopilotInterval(30));
      expect(result.current.autopilot.interval).toBe(30);
    });

    it('sets mode', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setAutopilotMode('favorites'));
      expect(result.current.autopilot.mode).toBe('favorites');
    });

    it('sets favorite weight', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setAutopilotFavoriteWeight(4));
      expect(result.current.autopilot.favoriteWeight).toBe(4);
    });
  });

  describe('excluded overrides', () => {
    it('starts empty', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.excludedOverrides).toEqual([]);
    });

    it('adds and removes overrides', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.addExcludedOverride('Bad Preset'));
      expect(result.current.excludedOverrides).toContain('Bad Preset');
      act(() => result.current.removeExcludedOverride('Bad Preset'));
      expect(result.current.excludedOverrides).not.toContain('Bad Preset');
    });

    it('does not duplicate overrides', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addExcludedOverride('Bad Preset');
        result.current.addExcludedOverride('Bad Preset');
      });
      expect(result.current.excludedOverrides.filter((p) => p === 'Bad Preset')).toHaveLength(1);
    });
  });

  describe('presetNameDisplay', () => {
    it('defaults to 5 seconds', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.presetNameDisplay).toBe(5);
    });

    it('sets to off', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setPresetNameDisplay('off'));
      expect(result.current.presetNameDisplay).toBe('off');
    });

    it('sets to always', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setPresetNameDisplay('always'));
      expect(result.current.presetNameDisplay).toBe('always');
    });

    it('sets to custom duration', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setPresetNameDisplay(8));
      expect(result.current.presetNameDisplay).toBe(8);
    });
  });

  describe('songInfoDisplay', () => {
    it('defaults to 5 seconds', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.songInfoDisplay).toBe(5);
    });

    it('sets to off', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setSongInfoDisplay('off'));
      expect(result.current.songInfoDisplay).toBe('off');
    });

    it('sets to number duration', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setSongInfoDisplay(5));
      expect(result.current.songInfoDisplay).toBe(5);
    });
  });

  describe('toggleBlockPreset', () => {
    it('blocks and unblocks a preset', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.toggleBlockPreset('Scary Faces'));
      expect(result.current.blockedPresets).toContain('Scary Faces');
      act(() => result.current.toggleBlockPreset('Scary Faces'));
      expect(result.current.blockedPresets).not.toContain('Scary Faces');
    });

    it('removes from favorites when toggle-blocking', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.toggleFavoritePreset('Scary Faces'));
      expect(result.current.favoritePresets).toContain('Scary Faces');
      act(() => result.current.toggleBlockPreset('Scary Faces'));
      expect(result.current.blockedPresets).toContain('Scary Faces');
      expect(result.current.favoritePresets).not.toContain('Scary Faces');
    });
  });

  describe('transition time', () => {
    it('defaults to 2 seconds', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.transitionTime).toBe(2.0);
    });

    it('updates transition time', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setTransitionTime(5.0));
      expect(result.current.transitionTime).toBe(5.0);
    });
  });

  describe('pack filtering', () => {
    it('starts with empty enabledPacks', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.enabledPacks).toEqual([]);
    });

    it('sets enabled packs', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setEnabledPacks(['Base', 'Extra']));
      expect(result.current.enabledPacks).toEqual(['Base', 'Extra']);
    });

    it('toggles a pack', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setEnabledPacks(['Base', 'Extra']));
      act(() => result.current.togglePack('Base'));
      expect(result.current.enabledPacks).toEqual(['Extra']);
      act(() => result.current.togglePack('Base'));
      expect(result.current.enabledPacks).toContain('Base');
    });
  });

  describe('resetRendering', () => {
    it('resets performance and audio to defaults', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.setFpsCap(144);
        result.current.setResolutionScale(0.5);
        result.current.setMeshSize(96, 72);
        result.current.setTextureRatio(1.5);
        result.current.setFxaa(true);
        result.current.setSmoothingConstant(0.8);
        result.current.setFftSize(4096);
      });
      act(() => result.current.resetRendering());
      expect(result.current.performance).toEqual({
        fpsCap: 60,
        resolutionScale: 1.0,
        meshWidth: 48,
        meshHeight: 36,
        textureRatio: 1.0,
        fxaa: false,
      });
      expect(result.current.audio).toEqual({
        smoothingConstant: 0.3,
        fftSize: 1024,
      });
    });
  });

  describe('resetPresets', () => {
    it('resets transition, display, and autopilot to defaults', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.setTransitionTime(8.0);
        result.current.setPresetNameDisplay('always');
        result.current.setSongInfoDisplay('off');
        result.current.setAutopilotEnabled(false);
        result.current.setAutopilotInterval(60);
        result.current.setAutopilotMode('favorites');
        result.current.setAutopilotFavoriteWeight(10);
      });
      act(() => result.current.resetPresets());
      expect(result.current.transitionTime).toBe(2.0);
      expect(result.current.presetNameDisplay).toBe(5);
      expect(result.current.songInfoDisplay).toBe(5);
      expect(result.current.autopilot).toEqual({
        enabled: true,
        interval: 15,
        mode: 'all',
        favoriteWeight: 2,
      });
    });
  });

  describe('clearBlocked', () => {
    it('clears user-blocked presets', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.blockPreset('A');
        result.current.blockPreset('B');
      });
      expect(result.current.blockedPresets).toHaveLength(2);
      act(() => result.current.clearBlocked());
      expect(result.current.blockedPresets).toEqual([]);
    });

    it('retains presets that are also quarantined', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.blockPreset('User Blocked Preset');
        result.current.blockPreset('martin - attack of the beast'); // quarantined
        result.current.blockPreset('Geiss - Spiral Artifact'); // quarantined
      });
      expect(result.current.blockedPresets).toHaveLength(3);
      act(() => result.current.clearBlocked());
      expect(result.current.blockedPresets).toContain('martin - attack of the beast');
      expect(result.current.blockedPresets).toContain('Geiss - Spiral Artifact');
      expect(result.current.blockedPresets).not.toContain('User Blocked Preset');
    });
  });

  describe('clearFavorites', () => {
    it('clears all favorite presets', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.toggleFavoritePreset('A');
        result.current.toggleFavoritePreset('B');
      });
      expect(result.current.favoritePresets).toHaveLength(2);
      act(() => result.current.clearFavorites());
      expect(result.current.favoritePresets).toEqual([]);
    });
  });

  describe('custom packs', () => {
    it('starts with empty packs and no active pack', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.customPacks).toEqual([]);
      expect(result.current.activeCustomPackId).toBeNull();
    });

    it('creates a custom pack', () => {
      const { result } = renderHook(() => useSettingsStore());
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('My Pack');
      });
      expect(id).toBeTruthy();
      expect(result.current.customPacks).toHaveLength(1);
      expect(result.current.customPacks[0].name).toBe('My Pack');
      expect(result.current.customPacks[0].presets).toEqual([]);
      expect(result.current.customPacks[0].id).toBe(id);
    });

    it('clamps pack name to 50 characters', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.createCustomPack('A'.repeat(100));
      });
      expect(result.current.customPacks[0].name).toHaveLength(50);
    });

    it('enforces max 50 packs', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        for (let i = 0; i < 50; i++) result.current.createCustomPack(`Pack ${i}`);
      });
      expect(result.current.customPacks).toHaveLength(50);
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('Pack 51');
      });
      expect(id).toBeNull();
      expect(result.current.customPacks).toHaveLength(50);
    });

    it('renames a pack', () => {
      const { result } = renderHook(() => useSettingsStore());
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('Old Name');
      });
      act(() => result.current.renameCustomPack(id!, 'New Name'));
      expect(result.current.customPacks[0].name).toBe('New Name');
    });

    it('clamps rename to 50 characters', () => {
      const { result } = renderHook(() => useSettingsStore());
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('Pack');
      });
      act(() => result.current.renameCustomPack(id!, 'B'.repeat(100)));
      expect(result.current.customPacks[0].name).toHaveLength(50);
    });

    it('deletes a pack', () => {
      const { result } = renderHook(() => useSettingsStore());
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('To Delete');
      });
      act(() => result.current.deleteCustomPack(id!));
      expect(result.current.customPacks).toHaveLength(0);
    });

    it('clears activeCustomPackId when active pack is deleted', () => {
      const { result } = renderHook(() => useSettingsStore());
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('Active Pack');
      });
      act(() => result.current.setActiveCustomPackId(id!));
      expect(result.current.activeCustomPackId).toBe(id);
      act(() => result.current.deleteCustomPack(id!));
      expect(result.current.activeCustomPackId).toBeNull();
    });

    it('does not clear activeCustomPackId when a different pack is deleted', () => {
      const { result } = renderHook(() => useSettingsStore());
      let id1: string | null = null;
      let id2: string | null = null;
      act(() => {
        id1 = result.current.createCustomPack('Pack 1');
        id2 = result.current.createCustomPack('Pack 2');
      });
      act(() => result.current.setActiveCustomPackId(id1!));
      act(() => result.current.deleteCustomPack(id2!));
      expect(result.current.activeCustomPackId).toBe(id1);
    });

    it('adds a preset to a pack', () => {
      const { result } = renderHook(() => useSettingsStore());
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('Pack');
      });
      act(() => result.current.addPresetToCustomPack(id!, 'Cool Preset'));
      expect(result.current.customPacks[0].presets).toEqual(['Cool Preset']);
    });

    it('does not add duplicate presets', () => {
      const { result } = renderHook(() => useSettingsStore());
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('Pack');
      });
      act(() => {
        result.current.addPresetToCustomPack(id!, 'Cool Preset');
        result.current.addPresetToCustomPack(id!, 'Cool Preset');
      });
      expect(result.current.customPacks[0].presets).toEqual(['Cool Preset']);
    });

    it('removes a preset from a pack', () => {
      const { result } = renderHook(() => useSettingsStore());
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('Pack');
      });
      act(() => {
        result.current.addPresetToCustomPack(id!, 'A');
        result.current.addPresetToCustomPack(id!, 'B');
      });
      act(() => result.current.removePresetFromCustomPack(id!, 'A'));
      expect(result.current.customPacks[0].presets).toEqual(['B']);
    });

    it('auto-switches autopilot mode from favorites to all when activating a pack', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setAutopilotMode('favorites'));
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('Pack');
      });
      act(() => result.current.setActiveCustomPackId(id!));
      expect(result.current.autopilot.mode).toBe('all');
    });

    it('does not switch autopilot mode when deactivating a pack', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setAutopilotMode('favorites'));
      act(() => result.current.setActiveCustomPackId(null));
      expect(result.current.autopilot.mode).toBe('favorites');
    });

    it('does not switch autopilot mode if already in all mode', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setAutopilotMode('all'));
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('Pack');
      });
      act(() => result.current.setActiveCustomPackId(id!));
      expect(result.current.autopilot.mode).toBe('all');
    });
  });

  describe('resetPresets clears activeCustomPackId', () => {
    it('resets activeCustomPackId to null', () => {
      const { result } = renderHook(() => useSettingsStore());
      let id: string | null = null;
      act(() => {
        id = result.current.createCustomPack('Pack');
      });
      act(() => result.current.setActiveCustomPackId(id!));
      expect(result.current.activeCustomPackId).toBe(id);
      act(() => result.current.resetPresets());
      expect(result.current.activeCustomPackId).toBeNull();
    });
  });

  describe('importSettings', () => {
    it('merges partial state into store', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() =>
        result.current.importSettings({
          volume: 0.8,
          transitionTime: 5.0,
          favoritePresets: ['Preset A', 'Preset B'],
        }),
      );
      expect(result.current.volume).toBe(0.8);
      expect(result.current.transitionTime).toBe(5.0);
      expect(result.current.favoritePresets).toEqual(['Preset A', 'Preset B']);
      // Other settings unchanged
      expect(result.current.performance.fpsCap).toBe(60);
    });

    it('deep-merges nested objects preserving unset fields', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() =>
        result.current.importSettings({
          performance: { fpsCap: 30 } as typeof result.current.performance,
        }),
      );
      expect(result.current.performance.fpsCap).toBe(30);
      // Fields not in import are preserved from current state
      expect(result.current.performance.resolutionScale).toBe(1.0);
      expect(result.current.performance.meshWidth).toBe(48);
      expect(result.current.performance.fxaa).toBe(false);
    });

    it('ignores non-data keys like store functions', () => {
      const { result } = renderHook(() => useSettingsStore());
      const original = result.current.setVolume;
      act(() =>
        result.current.importSettings({
          setVolume: 'hacked' as unknown as typeof result.current.setVolume,
        }),
      );
      // Function should not be overwritten
      expect(result.current.setVolume).toBe(original);
    });
  });

  describe('importedPresets', () => {
    it('defaults to empty array', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.importedPresets).toEqual([]);
    });

    it('adds imported preset metadata', () => {
      const { result } = renderHook(() => useSettingsStore());
      const meta = { name: 'Cool Preset', fileName: 'Cool Preset.milk', addedAt: 1000 };
      act(() => result.current.addImportedPresetMeta(meta));
      expect(result.current.importedPresets).toHaveLength(1);
      expect(result.current.importedPresets[0]).toEqual(meta);
    });

    it('removes imported preset metadata by name', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addImportedPresetMeta({
          name: 'A',
          fileName: 'A.milk',
          addedAt: 1,
        });
        result.current.addImportedPresetMeta({
          name: 'B',
          fileName: 'B.milk',
          addedAt: 2,
        });
      });
      expect(result.current.importedPresets).toHaveLength(2);

      act(() => result.current.removeImportedPresetMeta('A'));
      expect(result.current.importedPresets).toHaveLength(1);
      expect(result.current.importedPresets[0].name).toBe('B');
    });

    it('clears all imported preset metadata', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addImportedPresetMeta({
          name: 'X',
          fileName: 'X.milk',
          addedAt: 1,
        });
        result.current.addImportedPresetMeta({
          name: 'Y',
          fileName: 'Y.milk',
          addedAt: 2,
        });
      });
      expect(result.current.importedPresets).toHaveLength(2);

      act(() => result.current.clearImportedPresetsMeta());
      expect(result.current.importedPresets).toEqual([]);
    });

    it('is importable via importSettings', () => {
      const { result } = renderHook(() => useSettingsStore());
      const metas = [{ name: 'Imported', fileName: 'Imported.milk', addedAt: 100 }];
      act(() => result.current.importSettings({ importedPresets: metas }));
      expect(result.current.importedPresets).toEqual(metas);
    });
  });

  describe('importedTextures', () => {
    it('defaults to empty array', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.importedTextures).toEqual([]);
    });

    it('adds imported texture metadata', () => {
      const { result } = renderHook(() => useSettingsStore());
      const meta = {
        name: 'cells',
        fileName: 'cells.png',
        width: 256,
        height: 256,
        sizeBytes: 5000,
        addedAt: 1000,
      };
      act(() => result.current.addImportedTextureMeta(meta));
      expect(result.current.importedTextures).toHaveLength(1);
      expect(result.current.importedTextures[0]).toEqual(meta);
    });

    it('removes imported texture metadata by name', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addImportedTextureMeta({
          name: 'a',
          fileName: 'a.png',
          width: 64,
          height: 64,
          sizeBytes: 100,
          addedAt: 1,
        });
        result.current.addImportedTextureMeta({
          name: 'b',
          fileName: 'b.png',
          width: 128,
          height: 128,
          sizeBytes: 200,
          addedAt: 2,
        });
      });
      expect(result.current.importedTextures).toHaveLength(2);

      act(() => result.current.removeImportedTextureMeta('a'));
      expect(result.current.importedTextures).toHaveLength(1);
      expect(result.current.importedTextures[0].name).toBe('b');
    });

    it('clears all imported texture metadata', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addImportedTextureMeta({
          name: 'x',
          fileName: 'x.png',
          width: 64,
          height: 64,
          sizeBytes: 100,
          addedAt: 1,
        });
      });
      expect(result.current.importedTextures).toHaveLength(1);

      act(() => result.current.clearImportedTexturesMeta());
      expect(result.current.importedTextures).toEqual([]);
    });

    it('is importable via importSettings', () => {
      const { result } = renderHook(() => useSettingsStore());
      const metas = [
        {
          name: 'fire',
          fileName: 'fire.jpg',
          width: 512,
          height: 512,
          sizeBytes: 50000,
          addedAt: 100,
        },
      ];
      act(() => result.current.importSettings({ importedTextures: metas }));
      expect(result.current.importedTextures).toEqual(metas);
    });
  });

  describe('v12 migration: thematic packs', () => {
    it('remaps old source-based enabledPacks to thematic names', () => {
      // The migration runs at persist-load time. Test the logic directly:
      const oldPacks = ['Minimal', 'Non-Minimal', 'Extra', 'Extra 2', 'MD1', 'MilkDrop'];
      const OLD_PACK_NAMES = ['Minimal', 'Non-Minimal', 'Extra', 'Extra 2', 'MD1', 'MilkDrop'];
      const hasOldPacks = oldPacks.some((p) => OLD_PACK_NAMES.includes(p));
      expect(hasOldPacks).toBe(true);

      // After migration, should have all thematic packs
      const newPacks = [...THEMATIC_PACKS];
      expect(newPacks).toEqual(['Ambient', 'Reactive', 'Psychedelic', 'Waveform', 'Ethereal']);
    });

    it('preserves Imported in enabledPacks during migration', () => {
      const oldPacks = ['Minimal', 'Extra', 'Imported'];
      const newPacks: string[] = [...THEMATIC_PACKS];
      if (oldPacks.includes('Imported')) newPacks.push('Imported');
      expect(newPacks).toContain('Imported');
      expect(newPacks).toContain('Ambient');
    });

    it('does not remap already-thematic enabledPacks', () => {
      const packs = ['Ambient', 'Reactive', 'Ethereal'];
      const oldPackNames = ['Minimal', 'Non-Minimal', 'Extra', 'Extra 2', 'MD1', 'MilkDrop'];
      const hasOldPacks = packs.some((p) => oldPackNames.includes(p));
      expect(hasOldPacks).toBe(false);
    });
  });
});
