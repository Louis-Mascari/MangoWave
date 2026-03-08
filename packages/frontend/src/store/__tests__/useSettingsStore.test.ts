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
  });

  describe('favorite presets', () => {
    it('toggles a favorite on and off', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => result.current.toggleFavoritePreset('Cool Waves'));
      expect(result.current.favoritePresets).toContain('Cool Waves');

      act(() => result.current.toggleFavoritePreset('Cool Waves'));
      expect(result.current.favoritePresets).not.toContain('Cool Waves');
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
});
