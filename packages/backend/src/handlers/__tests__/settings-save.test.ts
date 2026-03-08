import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../settings-save';

vi.mock('../../lib/dynamo', () => ({
  getSession: vi.fn(),
  storeUserSettings: vi.fn(),
}));

import { getSession, storeUserSettings } from '../../lib/dynamo';

function makeEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
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
});
