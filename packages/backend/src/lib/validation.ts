import type { UserSettings } from './dynamo';

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
const MAX_THEME_LENGTH = 50;
const MAX_TRANSITION_TIME = 30;
const MIN_GAIN = -12;
const MAX_GAIN = 12;
const BAND_COUNT = 10;
const MAX_PRESET_LIST_LENGTH = 10_000;
const MAX_PRESET_NAME_LENGTH = 200;

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

export function validateSettings(input: unknown): ValidationResult | ValidationError {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { valid: false, error: 'Settings must be an object' };
  }

  const raw = input as Record<string, unknown>;

  // theme
  if (typeof raw.theme !== 'string') {
    return { valid: false, error: 'theme must be a string' };
  }
  if (raw.theme.length > MAX_THEME_LENGTH) {
    return { valid: false, error: `theme exceeds maximum length of ${MAX_THEME_LENGTH}` };
  }

  // transitionTime
  if (typeof raw.transitionTime !== 'number' || !Number.isFinite(raw.transitionTime)) {
    return { valid: false, error: 'transitionTime must be a finite number' };
  }
  const transitionTime = clamp(raw.transitionTime, 0, MAX_TRANSITION_TIME);

  // eqSettings
  if (typeof raw.eqSettings !== 'object' || raw.eqSettings === null) {
    return { valid: false, error: 'eqSettings must be an object' };
  }
  const eq = raw.eqSettings as Record<string, unknown>;

  if (typeof eq.preAmpGain !== 'number' || !Number.isFinite(eq.preAmpGain)) {
    return { valid: false, error: 'eqSettings.preAmpGain must be a finite number' };
  }
  const preAmpGain = clamp(eq.preAmpGain, MIN_GAIN, MAX_GAIN);

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
    bandGains.push(clamp(val, MIN_GAIN, MAX_GAIN));
  }

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

  // Strip unexpected keys — only return known fields
  return {
    valid: true,
    settings: {
      theme: raw.theme,
      transitionTime,
      eqSettings: { preAmpGain, bandGains },
      blockedPresets: blocked.values,
      favoritePresets: favorites.values,
    },
  };
}
