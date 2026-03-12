import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  exchangeCodePkce,
  refreshTokenPkce,
  buildPkceAuthUrl,
} from '../spotifyPkce.ts';

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

  describe('refreshTokenPkce', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('sends correct refresh request and returns tokens', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new_at',
          expires_in: 3600,
          refresh_token: 'new_rt',
        }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await refreshTokenPkce('client123', 'old_rt');

      expect(fetch).toHaveBeenCalledWith(
        'https://accounts.spotify.com/api/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = callArgs[1]?.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('client_id')).toBe('client123');
      expect(body.get('refresh_token')).toBe('old_rt');

      expect(result).toEqual({
        accessToken: 'new_at',
        expiresIn: 3600,
        refreshToken: 'new_rt',
      });
    });

    it('falls back to old refresh token when none returned', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new_at',
          expires_in: 3600,
          // no refresh_token in response
        }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await refreshTokenPkce('client123', 'old_rt');
      expect(result.refreshToken).toBe('old_rt');
    });

    it('throws on error response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

      await expect(refreshTokenPkce('client123', 'old_rt')).rejects.toThrow(
        'PKCE token refresh failed',
      );
    });
  });

  describe('buildPkceAuthUrl', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      sessionStorage.clear();
    });

    it('builds a valid auth URL with PKCE params', async () => {
      const { url, verifier } = await buildPkceAuthUrl(
        'test_client',
        'http://localhost:5173/callback',
      );

      expect(verifier.length).toBeGreaterThan(40);
      expect(url).toContain('https://accounts.spotify.com/authorize');
      expect(url).toContain('client_id=test_client');
      expect(url).toContain('response_type=code');
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('code_challenge=');
      expect(url).toContain('redirect_uri=');
    });

    it('stores state and verifier in sessionStorage', async () => {
      await buildPkceAuthUrl('test_client', 'http://localhost:5173/callback');

      expect(sessionStorage.getItem('spotify_auth_state')).toBeTruthy();
      expect(sessionStorage.getItem('spotify_pkce_verifier')).toBeTruthy();
    });

    it('includes required scopes', async () => {
      const { url } = await buildPkceAuthUrl('test_client', 'http://localhost:5173/callback');

      const params = new URLSearchParams(url.split('?')[1]);
      const scopes = params.get('scope') ?? '';
      expect(scopes).toContain('user-read-currently-playing');
      expect(scopes).toContain('user-read-playback-state');
      expect(scopes).toContain('user-modify-playback-state');
    });
  });
});
