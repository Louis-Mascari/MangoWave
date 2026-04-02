/**
 * Build script: reads JPG textures from textures/ → generates src/textureData.json
 * with base64 data URIs and dimensions for each texture.
 *
 * Run: node scripts/build-texture-data.cjs
 */

const fs = require('fs');
const path = require('path');
const { imageSize } = require('image-size');

const TEXTURES_DIR = path.join(__dirname, '..', 'textures');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'textureData.json');

const files = fs
  .readdirSync(TEXTURES_DIR)
  .filter((f) => /\.jpe?g$/i.test(f))
  .sort();

const data = {};

for (const file of files) {
  const filePath = path.join(TEXTURES_DIR, file);
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  const dataUri = `data:image/jpeg;base64,${base64}`;

  const dimensions = imageSize(buffer);

  // Key = filename stem preserving original case
  // Handle double-dot filenames like "OIchess1..jpg"
  const stem = file.replace(/\.jpe?g$/i, '').replace(/\.$/, '');

  data[stem] = {
    data: dataUri,
    width: dimensions.width,
    height: dimensions.height,
  };
}

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data));

console.log(`Generated ${Object.keys(data).length} texture entries → ${OUTPUT_FILE}`);
console.log('Keys:', Object.keys(data).join(', '));
