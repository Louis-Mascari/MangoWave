/**
 * Singleton lifecycle manager for the preset conversion Web Worker.
 * Provides promise-based API for converting .milk presets off the main thread.
 */

type WorkerResult = {
  id: number;
  type: 'result';
  name: string;
  preset?: object;
  error?: string;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (preset: object) => void; reject: (err: Error) => void }
>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./conversionWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResult | { type: 'ready' }>) => {
      const msg = e.data;
      if (msg.type === 'ready') return;
      if (msg.type === 'result') {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(msg.error));
        } else {
          p.resolve(msg.preset!);
        }
      }
    };
    worker.onerror = (e) => {
      console.error('Conversion worker error:', e);
      // Reject all pending promises — a fatal crash (WASM OOM, etc.) won't post a result
      for (const [id, p] of pending) {
        p.reject(new Error('Conversion worker crashed'));
        pending.delete(id);
      }
      worker = null; // Force fresh worker on next call
    };
  }
  return worker;
}

/** Pre-warm the worker by eagerly loading the converter + WASM. */
export function warmUpWorker(): void {
  getWorker().postMessage({ type: 'warmup' });
}

/** Convert a .milk preset text to a butterchurn JSON object via the worker. */
export function convertInWorker(name: string, milkText: string): Promise<object> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type: 'convert', name, milkText });
  });
}
