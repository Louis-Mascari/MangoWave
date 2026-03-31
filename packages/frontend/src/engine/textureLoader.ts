const MAX_FILE_SIZE = 2_097_152; // 2MB
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface TextureFileResult {
  name: string;
  dataUri: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/** Cheap pre-checks (no file read). Returns error string or null. */
export function validateTextureFile(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) return 'invalidFileType';
  if (file.size > MAX_FILE_SIZE) return 'fileTooLarge';
  return null;
}

/** Derive texture name from filename: stem, lowercased. */
function deriveTextureName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '');
  return stem.toLowerCase();
}

/** Read, validate, and convert an image file to a data URI with dimensions. */
export async function readTextureFile(file: File): Promise<TextureFileResult> {
  const validationError = validateTextureFile(file);
  if (validationError) throw new Error(validationError);

  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('readFailed'));
    reader.readAsDataURL(file);
  });

  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('decodeFailed'));
      img.src = dataUri;
    },
  );

  return {
    name: deriveTextureName(file.name),
    dataUri,
    width,
    height,
    sizeBytes: file.size,
  };
}
