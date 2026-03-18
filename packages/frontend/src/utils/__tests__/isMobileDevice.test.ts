import { describe, it, expect, vi, afterEach } from 'vitest';

let mockDeviceType: string | undefined = undefined;

vi.mock('ua-parser-js', () => ({
  UAParser: class {
    getDevice() {
      return { type: mockDeviceType };
    }
  },
}));

// Must import after mock setup
const { detectMobile } = await import('../isMobileDevice');

function setupGlobals({
  hasGetDisplayMedia = true,
  maxTouchPoints = 0,
  innerWidth = 1920,
  matchMediaResults = {} as Record<string, boolean>,
  deviceType = undefined as string | undefined,
}: {
  hasGetDisplayMedia?: boolean;
  maxTouchPoints?: number;
  innerWidth?: number;
  matchMediaResults?: Record<string, boolean>;
  deviceType?: string | undefined;
}) {
  mockDeviceType = deviceType;

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
    mockDeviceType = undefined;
  });

  it('returns true when UAParser detects mobile device', () => {
    setupGlobals({ deviceType: 'mobile', innerWidth: 1920 });
    expect(detectMobile()).toBe(true);
  });

  it('returns true when UAParser detects tablet device', () => {
    setupGlobals({ deviceType: 'tablet', innerWidth: 1920 });
    expect(detectMobile()).toBe(true);
  });

  it('returns true when getDisplayMedia is absent (unknown device)', () => {
    setupGlobals({ hasGetDisplayMedia: false });
    expect(detectMobile()).toBe(true);
  });

  it('returns true for touch + coarse pointer + viewport < 1024px (unknown device)', () => {
    setupGlobals({
      maxTouchPoints: 5,
      innerWidth: 800,
      matchMediaResults: { '(pointer: coarse)': true },
    });
    expect(detectMobile()).toBe(true);
  });

  it('returns false for desktop with narrow viewport (laptop with small window)', () => {
    setupGlobals({
      innerWidth: 600,
      matchMediaResults: { '(max-width: 767px)': true },
    });
    expect(detectMobile()).toBe(false);
  });

  it('returns false for desktop: getDisplayMedia present, no touch, wide viewport', () => {
    setupGlobals({ innerWidth: 1920 });
    expect(detectMobile()).toBe(false);
  });

  it('returns false when touch present but pointer is fine (desktop with trackpad)', () => {
    setupGlobals({
      maxTouchPoints: 1,
      innerWidth: 800,
      matchMediaResults: { '(pointer: coarse)': false },
    });
    expect(detectMobile()).toBe(false);
  });

  it('returns false when touch + coarse but viewport ≥ 1024px (large tablet in desktop mode)', () => {
    setupGlobals({
      maxTouchPoints: 5,
      innerWidth: 1024,
      matchMediaResults: { '(pointer: coarse)': true },
    });
    expect(detectMobile()).toBe(false);
  });
});
