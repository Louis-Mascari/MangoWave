import _minimal from '../lib/butterchurnPresetsMinimal.min.js';
import _nonMinimal from '../lib/butterchurnPresetsNonMinimal.min.js';
import _extra from '../lib/butterchurnPresetsExtra.min.js';
import _extra2 from '../lib/butterchurnPresetsExtra2.min.js';
import _md1 from '../lib/butterchurnPresetsMD1.min.js';

const u = (m) => m.default ?? m;

export const presetsMinimal = u(_minimal);
export const presetsNonMinimal = u(_nonMinimal);
export const presetsExtra = u(_extra);
export const presetsExtra2 = u(_extra2);
export const presetsMD1 = u(_md1);
