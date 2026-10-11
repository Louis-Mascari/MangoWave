import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getSession, getUserSettings } from '../lib/dynamo';
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
      return errorResponse(404, 'No stored session found. Please re-authenticate.');
    }

    const settings = await getUserSettings(session.spotifyUserId);

    return jsonResponse(200, { settings });
  } catch (err) {
    console.error('Settings load error:', err);
    return errorResponse(500, 'Failed to load settings');
  }
}
