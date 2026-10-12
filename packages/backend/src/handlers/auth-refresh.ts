import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { refreshAccessToken, InvalidGrantError } from '../lib/spotify';
import { getSession, updateSessionToken, deleteSession } from '../lib/dynamo';
import { jsonResponse, errorResponse, parseJsonBody } from '../types/api';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseJsonBody(event.body);
  if (!body) {
    return errorResponse(400, 'Request body must be a JSON object');
  }

  const sessionId = body.sessionId;

  if (typeof sessionId !== 'string' || !sessionId) {
    return errorResponse(400, 'Missing "sessionId" in request body');
  }

  try {
    const session = await getSession(sessionId);
    if (!session) {
      // 401, not 404: the client treats 401 as "session gone, reconnect", and a 404
      // is also what API Gateway returns for an unknown route
      return errorResponse(401, 'Session expired. Please reconnect.');
    }

    const tokens = await refreshAccessToken(session.refreshToken);

    if (tokens.refresh_token) {
      // Spotify may rotate refresh tokens — store the new one if provided
      await updateSessionToken(sessionId, tokens.refresh_token);
    } else {
      // No rotation: rewrite the same token so the session TTL slides and an active
      // user is never logged out by the TTL alone. Not worth failing the refresh over.
      await updateSessionToken(sessionId, session.refreshToken).catch((e) =>
        console.error('Failed to extend session TTL:', e),
      );
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
