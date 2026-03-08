import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getSession, getUserSettings } from '../lib/dynamo';
import { jsonResponse, errorResponse } from '../types/api';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return jsonResponse(200, {});
  }

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

    const settings = await getUserSettings(session.spotifyUserId);

    return jsonResponse(200, { settings });
  } catch (err) {
    console.error('Settings load error:', err);
    return errorResponse(500, 'Failed to load settings');
  }
}
