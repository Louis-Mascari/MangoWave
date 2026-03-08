import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../auth-callback';

vi.mock('../../lib/spotify', () => ({
  exchangeCodeForTokens: vi.fn(),
  getUserProfile: vi.fn(),
}));

vi.mock('../../lib/dynamo', () => ({
  storeSession: vi.fn(),
}));

import { exchangeCodeForTokens, getUserProfile } from '../../lib/spotify';
import { storeSession } from '../../lib/dynamo';

function makeEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    requestContext: { http: { method: 'POST' } },
  } as unknown as APIGatewayProxyEventV2;
}

describe('auth-callback handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if code is missing', async () => {
    const result = await handler(makeEvent({}));
    expect(result.statusCode).toBe(400);
  });

  it('exchanges code and returns access token with user profile', async () => {
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'at_123',
      token_type: 'Bearer',
      scope: 'user-read-currently-playing',
      expires_in: 3600,
      refresh_token: 'rt_456',
    });

    vi.mocked(getUserProfile).mockResolvedValue({
      id: 'user1',
      display_name: 'Test User',
      images: [{ url: 'https://img.spotify.com/1.jpg', width: 64, height: 64 }],
      product: 'premium',
    });

    vi.mocked(storeSession).mockResolvedValue(undefined);

    const result = await handler(makeEvent({ code: 'auth_code_123' }));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.accessToken).toBe('at_123');
    expect(body.expiresIn).toBe(3600);
    expect(body.sessionId).toBeDefined();
    expect(body.user.id).toBe('user1');
    expect(body.user.product).toBe('premium');

    expect(storeSession).toHaveBeenCalledWith(expect.any(String), 'user1', 'rt_456');
  });

  it('returns 500 on spotify API failure', async () => {
    vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error('bad code'));

    const result = await handler(makeEvent({ code: 'bad' }));
    expect(result.statusCode).toBe(500);
  });
});
