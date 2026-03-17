import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
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

async function invoke(body: Record<string, unknown>): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(makeEvent(body))) as APIGatewayProxyStructuredResultV2;
}

const mockSettings = {
  performance: {
    fpsCap: 60,
    resolutionScale: 1.0,
    meshWidth: 48,
    meshHeight: 36,
    textureRatio: 1.0,
    fxaa: false,
  },
  eqSettings: { preAmpGain: 1.0, bandGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  audio: { smoothingConstant: 0.3, fftSize: 1024 },
  autopilot: { enabled: true, interval: 15, mode: 'all', favoriteWeight: 2 },
  transitionTime: 2.0,
  blockedPresets: [],
  favoritePresets: ['fav-preset'],
  enabledPacks: ['Minimal', 'Non-Minimal'],
  excludedOverrides: [],
  presetNameDisplay: 5,
  songInfoDisplay: 5,
  volume: 0.5,
};

describe('settings-load handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if sessionId is missing', async () => {
    const result = await invoke({});
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 if session not found', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const result = await invoke({ sessionId: 'sess_1' });
    expect(result.statusCode).toBe(404);
  });

  it('returns settings when they exist', async () => {
    vi.mocked(getSession).mockResolvedValue({
      spotifyUserId: 'user1',
      refreshToken: 'rt_1',
    });
    vi.mocked(getUserSettings).mockResolvedValue(mockSettings);

    const result = await invoke({ sessionId: 'sess_1' });
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

    const result = await invoke({ sessionId: 'sess_1' });
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.settings).toBeNull();
  });

  it('returns 500 on dynamo failure', async () => {
    vi.mocked(getSession).mockRejectedValue(new Error('DynamoDB error'));
    const result = await invoke({ sessionId: 'sess_1' });
    expect(result.statusCode).toBe(500);
  });
});
