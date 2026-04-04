import names from '../lib/presetNames.json';

/** Get preset names from a lightweight manifest (18KB vs 5MB full data). */
export function getPresetNames(): string[] {
  return names;
}
