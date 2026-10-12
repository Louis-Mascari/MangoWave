import { useToastStore } from '../store/useToastStore.ts';
import i18n from '../i18n/index.ts';

// A tab left open across a deploy runs an old build. Its lazy chunks stay on the CDN for
// a couple of weeks, so this is a backstop for tabs older than that (or a chunk lost some
// other way). An outdated tab is reloaded when the user returns to it with no session
// running, and only told about the new version during a session, since a reload would
// end it.

const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

let sessionActive = false;
let stale = false;
let noticeShown = false;
let lastCheck = 0;
let pendingCheck: Promise<boolean> | null = null;

function currentEntryScript(): string | null {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? null;
}

/**
 * True when the server now serves a different build than the one this tab is running.
 * A failed chunk load on its own does not prove that: the same thing happens on an
 * ordinary network failure, where reloading would only swap a working page for the
 * browser's offline one.
 */
async function fetchIsStale(): Promise<boolean> {
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

/** Once a tab is known to be stale it stays stale, so the answer is only fetched until then. */
function checkStale(): Promise<boolean> {
  if (stale) return Promise.resolve(true);
  pendingCheck ??= fetchIsStale().then((result) => {
    stale = result;
    lastCheck = Date.now();
    pendingCheck = null;
    return result;
  });
  return pendingCheck;
}

/** Reload at most once per build, so a reload that does not help cannot loop. */
function reloadOnce(): void {
  const key = `mw-stale-reload:${currentEntryScript()}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // Without storage there is no loop guard, so do not reload
    return;
  }
  window.location.reload();
}

function act(): void {
  if (!stale) return;
  if (!sessionActive) {
    reloadOnce();
    return;
  }
  // Once per page: an outdated session can fail a lazy load on every preset change
  if (noticeShown) return;
  noticeShown = true;
  useToastStore.getState().show(i18n.t('toasts.newVersionAvailable', { ns: 'messages' }), {
    type: 'warning',
    durationMs: 10000,
  });
}

/**
 * The app reports session start and end. Ending a session does not reload by itself:
 * the start screen may be showing why it ended (microphone unplugged, share cancelled).
 * The next return to the tab does.
 */
export function setSessionActive(active: boolean): void {
  sessionActive = active;
}

/** Lets callers avoid blaming something else for a failure this already explains. */
export function isBuildKnownStale(): boolean {
  return stale;
}

/** Starts listening. Returns a function that stops, which only the tests need. */
export function initStaleBuildRecovery(): () => void {
  // Deliberately no preventDefault(): the failed import must still reject, or callers
  // that destructure its result would fail with a less useful error
  const onPreloadError = () => {
    void checkStale().then(act);
  };

  // Lazy loads only happen inside a session, so without this an outdated tab would never
  // get the chance to reload while idle. Coming back to the tab is the natural moment.
  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible' || sessionActive) return;
    if (!stale && Date.now() - lastCheck < RECHECK_INTERVAL_MS) return;
    void checkStale().then(act);
  };

  window.addEventListener('vite:preloadError', onPreloadError);
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    window.removeEventListener('vite:preloadError', onPreloadError);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
