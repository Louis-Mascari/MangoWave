import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pickPreset } from '../pickPreset';

describe('pickPreset', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mathRandomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    mathRandomSpy.mockRestore();
  });

  it('returns null for an empty pool', () => {
    expect(pickPreset([], new Set(), [], 'all', 1)).toBeNull();
  });

  it('picks from available presets excluding played ones', () => {
    mathRandomSpy.mockReturnValue(0);
    const result = pickPreset(['a', 'b', 'c'], new Set(['a']), [], 'all', 1);
    expect(result).toEqual({ pick: 'b', roundReset: false });
  });

  it('resets round when all presets are played', () => {
    mathRandomSpy.mockReturnValue(0);
    const result = pickPreset(['a', 'b'], new Set(['a', 'b']), [], 'all', 1);
    expect(result).toEqual({ pick: 'a', roundReset: true });
  });

  it('shuffle exhaustion: N presets -> N unique picks -> round resets', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'];
    const played = new Set<string>();
    const picks: string[] = [];

    for (let i = 0; i < pool.length; i++) {
      mathRandomSpy.mockReturnValue(0);
      const result = pickPreset(pool, played, [], 'all', 1);
      expect(result).not.toBeNull();
      expect(result!.roundReset).toBe(false);
      picks.push(result!.pick);
      played.add(result!.pick);
    }

    // All presets should have been picked exactly once
    expect(new Set(picks).size).toBe(pool.length);

    // Next pick should trigger round reset
    mathRandomSpy.mockReturnValue(0);
    const resetResult = pickPreset(pool, played, [], 'all', 1);
    expect(resetResult!.roundReset).toBe(true);
  });

  it('single-preset pool: picks it, resets on second call', () => {
    mathRandomSpy.mockReturnValue(0);
    const first = pickPreset(['only'], new Set(), [], 'all', 1);
    expect(first).toEqual({ pick: 'only', roundReset: false });

    const second = pickPreset(['only'], new Set(['only']), [], 'all', 1);
    expect(second).toEqual({ pick: 'only', roundReset: true });
  });

  it('favorites-only mode: ignores weight, picks uniformly from pool', () => {
    // In favorites mode the pool is already filtered to favorites by the caller,
    // so pickPreset just picks uniformly from the pool
    mathRandomSpy.mockReturnValue(0.99);
    const result = pickPreset(
      ['fav1', 'fav2', 'fav3'],
      new Set(),
      ['fav1', 'fav2'],
      'favorites',
      10,
    );
    expect(result).not.toBeNull();
    expect(['fav1', 'fav2', 'fav3']).toContain(result!.pick);
  });

  it('weighted favorites in all mode: favorites appear more often', () => {
    // Statistical test: with weight=10, 2 favorites and 8 non-favorites,
    // favorites should appear ~71.4% of the time (20/28)
    mathRandomSpy.mockRestore();
    const pool = ['f1', 'f2', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'];
    const favorites = ['f1', 'f2'];
    const weight = 10;
    const iterations = 10000;
    let favPicks = 0;

    for (let i = 0; i < iterations; i++) {
      const result = pickPreset(pool, new Set(), favorites, 'all', weight);
      if (favorites.includes(result!.pick)) favPicks++;
    }

    const favRate = favPicks / iterations;
    // Expected: 20/28 ≈ 0.714, allow ±0.05
    expect(favRate).toBeGreaterThan(0.65);
    expect(favRate).toBeLessThan(0.78);
  });

  it('weighted favorites: weight=1 gives roughly uniform distribution', () => {
    mathRandomSpy.mockRestore();
    const pool = ['f1', 'n1', 'n2', 'n3', 'n4'];
    const favorites = ['f1'];
    const iterations = 10000;
    let favPicks = 0;

    for (let i = 0; i < iterations; i++) {
      const result = pickPreset(pool, new Set(), favorites, 'all', 1);
      if (favorites.includes(result!.pick)) favPicks++;
    }

    const favRate = favPicks / iterations;
    // Expected: 1/5 = 0.2, allow ±0.05
    expect(favRate).toBeGreaterThan(0.15);
    expect(favRate).toBeLessThan(0.25);
  });

  it('all non-favorites available: picks from non-favorites when random exceeds favGroupProb', () => {
    // Force random to return 0.99 (above any favGroupProb with weight=1)
    mathRandomSpy.mockReturnValue(0.99);
    const result = pickPreset(['fav', 'nonfav'], new Set(), ['fav'], 'all', 1);
    expect(result!.pick).toBe('nonfav');
  });

  it('all favorites in pool: falls back to available when nonFav is empty', () => {
    mathRandomSpy.mockReturnValue(0.99);
    // Even though random > favGroupProb, nonFav is empty so it falls back to available
    const result = pickPreset(['fav1', 'fav2'], new Set(), ['fav1', 'fav2'], 'all', 1);
    expect(result).not.toBeNull();
    expect(['fav1', 'fav2']).toContain(result!.pick);
  });
});
