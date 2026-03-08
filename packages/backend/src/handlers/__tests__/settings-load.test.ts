import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../settings-load';

vi.mock('../../lib/dynamo', () => ({
  getSession: vi.fn(),
  getUserSettings: vi.fn(),
}));

import { getSession, getUserSettings } from '../../lib/dynamo';

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
  blockedPresets: [],
  favoritePresets: ['fav-preset'],
};

describe('settings-load handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if sessionId is missing', async () => {
    const result = await handler(makeEvent({}));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 if session not found', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const result = await handler(makeEvent({ sessionId: 'sess_1' }));
    expect(result.statusCode).toBe(404);
  });

  it('returns settings when they exist', async () => {
    vi.mocked(getSession).mockResolvedValue({
      spotifyUserId: 'user1',
      refreshToken: 'rt_1',
    });
    vi.mocked(getUserSettings).mockResolvedValue(mockSettings);

    const result = await handler(makeEvent({ sessionId: 'sess_1' }));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.settings).toEqual(mockSettings);
  });

  it('returns null settings when none exist', async () => {
    vi.mocked(getSession).mockResolvedValue({
      spotifyUserId: 'user1',
      refreshToken: 'rt_1',
    });
    vi.mocked(getUserSettings).mockResolvedValue(null);

    const result = await handler(makeEvent({ sessionId: 'sess_1' }));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.settings).toBeNull();
  });

  it('returns 500 on dynamo failure', async () => {
    vi.mocked(getSession).mockRejectedValue(new Error('DynamoDB error'));
    const result = await handler(makeEvent({ sessionId: 'sess_1' }));
    expect(result.statusCode).toBe(500);
  });
});
