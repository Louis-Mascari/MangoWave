import { useToastStore } from '../store/useToastStore.ts';
import i18n from '../i18n/index.ts';

// A tab left open across a deploy runs an old build. Its lazy chunks stay on the CDN for
// a couple of weeks, so this is a backstop for tabs older than that (or a chunk lost some
// other way): Vite fires `vite:preloadError` when a dynamic import cannot be loaded.

let sessionActive = false;
let handling = false;

/** Reloading ends a live audio session, so the app says when one is running. */
export function setSessionActive(active: boolean): void {
  sessionActive = active;
}

function currentEntryScript(): string | null {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? null;
}

/**
 * True when the server now serves a different build than the one this tab is running.
 * The same event also fires for an ordinary network failure, where reloading would only
 * swap a working page for the browser's offline one.
 */
async function isBuildStale(): Promise<boolean> {
  const current = currentEntryScript();
  if (!current) return false;
  try {
    const response = await fetch('/index.html', { cache: 'no-store' });
    if (!response.ok) return false;
    const html = await response.text();
    const latest = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector<HTMLScriptElement>('script[type="module"][src]')
      ?.getAttribute('src');
    return !!latest && new URL(latest, window.location.href).href !== current;
  } catch {
    return false;
  }
}

async function onPreloadError(): Promise<void> {
  if (handling) return;
  handling = true;
  try {
    if (!(await isBuildStale())) return;

    if (sessionActive) {
      useToastStore.getState().show(i18n.t('toasts.newVersionAvailable', { ns: 'messages' }), {
        type: 'warning',
        durationMs: 10000,
      });
      return;
    }

    // Reload at most once per build, so a reload that does not help cannot loop
    const key = `mw-stale-reload:${currentEntryScript()}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      return;
    }
    window.location.reload();
  } finally {
    handling = false;
  }
}

export function initStaleBuildRecovery(): void {
  // Deliberately no preventDefault(): the failed import must still reject, or callers
  // that destructure its result would fail with a less useful error
  window.addEventListener('vite:preloadError', () => {
    void onPreloadError();
  });
}
