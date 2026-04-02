# milkdrop-textures

66 standard MilkDrop textures from the [projectM texture pack](https://github.com/projectM-visualizer/presets-milkdrop-texture-pack). These are the canonical textures that all major MilkDrop preset packs rely on (cream-of-the-crop, milkdrop-original, projectM-classic).

## How it works

Raw JPG textures live in `textures/`. A build script converts them to base64 data URIs with dimensions in `src/textureData.json` (gitignored, generated on `npm install` via `prepare` script).

The exported `getImages()` returns textures keyed by both original case (`OIbeans1`) and lowercase (`oibeans1`) for case-insensitive compatibility — MilkDrop on Windows was case-insensitive, so presets reference textures in varying case.

## Exports

- `getImages()` — all textures in butterchurn-compatible format (`{ [name]: { data, width, height } }`)
- `getNames()` — all registered texture names (includes both case variants)

## Regenerating texture data

```bash
node scripts/build-texture-data.cjs
```

Requires `image-size` (dev dependency). Reads from `textures/`, writes to `src/textureData.json`.

## Texture coverage

5 textures overlap with butterchurn's built-in `butterchurnExtraImages` (cells, lichen, prayerwheel, seaweed, smalltiled_lizard_scales) — butterchurn skips duplicates. `mage` is only in butterchurn's set, not this pack. The only permanently lost standard MilkDrop texture is "worms" (per [projectM issue #532](https://github.com/projectM-visualizer/projectm/issues/532)).

## License

These textures originally shipped with MilkDrop (BSD-licensed Winamp plugin) and are redistributed by projectM under MIT. butterchurn already redistributes MilkDrop content (presets, 6 textures). Consistent with existing practice.
