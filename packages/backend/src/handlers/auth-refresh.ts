import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { refreshAccessToken } from '../lib/spotify';
import { getSession, updateSessionToken } from '../lib/dynamo';
import { jsonResponse, errorResponse } from '../types/api';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let body: Record<string, unknown>;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return errorResponse(400, 'Invalid JSON in request body');
  }

  const sessionId = body.sessionId as string | undefined;

  if (!sessionId) {
    return errorResponse(400, 'Missing "sessionId" in request body');
  }

  try {
    const session = await getSession(sessionId);
    if (!session) {
      return errorResponse(404, 'No stored session found. Please re-authenticate.');
    }

    const tokens = await refreshAccessToken(session.refreshToken);

    // Spotify may rotate refresh tokens — store the new one if provided
    if (tokens.refresh_token) {
      await updateSessionToken(sessionId, tokens.refresh_token);
    }

    return jsonResponse(200, {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
    });
  } catch (err) {
    console.error('Auth refresh error:', err);
    return errorResponse(500, 'Failed to refresh access token');
  }
}
