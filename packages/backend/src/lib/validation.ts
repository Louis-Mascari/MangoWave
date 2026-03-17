import type { UserSettings } from './dynamo';

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
const MAX_TRANSITION_TIME = 30;
const MIN_EQ_GAIN = -12;
const MAX_EQ_GAIN = 12;
const BAND_COUNT = 10;
const MAX_PRESET_LIST_LENGTH = 500;
const MAX_PRESET_NAME_LENGTH = 200;
const MAX_PACK_LIST_LENGTH = 100;
const VALID_FFT_SIZES = [512, 1024, 2048, 4096];

interface ValidationResult {
  valid: true;
  settings: UserSettings;
}

interface ValidationError {
  valid: false;
  error: string;
}

export function checkBodySize(body: string | undefined): string | null {
  if (!body) return null;
  if (Buffer.byteLength(body, 'utf-8') > MAX_BODY_SIZE) {
    return `Request body exceeds maximum size of ${MAX_BODY_SIZE} bytes`;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validatePresetList(
  list: unknown,
  fieldName: string,
): { values: string[]; error?: string } {
  if (!Array.isArray(list)) {
    return { values: [], error: `${fieldName} must be an array` };
  }
  if (list.length > MAX_PRESET_LIST_LENGTH) {
    return { values: [], error: `${fieldName} exceeds maximum of ${MAX_PRESET_LIST_LENGTH} items` };
  }
  const values: string[] = [];
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] !== 'string') {
      return { values: [], error: `${fieldName}[${i}] must be a string` };
    }
    const str = list[i] as string;
    if (str.length > MAX_PRESET_NAME_LENGTH) {
      return {
        values: [],
        error: `${fieldName}[${i}] exceeds maximum length of ${MAX_PRESET_NAME_LENGTH}`,
      };
    }
    values.push(str);
  }
  return { values };
}

function validateStringArray(
  list: unknown,
  fieldName: string,
  maxLength: number,
): { values: string[]; error?: string } {
  if (!Array.isArray(list)) {
    return { values: [], error: `${fieldName} must be an array` };
  }
  if (list.length > maxLength) {
    return { values: [], error: `${fieldName} exceeds maximum of ${maxLength} items` };
  }
  const values: string[] = [];
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] !== 'string') {
      return { values: [], error: `${fieldName}[${i}] must be a string` };
    }
    values.push(list[i] as string);
  }
  return { values };
}

function requireFiniteNumber(value: unknown, fieldName: string): ValidationError | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, error: `${fieldName} must be a finite number` };
  }
  return null;
}

function requireBoolean(value: unknown, fieldName: string): ValidationError | null {
  if (typeof value !== 'boolean') {
    return { valid: false, error: `${fieldName} must be a boolean` };
  }
  return null;
}

function requireObject(value: unknown, fieldName: string): ValidationError | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { valid: false, error: `${fieldName} must be an object` };
  }
  return null;
}

function validatePerformance(
  raw: unknown,
): { value: UserSettings['performance']; error?: undefined } | ValidationError {
  const err = requireObject(raw, 'performance');
  if (err) return err;
  const p = raw as Record<string, unknown>;

  for (const field of ['fpsCap', 'resolutionScale', 'meshWidth', 'meshHeight', 'textureRatio']) {
    const numErr = requireFiniteNumber(p[field], `performance.${field}`);
    if (numErr) return numErr;
  }
  const boolErr = requireBoolean(p.fxaa, 'performance.fxaa');
  if (boolErr) return boolErr;

  const fpsCap = Math.round(clamp(p.fpsCap as number, 0, 300));
  return {
    value: {
      fpsCap: fpsCap > 0 && fpsCap < 15 ? 15 : fpsCap,
      resolutionScale: clamp(p.resolutionScale as number, 0.25, 1.0),
      meshWidth: Math.round(clamp(p.meshWidth as number, 16, 128)),
      meshHeight: Math.round(clamp(p.meshHeight as number, 12, 96)),
      textureRatio: clamp(p.textureRatio as number, 0.25, 2.0),
      fxaa: p.fxaa as boolean,
    },
  };
}

function validateAudio(
  raw: unknown,
): { value: UserSettings['audio']; error?: undefined } | ValidationError {
  const err = requireObject(raw, 'audio');
  if (err) return err;
  const a = raw as Record<string, unknown>;

  const smoothErr = requireFiniteNumber(a.smoothingConstant, 'audio.smoothingConstant');
  if (smoothErr) return smoothErr;
  const fftErr = requireFiniteNumber(a.fftSize, 'audio.fftSize');
  if (fftErr) return fftErr;

  if (!VALID_FFT_SIZES.includes(a.fftSize as number)) {
    return { valid: false, error: `audio.fftSize must be one of ${VALID_FFT_SIZES.join(', ')}` };
  }

  return {
    value: {
      smoothingConstant: clamp(a.smoothingConstant as number, 0, 1),
      fftSize: a.fftSize as number,
    },
  };
}

