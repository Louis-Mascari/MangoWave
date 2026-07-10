import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { refreshAccessToken, InvalidGrantError } from '../lib/spotify';
import { getSession, updateSessionToken, deleteSession } from '../lib/dynamo';
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
    // An expired/revoked refresh token is permanently dead. Discard it so we
    // never retry, and return 401 so the client knows to force re-auth (as
    // opposed to a transient 500, which the client should retry).
    if (err instanceof InvalidGrantError) {
      await deleteSession(sessionId).catch((e) =>
        console.error('Failed to delete expired session:', e),
      );
      return errorResponse(401, 'Spotify session expired. Please reconnect.');
    }
    console.error('Auth refresh error:', err);
    return errorResponse(500, 'Failed to refresh access token');
  }
}
