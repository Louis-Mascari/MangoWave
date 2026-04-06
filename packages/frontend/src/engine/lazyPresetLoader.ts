import type { VisualizerRenderer } from './VisualizerRenderer.ts';
import { useImportedPresetsStore } from '../store/useImportedPresetsStore.ts';

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
  if (renderer.isImportedPreset(name)) {
    preset = await useImportedPresetsStore.getState().getConvertedPreset(name);
  } else if (renderer.isMilkdropPreset(name)) {
    const { loadMilkdropPreset } = await import('./milkdropPresetsLoader.ts');
    preset = await loadMilkdropPreset(name);
  }

  if (!preset) return false;
  renderer.registerEelPreset(name, preset);
  return true;
}
