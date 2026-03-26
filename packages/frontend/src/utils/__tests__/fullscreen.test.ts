import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('fullscreen utilities', () => {
  let originalRequestFullscreen: typeof Element.prototype.requestFullscreen | undefined;
  let originalExitFullscreen: typeof Document.prototype.exitFullscreen | undefined;

  beforeEach(() => {
    originalRequestFullscreen = document.documentElement.requestFullscreen;
    originalExitFullscreen = document.exitFullscreen;
  });

  afterEach(() => {
    // Restore standard API
    if (originalRequestFullscreen) {
      document.documentElement.requestFullscreen = originalRequestFullscreen;
    }
    if (originalExitFullscreen) {
      document.exitFullscreen = originalExitFullscreen;
    }
    // Clean up webkit shims
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = document as any;
    delete doc.webkitFullscreenElement;
    delete doc.webkitExitFullscreen;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = document.documentElement as any;
    delete el.webkitRequestFullscreen;

    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function loadModule() {
    return import('../fullscreen.ts');
  }

  describe('detectFullscreenSupport', () => {
    it('returns true when standard requestFullscreen exists', async () => {
      document.documentElement.requestFullscreen = vi.fn();
      const { detectFullscreenSupport } = await loadModule();
      expect(detectFullscreenSupport()).toBe(true);
    });

    it('returns true when only webkitRequestFullscreen exists', async () => {
      // Remove standard API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document.documentElement as any).requestFullscreen = undefined;
      // Add webkit API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document.documentElement as any).webkitRequestFullscreen = vi.fn();

      const { detectFullscreenSupport } = await loadModule();
      expect(detectFullscreenSupport()).toBe(true);
    });

    it('returns false when no fullscreen API is available', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document.documentElement as any).requestFullscreen = undefined;

      const { detectFullscreenSupport } = await loadModule();
      expect(detectFullscreenSupport()).toBe(false);
    });
  });

  describe('getFullscreenElement', () => {
    it('returns null when not in fullscreen', async () => {
      const { getFullscreenElement } = await loadModule();
      expect(getFullscreenElement()).toBeNull();
    });

    it('falls back to webkitFullscreenElement', async () => {
      const fakeElement = document.createElement('div');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).webkitFullscreenElement = fakeElement;

      const { getFullscreenElement } = await loadModule();
      // jsdom fullscreenElement is null, so it should fall back to webkit
      expect(getFullscreenElement()).toBe(fakeElement);
    });
  });

  describe('requestFullscreen', () => {
    it('calls standard requestFullscreen when available', async () => {
      const mockFn = vi.fn();
      document.documentElement.requestFullscreen = mockFn;

      const { requestFullscreen } = await loadModule();
      requestFullscreen();
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it('falls back to webkitRequestFullscreen', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document.documentElement as any).requestFullscreen = undefined;
      const mockFn = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document.documentElement as any).webkitRequestFullscreen = mockFn;

      const { requestFullscreen } = await loadModule();
      requestFullscreen();
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it('does not throw when no API is available', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document.documentElement as any).requestFullscreen = undefined;

      const { requestFullscreen } = await loadModule();
      expect(() => requestFullscreen()).not.toThrow();
    });
  });

  describe('exitFullscreen', () => {
    it('calls standard exitFullscreen when available', async () => {
      const mockFn = vi.fn();
      document.exitFullscreen = mockFn;

      const { exitFullscreen } = await loadModule();
      exitFullscreen();
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it('falls back to webkitExitFullscreen', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).exitFullscreen = undefined;
      const mockFn = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).webkitExitFullscreen = mockFn;

      const { exitFullscreen } = await loadModule();
      exitFullscreen();
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it('does not throw when no API is available', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).exitFullscreen = undefined;

      const { exitFullscreen } = await loadModule();
      expect(() => exitFullscreen()).not.toThrow();
    });
  });
});
