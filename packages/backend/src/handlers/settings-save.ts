import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getSession, storeUserSettings } from '../lib/dynamo';
import type { UserSettings } from '../lib/dynamo';
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

  const settings = body.settings as UserSettings | undefined;
  if (!settings) {
    return errorResponse(400, 'Missing "settings" in request body');
  }

  try {
    const session = await getSession(sessionId);
    if (!session) {
      return errorResponse(404, 'No stored session found. Please re-authenticate.');
    }

    await storeUserSettings(session.spotifyUserId, settings);

    return jsonResponse(200, { success: true });
  } catch (err) {
    console.error('Settings save error:', err);
    return errorResponse(500, 'Failed to save settings');
  }
}
