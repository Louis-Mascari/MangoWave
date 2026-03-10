import type { SpotifyUser } from './spotifyApi.ts';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return base64UrlEncode(bytes.buffer);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64UrlEncode(digest);
}

export async function buildPkceAuthUrl(
  clientId: string,
  redirectUri: string,
): Promise<{ url: string; verifier: string }> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  const state = crypto.randomUUID();
  sessionStorage.setItem('spotify_auth_state', state);
  sessionStorage.setItem('spotify_pkce_verifier', verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  return {
    url: `https://accounts.spotify.com/authorize?${params.toString()}`,
    verifier,
  };
}

export async function exchangeCodePkce(
  clientId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresIn: number; refreshToken: string }> {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error_description || 'PKCE token exchange failed');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token,
  };
}

export async function refreshTokenPkce(
  clientId: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number; refreshToken: string }> {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error('PKCE token refresh failed');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token ?? refreshToken,
  };
}

export async function getSpotifyProfile(accessToken: string): Promise<SpotifyUser> {
  const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Spotify profile');
  }

  const data = await response.json();
  return {
    id: data.id,
    displayName: data.display_name ?? null,
    imageUrl: data.images?.[0]?.url ?? null,
    product: data.product ?? null,
  };
}
