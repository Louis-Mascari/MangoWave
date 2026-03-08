import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import type { SpotifyTokenResponse, SpotifyUserProfile } from '../types/spotify';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

const ssmClient = new SSMClient({});
const paramCache: Record<string, string> = {};

async function getSsmParam(name: string): Promise<string> {
  if (paramCache[name]) return paramCache[name];

  const result = await ssmClient.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );

  const value = result.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${name} not found or empty`);

  paramCache[name] = value;
  return value;
}

async function getCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}> {
  const clientIdParam = process.env.SSM_SPOTIFY_CLIENT_ID;
  const clientSecretParam = process.env.SSM_SPOTIFY_CLIENT_SECRET;
  const redirectUriParam = process.env.SSM_SPOTIFY_REDIRECT_URI;

  if (!clientIdParam || !clientSecretParam || !redirectUriParam) {
    throw new Error('Missing SSM_SPOTIFY_* environment variables');
  }

  const [clientId, clientSecret, redirectUri] = await Promise.all([
    getSsmParam(clientIdParam),
    getSsmParam(clientSecretParam),
    getSsmParam(redirectUriParam),
  ]);

  return { clientId, clientSecret, redirectUri };
}

function basicAuth(clientId: string, clientSecret: string): string {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokenResponse> {
  const { clientId, clientSecret, redirectUri } = await getCredentials();

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(clientId, clientSecret),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify token exchange failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<SpotifyTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const { clientId, clientSecret } = await getCredentials();

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(clientId, clientSecret),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify token refresh failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<SpotifyTokenResponse>;
}

export async function getUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
  const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify profile (${response.status})`);
  }

  return response.json() as Promise<SpotifyUserProfile>;
}
