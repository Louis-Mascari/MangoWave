import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../auth-refresh';

vi.mock('../../lib/spotify', () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock('../../lib/dynamo', () => ({
  getSession: vi.fn(),
  updateSessionToken: vi.fn(),
}));

import { refreshAccessToken } from '../../lib/spotify';
import { getSession, updateSessionToken } from '../../lib/dynamo';

function makeEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    requestContext: { http: { method: 'POST' } },
  } as unknown as APIGatewayProxyEventV2;
}

describe('auth-refresh handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if sessionId is missing', async () => {
    const result = await handler(makeEvent({}));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 if no stored session exists', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const result = await handler(makeEvent({ sessionId: 'sess_abc' }));
    expect(result.statusCode).toBe(404);
  });

  it('refreshes token and returns new access token', async () => {
    vi.mocked(getSession).mockResolvedValue({
      spotifyUserId: 'user1',
      refreshToken: 'rt_old',
    });
    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: 'at_new',
      token_type: 'Bearer',
      scope: 'user-read-currently-playing',
      expires_in: 3600,
      refresh_token: 'rt_new',
    });
    vi.mocked(updateSessionToken).mockResolvedValue(undefined);

    const result = await handler(makeEvent({ sessionId: 'sess_abc' }));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.accessToken).toBe('at_new');
    expect(updateSessionToken).toHaveBeenCalledWith('sess_abc', 'rt_new');
  });

  it('returns 500 on refresh failure', async () => {
    vi.mocked(getSession).mockResolvedValue({
      spotifyUserId: 'user1',
      refreshToken: 'rt_old',
    });
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('expired'));

    const result = await handler(makeEvent({ sessionId: 'sess_abc' }));
    expect(result.statusCode).toBe(500);
  });
});
