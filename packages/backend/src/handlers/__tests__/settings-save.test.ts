import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../settings-save';

vi.mock('../../lib/dynamo', () => ({
  getSession: vi.fn(),
  storeUserSettings: vi.fn(),
}));

import { getSession, storeUserSettings } from '../../lib/dynamo';

function makeEvent(
  body: Record<string, unknown>,
  overrides?: Partial<APIGatewayProxyEventV2>,
): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    requestContext: { http: { method: 'POST' } },
    ...overrides,
  } as unknown as APIGatewayProxyEventV2;
}

function makeRawEvent(body: string): APIGatewayProxyEventV2 {
  return {
    body,
    requestContext: { http: { method: 'POST' } },
  } as unknown as APIGatewayProxyEventV2;
}

const mockSettings = {
  theme: 'default',
  transitionTime: 2.0,
  eqSettings: { preAmpGain: 1.0, bandGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  blockedPresets: ['bad-preset'],
  favoritePresets: ['good-preset'],
};

describe('settings-save handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if sessionId is missing', async () => {
    const result = await handler(makeEvent({ settings: mockSettings }));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 if settings is missing', async () => {
    const result = await handler(makeEvent({ sessionId: 'sess_1' }));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 if session not found', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const result = await handler(makeEvent({ sessionId: 'sess_1', settings: mockSettings }));
    expect(result.statusCode).toBe(404);
  });

  it('saves settings and returns success', async () => {
    vi.mocked(getSession).mockResolvedValue({
      spotifyUserId: 'user1',
      refreshToken: 'rt_1',
    });
    vi.mocked(storeUserSettings).mockResolvedValue(undefined);

    const result = await handler(makeEvent({ sessionId: 'sess_1', settings: mockSettings }));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.success).toBe(true);
    expect(storeUserSettings).toHaveBeenCalledWith('user1', mockSettings);
  });

  it('returns 500 on dynamo failure', async () => {
    vi.mocked(getSession).mockRejectedValue(new Error('DynamoDB error'));
    const result = await handler(makeEvent({ sessionId: 'sess_1', settings: mockSettings }));
    expect(result.statusCode).toBe(500);
  });

  // ─── Validation tests ───────────────────────────────────────────

  it('returns 413 for oversized request body', async () => {
    const bigBody = 'x'.repeat(1024 * 1024 + 1);
    const result = await handler(makeRawEvent(bigBody));
    expect(result.statusCode).toBe(413);
  });

  it('returns 400 if settings is not an object', async () => {
    const result = await handler(makeEvent({ sessionId: 'sess_1', settings: 'not-an-object' }));
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('Settings must be an object');
  });

  it('returns 400 if settings is an array', async () => {
    const result = await handler(makeEvent({ sessionId: 'sess_1', settings: [1, 2, 3] }));
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('Settings must be an object');
  });

  it('returns 400 if theme is not a string', async () => {
    const result = await handler(
      makeEvent({ sessionId: 'sess_1', settings: { ...mockSettings, theme: 123 } }),
    );
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('theme must be a string');
  });

  it('returns 400 if theme exceeds max length', async () => {
    const result = await handler(
      makeEvent({ sessionId: 'sess_1', settings: { ...mockSettings, theme: 'a'.repeat(51) } }),
    );
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('theme exceeds maximum length');
  });

  it('returns 400 if transitionTime is not a number', async () => {
    const result = await handler(
      makeEvent({ sessionId: 'sess_1', settings: { ...mockSettings, transitionTime: 'fast' } }),
    );
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('transitionTime must be a finite number');
  });

  it('clamps transitionTime to valid range', async () => {
    vi.mocked(getSession).mockResolvedValue({ spotifyUserId: 'user1', refreshToken: 'rt_1' });
    vi.mocked(storeUserSettings).mockResolvedValue(undefined);

    await handler(
      makeEvent({ sessionId: 'sess_1', settings: { ...mockSettings, transitionTime: 999 } }),
    );
    expect(storeUserSettings).toHaveBeenCalledWith(
      'user1',
      expect.objectContaining({ transitionTime: 30 }),
    );
  });

  it('returns 400 if eqSettings is missing', async () => {
    const { eqSettings: _, ...noEq } = mockSettings;
    void _;
    const result = await handler(makeEvent({ sessionId: 'sess_1', settings: noEq }));
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('eqSettings must be an object');
  });

  it('returns 400 if bandGains has wrong count', async () => {
    const result = await handler(
      makeEvent({
        sessionId: 'sess_1',
        settings: { ...mockSettings, eqSettings: { preAmpGain: 0, bandGains: [0, 0, 0] } },
      }),
    );
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('exactly 10 items');
  });

  it('returns 400 if bandGains contains non-number', async () => {
    const result = await handler(
      makeEvent({
        sessionId: 'sess_1',
        settings: {
          ...mockSettings,
          eqSettings: { preAmpGain: 0, bandGains: [0, 0, 'bad', 0, 0, 0, 0, 0, 0, 0] },
        },
      }),
    );
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('bandGains[2] must be a finite number');
  });

  it('clamps gain values to valid range', async () => {
    vi.mocked(getSession).mockResolvedValue({ spotifyUserId: 'user1', refreshToken: 'rt_1' });
    vi.mocked(storeUserSettings).mockResolvedValue(undefined);

    await handler(
      makeEvent({
        sessionId: 'sess_1',
        settings: {
          ...mockSettings,
          eqSettings: { preAmpGain: 99, bandGains: [-99, 0, 0, 0, 0, 0, 0, 0, 0, 99] },
        },
      }),
    );
    expect(storeUserSettings).toHaveBeenCalledWith(
      'user1',
      expect.objectContaining({
        eqSettings: { preAmpGain: 12, bandGains: [-12, 0, 0, 0, 0, 0, 0, 0, 0, 12] },
      }),
    );
  });

  it('returns 400 if blockedPresets is not an array', async () => {
    const result = await handler(
      makeEvent({ sessionId: 'sess_1', settings: { ...mockSettings, blockedPresets: 'wrong' } }),
    );
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('blockedPresets must be an array');
  });

  it('returns 400 if a preset name is too long', async () => {
    const result = await handler(
      makeEvent({
        sessionId: 'sess_1',
        settings: { ...mockSettings, favoritePresets: ['a'.repeat(201)] },
      }),
    );
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('exceeds maximum length');
  });

  it('returns 400 if preset list item is not a string', async () => {
    const result = await handler(
      makeEvent({
        sessionId: 'sess_1',
        settings: { ...mockSettings, blockedPresets: [123] },
      }),
    );
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
    expect(body.error).toContain('blockedPresets[0] must be a string');
  });

  it('strips unexpected keys from settings', async () => {
    vi.mocked(getSession).mockResolvedValue({ spotifyUserId: 'user1', refreshToken: 'rt_1' });
    vi.mocked(storeUserSettings).mockResolvedValue(undefined);

    await handler(
      makeEvent({
        sessionId: 'sess_1',
        settings: { ...mockSettings, maliciousField: '<script>alert(1)</script>' },
      }),
    );
    const savedSettings = vi.mocked(storeUserSettings).mock.calls[0][1];
    expect(savedSettings).not.toHaveProperty('maliciousField');
    expect(Object.keys(savedSettings)).toEqual([
      'theme',
      'transitionTime',
      'eqSettings',
      'blockedPresets',
      'favoritePresets',
    ]);
  });

  it('returns 400 for NaN transitionTime', async () => {
    const result = await handler(
      makeEvent({
        sessionId: 'sess_1',
        settings: { ...mockSettings, transitionTime: NaN },
      }),
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for Infinity preAmpGain', async () => {
    const result = await handler(
      makeEvent({
        sessionId: 'sess_1',
        settings: {
          ...mockSettings,
          eqSettings: {
            preAmpGain: Infinity,
            bandGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
        },
      }),
    );
    expect(result.statusCode).toBe(400);
  });
});
