import data from '../lib/presets.json';

type PresetMap = Record<string, object>;

const presets: PresetMap = data as PresetMap;

/** Get all preset objects (name → converted JSON with _eelFormat: true). */
export function getPresets(): PresetMap {
  return presets;
}

/** Get just the preset names (for eager registration without loading objects). */
export function getPresetNames(): string[] {
  return Object.keys(presets);
}

/** Get a single preset by name (for lazy loading). */
export function getPreset(name: string): object | undefined {
  return presets[name];
}
