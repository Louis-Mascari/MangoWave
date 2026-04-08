import { readMilkFile, findMissingTextures, BUILTIN_EXTRA_IMAGES } from './milkdropConverter.ts';
import { readTextureFile, validateTextureFile } from './textureLoader.ts';
import { useImportedPresetsStore } from '../store/useImportedPresetsStore.ts';
import { useImportedTexturesStore } from '../store/useImportedTexturesStore.ts';
import { useSettingsStore } from '../store/useSettingsStore.ts';
import { set as idbSet, del as idbDel } from 'idb-keyval';

export interface ImportResult {
  fileName: string;
  presetName?: string;
  status: 'success' | 'failed' | 'warning';
  errorCode?: string;
  warnings: string[];
}

/** Check IDB availability (fails in some private browsing modes). */
async function checkIdbAvailability(): Promise<void> {
  await idbSet('__mw_idb_test', '1');
  await idbDel('__mw_idb_test');
}

export async function processPresetImport(
  files: File[],
  opts: {
    importedNameSet: ReadonlySet<string>;
    importedTextureNameSet: ReadonlySet<string>;
    presetPackMap: ReadonlyMap<string, string>;
    onProgress: (result: ImportResult, current: number, total: number) => void;
  },
): Promise<ImportResult[]> {
  await checkIdbAvailability();

  const results: ImportResult[] = [];
  const store = useImportedPresetsStore.getState();
  const batchNames = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const warnings: string[] = [];
    let result: ImportResult;

    try {
      const { name, text } = await readMilkFile(file);

      if (opts.importedNameSet.has(name) || batchNames.has(name)) {
        throw new Error('duplicateName');
      }
      if (opts.presetPackMap.has(name)) {
        throw new Error('nativeNameCollision');
      }

      const missing = findMissingTextures(text, opts.importedTextureNameSet);
      if (missing.length > 0) {
        warnings.push(...missing);
      }

      batchNames.add(name);
      await store.addPreset(name, text);
      useSettingsStore.getState().addImportedPresetMeta({
        name,
        fileName: file.name,
        addedAt: Date.now(),
        missingTextures: warnings.length > 0 ? warnings : undefined,
      });

      result = {
        fileName: file.name,
        presetName: name,
        status: warnings.length > 0 ? 'warning' : 'success',
        warnings,
      };
    } catch (err) {
      const code = err instanceof Error ? err.message : 'unknown';
      result = {
        fileName: file.name,
        status: 'failed',
        errorCode: code,
        warnings: [],
      };
    }

    results.push(result);
    opts.onProgress(result, i + 1, files.length);

    // Yield to React for re-render between files
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return results;
}

export async function processTextureImport(
  files: File[],
  opts: {
    existingTextureNames: ReadonlySet<string>;
    onProgress: (result: ImportResult, current: number, total: number) => void;
  },
): Promise<ImportResult[]> {
  await checkIdbAvailability();

  const results: ImportResult[] = [];
  const store = useImportedTexturesStore.getState();
  const existingNames = new Set(opts.existingTextureNames);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let result: ImportResult;

    try {
      const preError = validateTextureFile(file);
      if (preError) {
        throw new Error(preError);
      }

      // Derive name early for cheap pre-read checks
      const derivedName = file.name.replace(/\.[^.]+$/, '').toLowerCase();
      if (BUILTIN_EXTRA_IMAGES.has(derivedName)) {
        throw new Error('builtinTextureShadow');
      }
      if (existingNames.has(derivedName)) {
        throw new Error('duplicateName');
      }

      const textureResult = await readTextureFile(file);

      await store.addTexture(textureResult.name, {
        data: textureResult.dataUri,
        width: textureResult.width,
        height: textureResult.height,
      });
      useSettingsStore.getState().addImportedTextureMeta({
        name: textureResult.name,
        fileName: file.name,
        width: textureResult.width,
        height: textureResult.height,
        sizeBytes: textureResult.sizeBytes,
        addedAt: Date.now(),
      });
      existingNames.add(textureResult.name);

      result = {
        fileName: file.name,
        presetName: textureResult.name,
        status: 'success',
        warnings: [],
      };
    } catch (err) {
      const code = err instanceof Error ? err.message : 'unknown';
      result = {
        fileName: file.name,
        status: 'failed',
        errorCode: code,
        warnings: [],
      };
    }

    results.push(result);
    opts.onProgress(result, i + 1, files.length);

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return results;
}
