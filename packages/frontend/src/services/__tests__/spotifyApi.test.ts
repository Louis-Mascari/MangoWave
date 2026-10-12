import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  refreshToken,
  saveSettings,
  loadSettings,
  SessionExpiredError,
  SettingsRejectedError,
} from '../spotifyApi.ts';
import type { CloudSettings } from '../spotifyApi.ts';

function respondWith(status: number, body: unknown = {}) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

const settings = {} as CloudSettings;

describe('backend error mapping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats 401 from every session endpoint as an expired session', async () => {
    respondWith(401);
    await expect(refreshToken('s')).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(saveSettings('s', settings)).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(loadSettings('s')).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it.each([400, 413])('treats %i from settings save as a permanent rejection', async (status) => {
    respondWith(status);
    const err = await saveSettings('s', settings).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SettingsRejectedError);
    expect((err as SettingsRejectedError).status).toBe(status);
  });

  // A wrong API URL or a tripped kill-switch must never log the user out
  it.each([404, 429, 500, 503])('treats %i as transient everywhere', async (status) => {
    respondWith(status);
    for (const call of [refreshToken('s'), saveSettings('s', settings), loadSettings('s')]) {
      const err = await call.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(SessionExpiredError);
      expect(err).not.toBeInstanceOf(SettingsRejectedError);
    }
  });
});
