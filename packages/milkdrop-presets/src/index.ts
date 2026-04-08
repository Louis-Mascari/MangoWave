import data from '../lib/presets.json';

type MilkTextMap = Record<string, string>;

const presets: MilkTextMap = data as MilkTextMap;

/** Get all preset .milk texts (name → raw .milk file content). */
export function getPresets(): MilkTextMap {
  return presets;
}

/** Get just the preset names (for eager registration without loading data). */
export function getPresetNames(): string[] {
  return Object.keys(presets);
}

/** Get a single preset's .milk text by name (for lazy loading). */
export function getMilkText(name: string): string | undefined {
  return presets[name];
}
