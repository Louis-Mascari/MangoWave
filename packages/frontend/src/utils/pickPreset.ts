export interface PickPresetResult {
  pick: string;
  roundReset: boolean;
}

/**
 * Pure preset selection with shuffle-style exhaustion and weighted favorites.
 *
 * Returns the chosen preset and whether the round was reset (all presets exhausted).
 * Returns null if the pool is empty.
 */
export function pickPreset(
  pool: string[],
  playedSet: Set<string>,
  favoritePresets: string[],
  mode: 'all' | 'favorites',
  favoriteWeight: number,
): PickPresetResult | null {
  if (pool.length === 0) return null;

  // Shuffle: exclude already-played presets this round
  let available = pool.filter((p) => !playedSet.has(p));
  let roundReset = false;
  if (available.length === 0) {
    roundReset = true;
    available = pool;
  }

  // Weighted selection: in 'all' mode, each favorite gets `weight`x the chance of a non-favorite.
  let pick: string;
  if (mode !== 'favorites') {
    const favSet = new Set(favoritePresets);
    const favCount = available.filter((p) => favSet.has(p)).length;
    const nonFavCount = available.length - favCount;
    const totalWeight = favCount * favoriteWeight + nonFavCount;
    const favGroupProb = (favCount * favoriteWeight) / totalWeight;

    if (favCount > 0 && Math.random() < favGroupProb) {
      const favAvailable = available.filter((p) => favSet.has(p));
      pick = favAvailable[Math.floor(Math.random() * favAvailable.length)];
    } else {
      const nonFav = available.filter((p) => !favSet.has(p));
      pick =
        nonFav.length > 0
          ? nonFav[Math.floor(Math.random() * nonFav.length)]
          : available[Math.floor(Math.random() * available.length)];
    }
  } else {
    pick = available[Math.floor(Math.random() * available.length)];
  }

  return { pick, roundReset };
}
