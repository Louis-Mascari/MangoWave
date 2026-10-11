import { randomUUID } from 'crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { exchangeCodeForTokens, getUserProfile, InvalidGrantError } from '../lib/spotify';
import { storeSession } from '../lib/dynamo';
import { jsonResponse, errorResponse, parseJsonBody } from '../types/api';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseJsonBody(event.body);
  if (!body) {
    return errorResponse(400, 'Request body must be a JSON object');
  }

  const code = body.code;

  if (typeof code !== 'string' || !code) {
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
    if (err instanceof InvalidGrantError) {
      // Spotify also answers invalid_grant for a redirect URI mismatch, which is our
      // misconfiguration. Keep the description in the logs without tripping the 5xx alarm.
      console.warn('Auth callback rejected:', err.message);
      return errorResponse(400, 'Authorization code is invalid or expired');
    }
    console.error('Auth callback error:', err);
    return errorResponse(500, 'Failed to exchange authorization code');
  }
}
