const hasDisplayMedia = !!navigator.mediaDevices?.getDisplayMedia;

function checkMatchMedia(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

// Detect mobile/tablet via hardware signals
const isMobileHardware =
  !hasDisplayMedia ||
  (navigator.maxTouchPoints > 0 &&
    checkMatchMedia('(pointer: coarse)') &&
    window.innerWidth < 1024);

// Also treat narrow viewports (below Tailwind `md` breakpoint) as mobile,
// so behaviour stays consistent with the CSS `md:hidden` / `hidden md:block` split
const isNarrowViewport = checkMatchMedia('(max-width: 767px)');

export const isMobileDevice = isMobileHardware || isNarrowViewport;
