import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getSession, storeUserSettings } from '../lib/dynamo';
import { checkBodySize, checkSettingsSize, validateSettings } from '../lib/validation';
import { jsonResponse, errorResponse, parseJsonBody } from '../types/api';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const sizeError = checkBodySize(event.body);
  if (sizeError) {
    return errorResponse(413, sizeError);
  }

  const body = parseJsonBody(event.body);
  if (!body) {
    return errorResponse(400, 'Request body must be a JSON object');
  }

  const sessionId = body.sessionId;
  if (typeof sessionId !== 'string' || !sessionId) {
    return errorResponse(400, 'Missing "sessionId" in request body');
  }

  const result = validateSettings(body.settings);
  if (!result.valid) {
    return errorResponse(400, result.error);
  }

  const storedSizeError = checkSettingsSize(result.settings);
  if (storedSizeError) {
    return errorResponse(413, storedSizeError);
  }

  try {
    const session = await getSession(sessionId);
    if (!session) {
      // 401, not 404: the client treats 401 as "session gone, reconnect", and a 404
      // is also what API Gateway returns for an unknown route
      return errorResponse(401, 'Session expired. Please reconnect.');
    }

    await storeUserSettings(session.spotifyUserId, result.settings);

    return jsonResponse(200, { success: true });
  } catch (err) {
    console.error('Settings save error:', err);
    return errorResponse(500, 'Failed to save settings');
  }
}
