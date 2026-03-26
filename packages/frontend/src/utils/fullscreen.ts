/**
 * Cross-browser fullscreen helpers.
 * Safari (desktop + iOS) still requires the webkit prefix.
 */

interface WebkitDocument {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;
}

interface WebkitElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

export function getFullscreenElement(): Element | null {
  return document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement ?? null;
}

export function requestFullscreen(el: Element = document.documentElement): void {
  const fn =
    el.requestFullscreen?.bind(el) ?? (el as WebkitElement).webkitRequestFullscreen?.bind(el);
  fn?.();
}

export function exitFullscreen(): void {
  const fn =
    document.exitFullscreen?.bind(document) ??
    (document as WebkitDocument).webkitExitFullscreen?.bind(document);
  fn?.();
}

export function detectFullscreenSupport(): boolean {
  return (
    typeof document.documentElement.requestFullscreen === 'function' ||
    typeof (document.documentElement as WebkitElement).webkitRequestFullscreen === 'function'
  );
}

export const supportsFullscreen = detectFullscreenSupport();

export const FULLSCREEN_CHANGE_EVENT =
  'onfullscreenchange' in document ? 'fullscreenchange' : 'webkitfullscreenchange';
