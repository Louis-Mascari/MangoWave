import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectMobile } from '../isMobileDevice';

function setupGlobals({
  hasGetDisplayMedia = true,
  maxTouchPoints = 0,
  innerWidth = 1920,
  matchMediaResults = {} as Record<string, boolean>,
}: {
  hasGetDisplayMedia?: boolean;
  maxTouchPoints?: number;
  innerWidth?: number;
  matchMediaResults?: Record<string, boolean>;
}) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: hasGetDisplayMedia ? { getDisplayMedia: vi.fn() } : ({} as MediaDevices),
    configurable: true,
  });

  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: maxTouchPoints,
    configurable: true,
  });

  vi.stubGlobal('innerWidth', innerWidth);

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matchMediaResults[query] ?? false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('isMobileDevice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when getDisplayMedia is absent', () => {
    setupGlobals({ hasGetDisplayMedia: false });
    expect(detectMobile()).toBe(true);
  });

  it('returns true for touch + coarse pointer + viewport < 1024px (tablet)', () => {
    setupGlobals({
      maxTouchPoints: 5,
      innerWidth: 800,
      matchMediaResults: {
        '(pointer: coarse)': true,
        '(max-width: 767px)': false,
      },
    });
    expect(detectMobile()).toBe(true);
  });

  it('returns true for narrow viewport (≤767px)', () => {
    setupGlobals({
      innerWidth: 600,
      matchMediaResults: {
        '(pointer: coarse)': false,
        '(max-width: 767px)': true,
      },
    });
    expect(detectMobile()).toBe(true);
  });

  it('returns false for desktop: getDisplayMedia present, no touch, wide viewport', () => {
    setupGlobals({
      innerWidth: 1920,
      matchMediaResults: {
        '(pointer: coarse)': false,
        '(max-width: 767px)': false,
      },
    });
    expect(detectMobile()).toBe(false);
  });

  it('returns false when touch present but pointer is fine (mouse)', () => {
    setupGlobals({
      maxTouchPoints: 1,
      innerWidth: 800,
      matchMediaResults: {
        '(pointer: coarse)': false,
        '(max-width: 767px)': false,
      },
    });
    expect(detectMobile()).toBe(false);
  });

  it('returns false when touch + coarse but viewport ≥ 1024px (large tablet in desktop mode)', () => {
    setupGlobals({
      maxTouchPoints: 5,
      innerWidth: 1024,
      matchMediaResults: {
        '(pointer: coarse)': true,
        '(max-width: 767px)': false,
      },
    });
    expect(detectMobile()).toBe(false);
  });
});
