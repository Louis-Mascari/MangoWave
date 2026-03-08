import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isWebGL2Supported } from '../isWebGL2Supported.ts';

describe('isWebGL2Supported', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when WebGL 2 context is available', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as WebGL2RenderingContext,
    );
    expect(isWebGL2Supported()).toBe(true);
  });

  it('returns false when WebGL 2 context is null', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(isWebGL2Supported()).toBe(false);
  });

  it('returns false when getContext throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('WebGL not available');
    });
    expect(isWebGL2Supported()).toBe(false);
  });
});
