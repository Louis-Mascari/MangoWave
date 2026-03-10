import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge, exchangeCodePkce } from '../spotifyPkce.ts';

describe('spotifyPkce', () => {
  describe('generateCodeVerifier', () => {
    it('produces a non-empty base64url string', () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBeGreaterThan(40);
      // base64url: no +, /, or =
      expect(verifier).not.toMatch(/[+/=]/);
    });

    it('produces unique values', () => {
      const a = generateCodeVerifier();
      const b = generateCodeVerifier();
      expect(a).not.toBe(b);
    });
  });

  describe('generateCodeChallenge', () => {
    it('produces a non-empty base64url string from a verifier', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      expect(challenge.length).toBeGreaterThan(20);
      expect(challenge).not.toMatch(/[+/=]/);
    });

    it('is deterministic for the same input', async () => {
      const verifier = 'test-verifier-value';
      const a = await generateCodeChallenge(verifier);
      const b = await generateCodeChallenge(verifier);
      expect(a).toBe(b);
    });
  });

  describe('exchangeCodePkce', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('makes correct POST request', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'at_123',
          expires_in: 3600,
          refresh_token: 'rt_456',
        }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await exchangeCodePkce(
        'client123',
        'code456',
        'verifier789',
        'http://localhost:5173',
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://accounts.spotify.com/api/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      // Verify body params
      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = callArgs[1]?.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('client_id')).toBe('client123');
      expect(body.get('code')).toBe('code456');
      expect(body.get('code_verifier')).toBe('verifier789');

      expect(result).toEqual({
        accessToken: 'at_123',
        expiresIn: 3600,
        refreshToken: 'rt_456',
      });
    });

    it('throws on error response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error_description: 'Invalid code' }),
      });

      await expect(
        exchangeCodePkce('client123', 'badcode', 'verifier789', 'http://localhost:5173'),
      ).rejects.toThrow('Invalid code');
    });
  });
});
