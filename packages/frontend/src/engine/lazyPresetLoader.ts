import type { VisualizerRenderer } from './VisualizerRenderer.ts';

/**
 * Check if a stale deployment error occurred (old HTML referencing
 * chunk hashes that no longer exist on the CDN). Triggers a one-time reload.
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
 * Lazily load a preset's .milk text and feed it to the renderer.
 * With projectM, no conversion or compilation is needed — just fetch the text.
 * Returns true if the preset loaded successfully.
 */
export async function ensurePresetLoaded(
  renderer: VisualizerRenderer,
  name: string,
): Promise<boolean> {
  try {
    return await renderer.loadPresetByName(name, true);
  } catch (err) {
    handleStaleChunkError(err);
    return false;
  }
}
