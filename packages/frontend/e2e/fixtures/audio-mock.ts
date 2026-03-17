/**
 * Installs audio API mocks via page.addInitScript().
 * Must be called BEFORE page.goto() so the mocks are in place when the app loads.
 *
 * Uses a real AudioContext oscillator to produce a real MediaStream that
 * createMediaStreamSource() will accept. The oscillator runs at near-zero
 * gain so no audible output, but the stream is fully functional.
 */
export function installAudioMocks() {
  return `
    (() => {
      function createSilentStream() {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.001; // near-silent
        oscillator.connect(gain);
        const dest = ctx.createMediaStreamDestination();
        gain.connect(dest);
        oscillator.start();
        return dest.stream;
      }

      if (navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = () => Promise.resolve(createSilentStream());
        navigator.mediaDevices.getUserMedia = () => Promise.resolve(createSilentStream());
      }
    })();
  `;
}

/**
 * Returns an init script that makes getDisplayMedia reject with NotAllowedError.
 */
export function installAudioDeniedMock() {
  return `
    (() => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = () =>
          Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
        navigator.mediaDevices.getUserMedia = () =>
          Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      }
    })();
  `;
}

/**
 * Returns an init script that stubs canvas.getContext('webgl2') to return a truthy object.
 * Used on Firefox/WebKit CI where headless runners lack GPU drivers (WebGL 2 returns null).
 * The stub makes isWebGL2Supported() pass so the app renders StartScreen instead of the
 * WebGL error page. Safe because start-screen tests never initialize butterchurn.
 */
export function installWebGL2StubbedMock() {
  return `
    (() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (type === 'webgl2') return {};
        return orig.call(this, type, ...args);
      };
    })();
  `;
}

/**
 * Returns an init script that makes canvas.getContext('webgl2') return null.
 */
export function installWebGL2UnsupportedMock() {
  return `
    (() => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (type === 'webgl2') return null;
        return originalGetContext.call(this, type, ...args);
      };
    })();
  `;
}
