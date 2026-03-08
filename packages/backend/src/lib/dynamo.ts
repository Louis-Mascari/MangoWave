import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

function getTableName(): string {
  const name = process.env.TABLE_NAME;
  if (!name) throw new Error('Missing TABLE_NAME environment variable');
  return name;
}

export interface SessionRecord {
  spotifyUserId: string;
  refreshToken: string;
}

export async function storeSession(
  sessionId: string,
  spotifyUserId: string,
  refreshToken: string,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        PK: `SESSION#${sessionId}`,
        SK: 'AUTH',
        spotifyUserId,
        refreshToken,
        createdAt: new Date().toISOString(),
      },
    }),
  );
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        PK: `SESSION#${sessionId}`,
        SK: 'AUTH',
      },
    }),
  );

  if (!result.Item) return null;

  return {
    spotifyUserId: result.Item.spotifyUserId as string,
    refreshToken: result.Item.refreshToken as string,
  };
}

export async function updateSessionToken(sessionId: string, refreshToken: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: {
        PK: `SESSION#${sessionId}`,
        SK: 'AUTH',
      },
      UpdateExpression: 'SET refreshToken = :rt, updatedAt = :ua',
      ExpressionAttributeValues: {
        ':rt': refreshToken,
        ':ua': new Date().toISOString(),
      },
    }),
  );
}

export interface UserSettings {
  theme: string;
  transitionTime: number;
  eqSettings: {
    preAmpGain: number;
    bandGains: number[];
  };
  blockedPresets: string[];
  favoritePresets: string[];
}

export async function storeUserSettings(
  spotifyUserId: string,
  settings: UserSettings,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        PK: `USER#${spotifyUserId}`,
        SK: 'SETTINGS',
        ...settings,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}

export async function getUserSettings(spotifyUserId: string): Promise<UserSettings | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        PK: `USER#${spotifyUserId}`,
        SK: 'SETTINGS',
      },
    }),
  );

  if (!result.Item) return null;

  return {
    theme: result.Item.theme as string,
    transitionTime: result.Item.transitionTime as number,
    eqSettings: result.Item.eqSettings as UserSettings['eqSettings'],
    blockedPresets: result.Item.blockedPresets as string[],
    favoritePresets: result.Item.favoritePresets as string[],
  };
}
