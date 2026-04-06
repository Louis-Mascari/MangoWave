import type { VisualizerRenderer } from './VisualizerRenderer.ts';
import { useImportedPresetsStore } from '../store/useImportedPresetsStore.ts';

/**
 * Check if a dynamic import error is due to a stale deployment (old HTML referencing
 * chunk hashes that no longer exist on the CDN). Triggers a one-time page reload.
 */
const RELOAD_KEY = 'mw-chunk-reload';
function handleStaleChunkError(err: unknown): void {
  if (
    err instanceof TypeError &&
    err.message.includes('dynamically imported module') &&
    !sessionStorage.getItem(RELOAD_KEY)
  ) {
    sessionStorage.setItem(RELOAD_KEY, '1');
    window.location.reload();
  }
}

/**
 * Lazily load and register an EEL preset (imported or MilkDrop) with the renderer
 * if it hasn't been loaded yet. Returns true if the preset is ready to display.
 */
export async function ensurePresetLoaded(
  renderer: VisualizerRenderer,
  name: string,
): Promise<boolean> {
  if (!renderer.isEelPresetUnloaded(name)) return true;

  let preset: object | null = null;
  try {
    if (renderer.isImportedPreset(name)) {
      preset = await useImportedPresetsStore.getState().getConvertedPreset(name);
    } else if (renderer.isMilkdropPreset(name)) {
      const { loadMilkdropPreset } = await import('./milkdropPresetsLoader.ts');
      preset = await loadMilkdropPreset(name);
    }
  } catch (err) {
    handleStaleChunkError(err);
    return false;
  }

  if (!preset) return false;
  renderer.registerEelPreset(name, preset);
  return true;
}
