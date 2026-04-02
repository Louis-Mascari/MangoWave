import textureData from './textureData.json';

type TextureEntry = { data: string; width: number; height: number };

// Build a map with both original-case and lowercase keys.
// MilkDrop on Windows is case-insensitive; presets may use any case.
const images: Record<string, TextureEntry> = {};
for (const [name, value] of Object.entries(textureData)) {
  images[name] = value as TextureEntry;
  const lower = name.toLowerCase();
  if (lower !== name) images[lower] = value as TextureEntry;
}

/** Get all texture images in butterchurn-compatible format. */
export function getImages(): Record<string, TextureEntry> {
  return images;
}

/** Get all registered texture names (includes both original-case and lowercase variants). */
export function getNames(): string[] {
  return Object.keys(images);
}
