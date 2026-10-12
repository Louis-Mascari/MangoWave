import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { useToastStore } from '../../store/useToastStore.ts';
import { initStaleBuildRecovery, setSessionActive } from '../staleBuild.ts';

const CURRENT = '/assets/index-current.js';

function serveIndexWith(scriptSrc: string | null, ok = true) {
  const html = scriptSrc
    ? `<html><body><script type="module" src="${scriptSrc}"></script></body></html>`
    : '';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html, { status: ok ? 200 : 500 })));
}

async function firePreloadError() {
  window.dispatchEvent(new Event('vite:preloadError'));
  // fetch → text → decision
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('stale build recovery', () => {
  let reload: ReturnType<typeof vi.fn>;

  // One listener for the whole file: registering per test would stack them
  beforeAll(() => {
    initStaleBuildRecovery();
  });

  beforeEach(() => {
    sessionStorage.clear();
    useToastStore.getState().clear();
    setSessionActive(false);
    document.body.innerHTML = `<script type="module" src="${CURRENT}"></script>`;
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: window.location.href, reload });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('reloads once when the server has a newer build and no session is running', async () => {
    serveIndexWith('/assets/index-new.js');

    await firePreloadError();
    expect(reload).toHaveBeenCalledTimes(1);

    // The reload did not help (same old build still running): do not loop
    await firePreloadError();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload a live session; it tells the user instead', async () => {
    serveIndexWith('/assets/index-new.js');
    setSessionActive(true);

    await firePreloadError();

    expect(reload).not.toHaveBeenCalled();
    expect(useToastStore.getState().message).toContain('new version');
  });

  it('does nothing when the build is current, so a flaky connection cannot trigger a reload', async () => {
    serveIndexWith(CURRENT);
    await firePreloadError();
    expect(reload).not.toHaveBeenCalled();
    expect(useToastStore.getState().message).toBeNull();
  });

  it('does nothing when the server cannot be reached or answers with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await firePreloadError();
    serveIndexWith('/assets/index-new.js', false);
    await firePreloadError();
    expect(reload).not.toHaveBeenCalled();
  });
});
