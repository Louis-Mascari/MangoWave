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

const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

function ttlEpoch(): number {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
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
        ttl: ttlEpoch(),
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
      UpdateExpression: 'SET refreshToken = :rt, updatedAt = :ua, #ttl = :ttl',
      ExpressionAttributeNames: {
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':rt': refreshToken,
        ':ua': new Date().toISOString(),
        ':ttl': ttlEpoch(),
      },
    }),
  );
}

export interface PerformanceSettings {
  fpsCap: number;
  resolutionScale: number;
  meshWidth: number;
  meshHeight: number;
  textureRatio: number;
  fxaa: boolean;
  autoQuality: boolean;
}

export interface AudioSettings {
  smoothingConstant: number;
  fftSize: number;
}

export interface AutopilotSettings {
  enabled: boolean;
  interval: number;
  mode: string;
  favoriteWeight: number;
}

export interface CustomPack {
  id: string;
  name: string;
  presets: string[];
  createdAt: number;
}

export interface UserSettings {
  performance: PerformanceSettings;
  eqSettings: {
    preAmpGain: number;
    bandGains: number[];
  };
  audio: AudioSettings;
  autopilot: AutopilotSettings;
  transitionTime: number;
  blockedPresets: string[];
  favoritePresets: string[];
  enabledPacks: string[];
  excludedOverrides: string[];
  presetNameDisplay: 'off' | 'always' | number;
  songInfoDisplay: 'off' | number;
  volume: number;
  customPacks: CustomPack[];
  activeCustomPackId: string | null;
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
    performance: result.Item.performance as PerformanceSettings,
    eqSettings: result.Item.eqSettings as UserSettings['eqSettings'],
    audio: result.Item.audio as AudioSettings,
    autopilot: result.Item.autopilot as AutopilotSettings,
    transitionTime: result.Item.transitionTime as number,
    blockedPresets: result.Item.blockedPresets as string[],
    favoritePresets: result.Item.favoritePresets as string[],
    enabledPacks: result.Item.enabledPacks as string[],
    excludedOverrides: result.Item.excludedOverrides as string[],
    presetNameDisplay: result.Item.presetNameDisplay as 'off' | 'always' | number,
    songInfoDisplay: result.Item.songInfoDisplay as 'off' | number,
    volume: result.Item.volume as number,
    customPacks: (result.Item.customPacks as CustomPack[]) ?? [],
    activeCustomPackId: (result.Item.activeCustomPackId as string | null) ?? null,
  };
}
