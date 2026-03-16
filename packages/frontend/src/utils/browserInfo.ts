import { UAParser } from 'ua-parser-js';

export interface BrowserInfo {
  browser: string;
  os: string;
  isChromium: boolean;
}

/** Compute browser info from current UA. Exported for testing. */
export function detectBrowserInfo(): BrowserInfo {
  const parser = new UAParser();
  const result = parser.getResult();

  const rawBrowser = result.browser.name ?? 'Unknown';
  const rawOS = result.os.name ?? 'Unknown';

  // Normalize OS names to user-friendly forms
  const osNormalized = rawOS === 'Mac OS' ? 'macOS' : rawOS === 'Chrome OS' ? 'ChromeOS' : rawOS;

  // Blink engine = Chromium-based (Chrome, Edge, Opera, Brave, Arc, Vivaldi)
  const isChromium = result.engine.name === 'Blink';

  return {
    browser: rawBrowser,
    os: osNormalized,
    isChromium,
  };
}

export const browserInfo: BrowserInfo = detectBrowserInfo();
