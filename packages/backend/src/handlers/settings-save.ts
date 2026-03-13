import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getSession, storeUserSettings } from '../lib/dynamo';
import { checkBodySize, validateSettings } from '../lib/validation';
import { jsonResponse, errorResponse } from '../types/api';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const sizeError = checkBodySize(event.body);
  if (sizeError) {
    return errorResponse(413, sizeError);
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

  const result = validateSettings(body.settings);
  if (!result.valid) {
    return errorResponse(400, result.error);
  }

  try {
    const session = await getSession(sessionId);
    if (!session) {
      return errorResponse(404, 'No stored session found. Please re-authenticate.');
    }

    await storeUserSettings(session.spotifyUserId, result.settings);

    return jsonResponse(200, { success: true });
  } catch (err) {
    console.error('Settings save error:', err);
    return errorResponse(500, 'Failed to save settings');
  }
}
