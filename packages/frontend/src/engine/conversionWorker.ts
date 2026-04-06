/**
 * Web Worker for off-main-thread MilkDrop preset conversion.
 * Imports milkdrop-preset-converter (which transitively loads hlslparser-wasm).
 */

type InMessage =
  | { type: 'warmup' }
  | { id: number; type: 'convert'; name: string; milkText: string };

type OutMessage =
  | { type: 'ready' }
  | { id: number; type: 'result'; name: string; preset?: object; error?: string };

let convertPreset: ((text: string) => object | Promise<object>) | null = null;

async function loadConverter(): Promise<void> {
  if (convertPreset) return;
  const mod = await import('milkdrop-preset-converter');
  convertPreset = mod.convertPreset ?? mod.default;
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data;

  if (msg.type === 'warmup') {
    try {
      await loadConverter();
      (self as unknown as Worker).postMessage({ type: 'ready' } satisfies OutMessage);
    } catch {
      // Warmup failure is non-fatal; conversion will retry the import
    }
    return;
  }

  if (msg.type === 'convert') {
    try {
      await loadConverter();
      const preset = await convertPreset!(msg.milkText);
      (self as unknown as Worker).postMessage({
        id: msg.id,
        type: 'result',
        name: msg.name,
        preset,
      } satisfies OutMessage);
    } catch (err) {
      (self as unknown as Worker).postMessage({
        id: msg.id,
        type: 'result',
        name: msg.name,
        error: err instanceof Error ? err.message : 'Unknown conversion error',
      } satisfies OutMessage);
    }
  }
};
