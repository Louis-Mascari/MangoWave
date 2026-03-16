function checkMatchMedia(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/** Compute mobile detection from current browser globals. Exported for testing. */
export function detectMobile(): boolean {
  const hasDisplayMedia = !!navigator.mediaDevices?.getDisplayMedia;

  // Detect mobile/tablet via hardware signals
  const isMobileHardware =
    !hasDisplayMedia ||
    (navigator.maxTouchPoints > 0 &&
      checkMatchMedia('(pointer: coarse)') &&
      window.innerWidth < 1024);

  // Also treat narrow viewports (below Tailwind `md` breakpoint) as mobile,
  // so behaviour stays consistent with the CSS `md:hidden` / `hidden md:block` split
  const isNarrowViewport = checkMatchMedia('(max-width: 767px)');

  return isMobileHardware || isNarrowViewport;
}

export const isMobileDevice = detectMobile();
