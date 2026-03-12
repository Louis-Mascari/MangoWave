import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSettingsStore } from '../useSettingsStore.ts';

describe('useSettingsStore', () => {
  beforeEach(() => {
    // Reset store to defaults between tests
    const { result } = renderHook(() => useSettingsStore());
    act(() => {
      result.current.resetEQ();
      result.current.setFpsCap(0);
      result.current.setResolutionScale(1.0);
      result.current.setTransitionTime(2.0);
      result.current.setSmoothingConstant(0.3);
      result.current.setFftSize(1024);
      result.current.setAutopilotEnabled(true);
      result.current.setAutopilotInterval(15);
      result.current.setAutopilotMode('all');
      result.current.setAutopilotFavoriteWeight(2);
      result.current.setPresetNameDisplay(5);
      result.current.setSongInfoDisplay(5);
      result.current.setShowQuarantined(false);
      // Clear presets
      result.current.blockedPresets.forEach((p) => result.current.unblockPreset(p));
      result.current.favoritePresets.forEach((p) => result.current.toggleFavoritePreset(p));
    });
  });

  describe('performance', () => {
    it('has sensible defaults', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.performance.fpsCap).toBe(0);
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
      expect(result.current.eq.preAmpGain).toBe(1.0);
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
      expect(result.current.eq.preAmpGain).toBe(1.0);
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

  describe('quarantine', () => {
    it('defaults to hidden', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.showQuarantined).toBe(false);
    });

    it('toggles show quarantined', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setShowQuarantined(true));
      expect(result.current.showQuarantined).toBe(true);
    });

    it('manages quarantine overrides', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.addQuarantineOverride('Bad Preset'));
      expect(result.current.quarantineOverrides).toContain('Bad Preset');
      act(() => result.current.removeQuarantineOverride('Bad Preset'));
      expect(result.current.quarantineOverrides).not.toContain('Bad Preset');
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

    it('sets to always', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setSongInfoDisplay('always'));
      expect(result.current.songInfoDisplay).toBe('always');
    });

    it('sets to custom duration', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.setSongInfoDisplay(8));
      expect(result.current.songInfoDisplay).toBe(8);
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
      expect(result.current.performance.fpsCap).toBe(0);
    });
  });
});
