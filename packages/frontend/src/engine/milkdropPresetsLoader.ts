/** Load + compile a bundled MilkDrop-Original preset by name. */
export async function loadMilkdropPreset(name: string): Promise<object | null> {
  const { getPreset } = await import('milkdrop-presets');
  const preset = getPreset(name);
  if (!preset) return null;

  // Deep clone — compilePresetEel mutates the object, and the module-level
  // reference must stay pristine for recompilation after eviction.
  const clone = structuredClone(preset);

  const { compilePresetEel } = await import('./eelWasmAdapter.ts');
  await compilePresetEel(clone as Parameters<typeof compilePresetEel>[0]);
  return clone;
}
