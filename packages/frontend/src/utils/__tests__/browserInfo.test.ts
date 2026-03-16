import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mutable state is available inside vi.mock factories
const { mockResult } = vi.hoisted(() => ({
  mockResult: {
    browser: { name: 'Chrome' as string | undefined },
    os: { name: 'Windows' as string | undefined },
    engine: { name: 'Blink' as string | undefined },
  },
}));

vi.mock('ua-parser-js', () => ({
  UAParser: class MockUAParser {
    getResult() {
      return mockResult;
    }
  },
}));

import { detectBrowserInfo } from '../browserInfo';

describe('browserInfo', () => {
  beforeEach(() => {
    mockResult.browser.name = 'Chrome';
    mockResult.os.name = 'Windows';
    mockResult.engine.name = 'Blink';
  });

  it('detects Chrome on Windows as Chromium', () => {
    const info = detectBrowserInfo();
    expect(info.browser).toBe('Chrome');
    expect(info.os).toBe('Windows');
    expect(info.isChromium).toBe(true);
  });

  it('detects Edge on macOS (normalized from "Mac OS")', () => {
    mockResult.browser.name = 'Edge';
    mockResult.os.name = 'Mac OS';
    const info = detectBrowserInfo();
    expect(info.browser).toBe('Edge');
    expect(info.os).toBe('macOS');
    expect(info.isChromium).toBe(true);
  });

  it('normalizes "Chrome OS" to "ChromeOS"', () => {
    mockResult.os.name = 'Chrome OS';
    const info = detectBrowserInfo();
    expect(info.os).toBe('ChromeOS');
  });

  it('detects Firefox as non-Chromium', () => {
    mockResult.browser.name = 'Firefox';
    mockResult.engine.name = 'Gecko';
    const info = detectBrowserInfo();
    expect(info.browser).toBe('Firefox');
    expect(info.isChromium).toBe(false);
  });

  it('detects Safari as non-Chromium', () => {
    mockResult.browser.name = 'Safari';
    mockResult.os.name = 'Mac OS';
    mockResult.engine.name = 'WebKit';
    const info = detectBrowserInfo();
    expect(info.browser).toBe('Safari');
    expect(info.os).toBe('macOS');
    expect(info.isChromium).toBe(false);
  });

  it('handles unknown browser/OS gracefully', () => {
    mockResult.browser.name = undefined;
    mockResult.os.name = undefined;
    mockResult.engine.name = undefined;
    const info = detectBrowserInfo();
    expect(info.browser).toBe('Unknown');
    expect(info.os).toBe('Unknown');
    expect(info.isChromium).toBe(false);
  });
});
