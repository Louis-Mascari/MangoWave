import { describe, it, expect } from 'vitest';
import { migrateSettings, useSettingsStore } from '../useSettingsStore.ts';
import { THEMATIC_PACKS } from '../../data/presetThematicPacks.ts';

// migrateSettings mutates its input, so every case builds a fresh object
const migrate = (state: Record<string, unknown>, version: number | undefined) =>
  migrateSettings(structuredClone(state), version) as unknown as Record<string, unknown>;

describe('migrateSettings', () => {
  it('covers every version up to the one the store persists', () => {
    // Adding a migration means bumping the version and adding a case below
    expect(useSettingsStore.persist.getOptions().version).toBe(17);
  });

  it('is the function the store actually migrates with', () => {
    expect(useSettingsStore.persist.getOptions().migrate).toBe(migrateSettings);
  });

  it('v0: turns favoritesOnly into a mode and drops removed pack fields', () => {
    const fromFavorites = migrate({ autopilot: { favoritesOnly: true, packId: 'x' } }, 0);
    expect(fromFavorites.autopilot).toEqual({ mode: 'favorites', favoriteWeight: 2 });

    const fromAll = migrate({ autopilot: { favoritesOnly: false } }, undefined);
    expect(fromAll.autopilot).toEqual({ mode: 'all', favoriteWeight: 2 });

    const fromPack = migrate({ autopilot: { mode: 'pack', packId: 'x' } }, 0);
    expect(fromPack.autopilot).toEqual({ mode: 'all' });
  });

  it('v1: backfills renderer settings without overwriting existing ones', () => {
    const { performance } = migrate({ performance: { fpsCap: 60, meshWidth: 64 } }, 1);
    expect(performance).toMatchObject({
      fpsCap: 60,
      meshWidth: 64,
      meshHeight: 36,
      textureRatio: 1.0,
      fxaa: false,
    });
  });

  it("v2: converts the removed songInfoDisplay 'always' to 5 seconds", () => {
    expect(migrate({ songInfoDisplay: 'always' }, 2).songInfoDisplay).toBe(5);
    expect(migrate({ songInfoDisplay: 'off' }, 2).songInfoDisplay).toBe('off');
  });

  it('v4: resets the old mobile preset to desktop defaults and leaves other settings alone', () => {
    const mobile = {
      fpsCap: 30,
      resolutionScale: 0.75,
      meshWidth: 32,
      meshHeight: 24,
      textureRatio: 0.5,
    };
    const reset = migrate({ performance: mobile, mobileNoticeShown: true }, 4);
    expect(reset).not.toHaveProperty('mobileNoticeShown');
    expect(reset.performance).toMatchObject({ fpsCap: 60, meshWidth: 48, meshHeight: 36 });

    const custom = migrate({ performance: { ...mobile, fpsCap: 45 } }, 4);
    expect(custom.performance).toMatchObject({ fpsCap: 45, meshWidth: 32 });
  });

  it('v5: renames quarantineOverrides and drops showQuarantined', () => {
    const state = migrate({ quarantineOverrides: ['a'], showQuarantined: true }, 5);
    expect(state.excludedOverrides).toEqual(['a']);
    expect(state).not.toHaveProperty('quarantineOverrides');
    expect(state).not.toHaveProperty('showQuarantined');
  });

  it('v6 to v10: adds sync, custom pack and import fields with safe defaults', () => {
    const state = migrate({}, 6);
    expect(state).toMatchObject({
      windowSyncEnabled: false,
      syncPerformance: true,
      customPacks: [],
      activeCustomPackId: null,
      importedPresets: [],
      importedTextures: [],
    });
  });

  it('v6 to v10: keeps values the user already has', () => {
    const pack = { id: 'p', name: 'Mine', presets: ['a'], createdAt: 1 };
    const state = migrate({ windowSyncEnabled: true, customPacks: [pack] }, 6);
    expect(state.windowSyncEnabled).toBe(true);
    expect(state.customPacks).toEqual([pack]);
  });

  it('v10: adds the MilkDrop pack to an existing selection, which v11 then remaps', () => {
    // 'Imported' alone has no old pack name, so only the v10 step can change it
    expect(migrate({ enabledPacks: ['Imported'] }, 10).enabledPacks).toEqual([
      ...THEMATIC_PACKS,
      'Imported',
    ]);
    expect(migrate({ enabledPacks: ['Imported'] }, 11).enabledPacks).toEqual(['Imported']);
  });

  it('v4: only the exact old mobile preset is reset', () => {
    const almost = { fpsCap: 30, resolutionScale: 0.75, meshWidth: 32, meshHeight: 24 };
    const state = migrate({ performance: { ...almost, textureRatio: 1.0 } }, 4);
    expect(state.performance).toMatchObject({ ...almost, textureRatio: 1.0 });
  });

  it('v11: replaces the old source-based pack names with every thematic pack', () => {
    const state = migrate({ enabledPacks: ['Minimal', 'MD1', 'Imported'] }, 11);
    expect(state.enabledPacks).toEqual([...THEMATIC_PACKS, 'Imported']);
  });

  it('v11: leaves an empty or already-thematic pack list alone', () => {
    expect(migrate({ enabledPacks: [] }, 11).enabledPacks).toEqual([]);
    expect(migrate({ enabledPacks: ['Ambient'] }, 11).enabledPacks).toEqual(['Ambient']);
  });

  it('v12 to v16: adds brightness, device sync, Auto Quality and Auto Gain', () => {
    const state = migrate({ performance: { fpsCap: 60 }, eq: { preAmpGain: 2 } }, 12);
    expect(state).toMatchObject({
      brightness: 1.0,
      deviceSyncEnabled: false,
      deviceSyncSettingsSync: false,
      performance: { fpsCap: 60, autoQuality: true },
      eq: { preAmpGain: 2, autoGain: true },
    });
  });

  it('v12 to v16: does not turn an explicit off back on', () => {
    const state = migrate(
      { brightness: 0.4, performance: { autoQuality: false }, eq: { autoGain: false } },
      12,
    );
    expect(state).toMatchObject({
      brightness: 0.4,
      performance: { autoQuality: false },
      eq: { autoGain: false },
    });
  });

  it('upgrades the oldest persisted shape all the way without throwing', () => {
    const ancient = {
      autopilot: { enabled: true, interval: 15, favoritesOnly: false },
      performance: { fpsCap: 60, resolutionScale: 1 },
      eq: { preAmpGain: 1.5, bandGains: Array(10).fill(0) },
      enabledPacks: ['Minimal', 'Non-Minimal'],
      songInfoDisplay: 'always',
      quarantineOverrides: [],
    };
    const state = migrate(ancient, 0);
    expect(state).toMatchObject({
      autopilot: { enabled: true, interval: 15, mode: 'all', favoriteWeight: 2 },
      performance: { fpsCap: 60, meshWidth: 48, autoQuality: true },
      eq: { preAmpGain: 1.5, autoGain: true },
      enabledPacks: [...THEMATIC_PACKS],
      songInfoDisplay: 5,
      excludedOverrides: [],
      customPacks: [],
      brightness: 1.0,
    });
  });

  it('is a no-op for state already at the current version', () => {
    const current = { brightness: 0.7, enabledPacks: ['Ambient'], eq: { autoGain: false } };
    expect(migrate(current, 17)).toEqual(current);
  });

  it('survives persisted state with whole sections missing', () => {
    expect(() => migrate({}, 0)).not.toThrow();
    expect(() => migrate({ performance: undefined, eq: undefined }, 3)).not.toThrow();
  });
});
