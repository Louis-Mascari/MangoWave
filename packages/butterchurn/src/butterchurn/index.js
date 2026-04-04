// Math.clamp polyfill (replaces ecma-proposal-math-extensions dependency)
if (typeof Math.clamp !== 'function') {
  Math.clamp = function clamp(x, lower, upper) {
    return Math.min(Math.max(x, lower), upper);
  };
}

import './presetBase';
import Visualizer from './visualizer';

export default class Butterchurn {
  static createVisualizer(context, canvas, opts) {
    return new Visualizer(context, canvas, opts);
  }
}
