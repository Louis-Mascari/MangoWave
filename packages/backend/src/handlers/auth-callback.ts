import { randomUUID } from 'crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { exchangeCodeForTokens, getUserProfile } from '../lib/spotify';
import { storeSession } from '../lib/dynamo';
import { jsonResponse, errorResponse } from '../types/api';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let body: Record<string, unknown>;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return errorResponse(400, 'Invalid JSON in request body');
  }

  const code = body.code as string | undefined;

  if (!code) {
    return errorResponse(400, 'Missing "code" in request body');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await getUserProfile(tokens.access_token);

    const sessionId = randomUUID();

    if (tokens.refresh_token) {
      await storeSession(sessionId, profile.id, tokens.refresh_token);
    }

    return jsonResponse(200, {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      sessionId,
      user: {
        id: profile.id,
        displayName: profile.display_name,
        imageUrl: profile.images?.[0]?.url ?? null,
        product: profile.product ?? null,
      },
    });
  } catch (err) {
    console.error('Auth callback error:', err);
    return errorResponse(500, 'Failed to exchange authorization code');
  }
}
