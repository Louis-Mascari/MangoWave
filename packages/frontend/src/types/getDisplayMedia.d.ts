export {};
declare global {
  interface DisplayMediaStreamOptions {
    selfBrowserSurface?: 'include' | 'exclude';
    surfaceSwitching?: 'include' | 'exclude';
    systemAudio?: 'include' | 'exclude';
  }
}
