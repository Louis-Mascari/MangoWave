import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CURRENT = '/assets/index-current.js';
const NEWER = '/assets/index-new.js';

function serveIndexWith(scriptSrc: string, ok = true) {
  const html = `<html><body><script type="module" src="${scriptSrc}"></script></body></html>`;
  const fetchMock = vi.fn(() => Promise.resolve(new Response(html, { status: ok ? 200 : 500 })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Let the fetch, the HTML read and the decision that follows all run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function firePreloadError() {
  window.dispatchEvent(new Event('vite:preloadError'));
  await settle();
}

async function returnToTab() {
  document.dispatchEvent(new Event('visibilitychange'));
  await settle();
}

describe('stale build recovery', () => {
  let reload: ReturnType<typeof vi.fn>;
  let stop: () => void;
  let setSessionActive: (active: boolean) => void;
  let toastMessage: () => string | null;

  // The module keeps what it has learned for the life of the page, so each test gets a
  // fresh copy (and a fresh toast store, which it imports)
  beforeEach(async () => {
    vi.resetModules();
    sessionStorage.clear();
    document.body.innerHTML = `<script type="module" src="${CURRENT}"></script>`;
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: window.location.href, reload });

    const module = await import('../staleBuild.ts');
    const { useToastStore } = await import('../../store/useToastStore.ts');
    stop = module.initStaleBuildRecovery();
    setSessionActive = module.setSessionActive;
    toastMessage = () => useToastStore.getState().message;
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('reloads once when a chunk fails, the server has a newer build and no session is running', async () => {
    serveIndexWith(NEWER);

    await firePreloadError();
    expect(reload).toHaveBeenCalledTimes(1);

    // The reload did not help (same old build still running): do not loop
    await firePreloadError();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads an idle outdated tab when the user comes back to it', async () => {
    serveIndexWith(NEWER);
    await returnToTab();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not poll on every return to the tab', async () => {
    const fetchMock = serveIndexWith(CURRENT);
    await returnToTab();
    await returnToTab();
    await returnToTab();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('never reloads a live session: it says so once, then reloads when the session ends', async () => {
    const fetchMock = serveIndexWith(NEWER);
    setSessionActive(true);

    await firePreloadError();
    expect(reload).not.toHaveBeenCalled();
    expect(toastMessage()).toContain('new version');

    // Every later preset change can fail the same way; no more requests or notices
    const { useToastStore } = await import('../../store/useToastStore.ts');
    useToastStore.getState().clear();
    await firePreloadError();
    await firePreloadError();
    await returnToTab();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toastMessage()).toBeNull();
    expect(reload).not.toHaveBeenCalled();

    setSessionActive(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the build is current, so a flaky connection cannot trigger a reload', async () => {
    serveIndexWith(CURRENT);
    await firePreloadError();
    expect(reload).not.toHaveBeenCalled();
    expect(toastMessage()).toBeNull();
  });

  it('does nothing when the server cannot be reached or answers with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await firePreloadError();
    serveIndexWith(NEWER, false);
    await firePreloadError();
    expect(reload).not.toHaveBeenCalled();
  });

  it('asks the server once for simultaneous failures', async () => {
    const fetchMock = serveIndexWith(CURRENT);
    window.dispatchEvent(new Event('vite:preloadError'));
    window.dispatchEvent(new Event('vite:preloadError'));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not reload when there is no storage to guard against a loop', async () => {
    serveIndexWith(NEWER);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    await firePreloadError();
    expect(reload).not.toHaveBeenCalled();
  });
});
