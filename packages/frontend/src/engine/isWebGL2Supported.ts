export function isWebGL2Supported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  } catch {
    return false;
  }
}

/**
 * Detect whether WebGL2 failure is likely a temporary GPU crash rather than
 * permanent lack of support. If the user has MangoWave settings in localStorage,
 * they had a working session before — so the browser supports WebGL2 but the
 * GPU process is currently in a failed state.
 */
export function isLikelyGpuCrash(): boolean {
  try {
    return localStorage.getItem('mangowave-settings') !== null;
  } catch {
    return false;
  }
}
