import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateTextureFile, readTextureFile } from '../textureLoader.ts';

// Mock Image constructor for dimension checks
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 512;
  naturalHeight = 512;
  private _src = '';

  get src() {
    return this._src;
  }
  set src(val: string) {
    this._src = val;
    // Trigger onload asynchronously
    setTimeout(() => this.onload?.(), 0);
  }
}

beforeEach(() => {
  vi.stubGlobal('Image', MockImage);
});

function createMockFile(name: string, size: number, type: string): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe('validateTextureFile', () => {
  it('returns null for valid JPEG', () => {
    const file = createMockFile('texture.jpg', 1000, 'image/jpeg');
    expect(validateTextureFile(file)).toBeNull();
  });

  it('returns null for valid PNG', () => {
    const file = createMockFile('texture.png', 1000, 'image/png');
    expect(validateTextureFile(file)).toBeNull();
  });

  it('returns null for valid WebP', () => {
    const file = createMockFile('texture.webp', 1000, 'image/webp');
    expect(validateTextureFile(file)).toBeNull();
  });

  it('rejects unsupported file type', () => {
    const file = createMockFile('texture.bmp', 1000, 'image/bmp');
    expect(validateTextureFile(file)).toBe('invalidFileType');
  });

  it('rejects file exceeding max size', () => {
    const file = createMockFile('texture.png', 3_000_000, 'image/png');
    expect(validateTextureFile(file)).toBe('fileTooLarge');
  });

  it('accepts file at exactly max size', () => {
    const file = createMockFile('texture.png', 2_097_152, 'image/png');
    expect(validateTextureFile(file)).toBeNull();
  });
});

describe('readTextureFile', () => {
  beforeEach(() => {
    // Mock FileReader
    vi.stubGlobal(
      'FileReader',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        result: string = 'data:image/png;base64,abc123';
        readAsDataURL() {
          setTimeout(() => this.onload?.(), 0);
        }
      },
    );
  });

  it('returns correct result for a valid file', async () => {
    const file = createMockFile('Cells.png', 5000, 'image/png');
    const result = await readTextureFile(file);

    expect(result.name).toBe('cells');
    expect(result.dataUri).toBe('data:image/png;base64,abc123');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(result.sizeBytes).toBe(5000);
  });

  it('derives name by lowercasing filename stem', async () => {
    const file = createMockFile('My_Texture.File.jpg', 1000, 'image/jpeg');
    const result = await readTextureFile(file);
    expect(result.name).toBe('my_texture.file');
  });

  it('throws for invalid file type', async () => {
    const file = createMockFile('texture.gif', 1000, 'image/gif');
    await expect(readTextureFile(file)).rejects.toThrow('invalidFileType');
  });

  it('throws for oversized file', async () => {
    const file = createMockFile('texture.png', 3_000_000, 'image/png');
    await expect(readTextureFile(file)).rejects.toThrow('fileTooLarge');
  });

  it('throws for oversized dimensions', async () => {
    // Override MockImage to return oversized dimensions
    vi.stubGlobal(
      'Image',
      class extends MockImage {
        naturalWidth = 4096;
        naturalHeight = 4096;
      },
    );

    const file = createMockFile('big.png', 1000, 'image/png');
    await expect(readTextureFile(file)).rejects.toThrow('dimensionsTooLarge');
  });
});
