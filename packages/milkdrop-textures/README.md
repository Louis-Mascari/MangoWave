# milkdrop-textures

66 standard MilkDrop textures from the [projectM texture pack](https://github.com/projectM-visualizer/presets-milkdrop-texture-pack). These are the canonical textures that all major MilkDrop preset packs rely on (cream-of-the-crop, milkdrop-original, projectM-classic).

## How it works

Raw JPG textures live in `textures/`. A build script converts them to base64 data URIs with dimensions in `src/textureData.json` (gitignored, generated on `pnpm install` via `prepare` script).

The exported `getImages()` returns textures keyed by both original case (`OIbeans1`) and lowercase (`oibeans1`) for case-insensitive compatibility — MilkDrop on Windows was case-insensitive, so presets reference textures in varying case.

## Exports

- `getImages()` — all textures as `{ [name]: { data, width, height } }` for projectM's texture callback
- `getNames()` — all registered texture names (includes both case variants)

## Regenerating texture data

```bash
node scripts/build-texture-data.cjs
```

Requires `image-size` (dev dependency). Reads from `textures/`, writes to `src/textureData.json`.

## Texture coverage

The only permanently lost standard MilkDrop texture is "worms" (per [projectM issue #532](https://github.com/projectM-visualizer/projectm/issues/532)).

## License

These textures originally shipped with MilkDrop (BSD-licensed Winamp plugin) and are redistributed by projectM under MIT.
