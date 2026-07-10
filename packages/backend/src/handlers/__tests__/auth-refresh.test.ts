import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../auth-refresh';

vi.mock('../../lib/spotify', async () => {
  const actual = await vi.importActual<typeof import('../../lib/spotify')>('../../lib/spotify');
  return {
    ...actual,
    refreshAccessToken: vi.fn(),
  };
});

vi.mock('../../lib/dynamo', () => ({
  getSession: vi.fn(),
  updateSessionToken: vi.fn(),
  deleteSession: vi.fn(),
}));

import { refreshAccessToken, InvalidGrantError } from '../../lib/spotify';
import { getSession, updateSessionToken, deleteSession } from '../../lib/dynamo';

function makeEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    requestContext: { http: { method: 'POST' } },
  } as unknown as APIGatewayProxyEventV2;
}

async function invoke(body: Record<string, unknown>): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(makeEvent(body))) as APIGatewayProxyStructuredResultV2;
}

describe('auth-refresh handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if sessionId is missing', async () => {
    const result = await invoke({});
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 if no stored session exists', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const result = await invoke({ sessionId: 'sess_abc' });
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

    const result = await invoke({ sessionId: 'sess_abc' });
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.accessToken).toBe('at_new');
    expect(updateSessionToken).toHaveBeenCalledWith('sess_abc', 'rt_new');
  });

  it('returns 500 on a transient refresh failure without discarding the session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getSession).mockResolvedValue({
      spotifyUserId: 'user1',
      refreshToken: 'rt_old',
    });
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('Spotify 503'));

    const result = await invoke({ sessionId: 'sess_abc' });
    expect(result.statusCode).toBe(500);
    // Transient failures must NOT discard the (still-valid) refresh token.
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('returns 401 and discards the session when the refresh token is expired', async () => {
    vi.mocked(getSession).mockResolvedValue({
      spotifyUserId: 'user1',
      refreshToken: 'rt_dead',
    });
    vi.mocked(refreshAccessToken).mockRejectedValue(new InvalidGrantError());
    vi.mocked(deleteSession).mockResolvedValue(undefined);

    const result = await invoke({ sessionId: 'sess_abc' });
    expect(result.statusCode).toBe(401);
    expect(deleteSession).toHaveBeenCalledWith('sess_abc');
  });
});