function validateAutopilot(
  raw: unknown,
): { value: UserSettings['autopilot']; error?: undefined } | ValidationError {
  const err = requireObject(raw, 'autopilot');
  if (err) return err;
  const a = raw as Record<string, unknown>;

  const enabledErr = requireBoolean(a.enabled, 'autopilot.enabled');
  if (enabledErr) return enabledErr;
  const intervalErr = requireFiniteNumber(a.interval, 'autopilot.interval');
  if (intervalErr) return intervalErr;
  const weightErr = requireFiniteNumber(a.favoriteWeight, 'autopilot.favoriteWeight');
  if (weightErr) return weightErr;

  if (typeof a.mode !== 'string' || !['all', 'favorites'].includes(a.mode)) {
    return { valid: false, error: 'autopilot.mode must be "all" or "favorites"' };
  }

  return {
    value: {
      enabled: a.enabled as boolean,
      interval: clamp(a.interval as number, 5, 120),
      mode: a.mode as string,
      favoriteWeight: clamp(a.favoriteWeight as number, 1, 10),
    },
  };
}

function validatePresetNameDisplay(
  raw: unknown,
): { value: UserSettings['presetNameDisplay']; error?: undefined } | ValidationError {
  if (raw === 'off' || raw === 'always') return { value: raw };
  const err = requireFiniteNumber(raw, 'presetNameDisplay');
  if (err) return err;
  return { value: clamp(raw as number, 1, 10) };
}

function validateSongInfoDisplay(
  raw: unknown,
): { value: UserSettings['songInfoDisplay']; error?: undefined } | ValidationError {
  if (raw === 'off') return { value: raw };
  const err = requireFiniteNumber(raw, 'songInfoDisplay');
  if (err) return err;
  return { value: clamp(raw as number, 1, 10) };
}

export function validateSettings(input: unknown): ValidationResult | ValidationError {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { valid: false, error: 'Settings must be an object' };
  }

  const raw = input as Record<string, unknown>;

  // performance
  const perfResult = validatePerformance(raw.performance);
  if ('valid' in perfResult) return perfResult;

  // eqSettings
  const eqErr = requireObject(raw.eqSettings, 'eqSettings');
  if (eqErr) return eqErr;
  const eq = raw.eqSettings as Record<string, unknown>;

  const preAmpErr = requireFiniteNumber(eq.preAmpGain, 'eqSettings.preAmpGain');
  if (preAmpErr) return preAmpErr;
  const preAmpGain = clamp(eq.preAmpGain as number, 0, 3);

  if (!Array.isArray(eq.bandGains)) {
    return { valid: false, error: 'eqSettings.bandGains must be an array' };
  }
  if (eq.bandGains.length !== BAND_COUNT) {
    return { valid: false, error: `eqSettings.bandGains must have exactly ${BAND_COUNT} items` };
  }
  const bandGains: number[] = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const val = eq.bandGains[i];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return { valid: false, error: `eqSettings.bandGains[${i}] must be a finite number` };
    }
    bandGains.push(clamp(val, MIN_EQ_GAIN, MAX_EQ_GAIN));
  }

  // audio
  const audioResult = validateAudio(raw.audio);
  if ('valid' in audioResult) return audioResult;

  // autopilot
  const autopilotResult = validateAutopilot(raw.autopilot);
  if ('valid' in autopilotResult) return autopilotResult;

  // transitionTime
  const transTimeErr = requireFiniteNumber(raw.transitionTime, 'transitionTime');
  if (transTimeErr) return transTimeErr;
  const transitionTime = clamp(raw.transitionTime as number, 0, MAX_TRANSITION_TIME);

  // blockedPresets
  const blocked = validatePresetList(raw.blockedPresets, 'blockedPresets');
  if (blocked.error) {
    return { valid: false, error: blocked.error };
  }

  // favoritePresets
  const favorites = validatePresetList(raw.favoritePresets, 'favoritePresets');
  if (favorites.error) {
    return { valid: false, error: favorites.error };
  }

  // enabledPacks
  const packs = validateStringArray(raw.enabledPacks, 'enabledPacks', MAX_PACK_LIST_LENGTH);
  if (packs.error) {
    return { valid: false, error: packs.error };
  }

  // excludedOverrides
  const excluded = validatePresetList(raw.excludedOverrides, 'excludedOverrides');
  if (excluded.error) {
    return { valid: false, error: excluded.error };
  }

  // presetNameDisplay
  const presetNameResult = validatePresetNameDisplay(raw.presetNameDisplay);
  if ('valid' in presetNameResult) return presetNameResult;

  // songInfoDisplay
  const songInfoResult = validateSongInfoDisplay(raw.songInfoDisplay);
  if ('valid' in songInfoResult) return songInfoResult;

  // volume
  const volumeErr = requireFiniteNumber(raw.volume, 'volume');
  if (volumeErr) return volumeErr;
  const volume = clamp(raw.volume as number, 0, 1);

  // Strip unexpected keys — only return known fields
  return {
    valid: true,
    settings: {
      performance: perfResult.value,
      eqSettings: { preAmpGain, bandGains },
      audio: audioResult.value,
      autopilot: autopilotResult.value,
      transitionTime,
      blockedPresets: blocked.values,
      favoritePresets: favorites.values,
      enabledPacks: packs.values,
      excludedOverrides: excluded.values,
      presetNameDisplay: presetNameResult.value,
      songInfoDisplay: songInfoResult.value,
      volume,
    },
  };
}
