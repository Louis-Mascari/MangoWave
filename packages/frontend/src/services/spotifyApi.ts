const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export interface SpotifyUser {
  id: string;
  displayName: string | null;
  imageUrl: string | null;
  product: string | null; // "premium", "free", "open"
}

export interface NowPlayingTrack {
  title: string;
  artist: string;
  albumName: string;
  albumArtUrl: string | null;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  deviceName: string | null;
  shuffleState: boolean;
  repeatState: 'off' | 'track' | 'context';
}

export interface SpotifyAuthResponse {
  accessToken: string;
  expiresIn: number;
  sessionId: string;
  user: SpotifyUser;
}

const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

export function buildSpotifyAuthUrl(clientIdOverride?: string): string {
  const clientId = clientIdOverride ?? import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error('Missing VITE_SPOTIFY_CLIENT_ID or VITE_SPOTIFY_REDIRECT_URI env vars');
  }

  const state = crypto.randomUUID();
  sessionStorage.setItem('spotify_auth_state', state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<SpotifyAuthResponse> {
  const apiUrl = import.meta.env.VITE_API_URL;
  const response = await fetch(`${apiUrl}/auth/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to exchange code');
  }

  return response.json() as Promise<SpotifyAuthResponse>;
}

export async function refreshToken(
  sessionId: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const apiUrl = import.meta.env.VITE_API_URL;
  const response = await fetch(`${apiUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  return response.json() as Promise<{ accessToken: string; expiresIn: number }>;
}

export async function getNowPlaying(accessToken: string): Promise<NowPlayingTrack | null> {
  const response = await fetch(`${SPOTIFY_API_BASE}/me/player`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 204 || response.status === 404) {
    return null; // Nothing playing
  }

  if (response.status === 401) {
    throw new TokenExpiredError();
  }

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
    throw new RateLimitedError(retryAfter);
  }

  if (!response.ok) {
    throw new Error(`Spotify API error (${response.status})`);
  }

  const data = await response.json();
  if (!data.item || data.currently_playing_type !== 'track') {
    return null; // Podcast or other non-track content
  }

  return {
    title: data.item.name,
    artist: data.item.artists.map((a: { name: string }) => a.name).join(', '),
    albumName: data.item.album.name,
    albumArtUrl: data.item.album.images?.[0]?.url ?? null,
    isPlaying: data.is_playing,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item.duration_ms,
    deviceName: data.device?.name ?? null,
    shuffleState: data.shuffle_state ?? false,
    repeatState: data.repeat_state ?? 'off',
  };
}

export async function controlPlayback(
  accessToken: string,
  action: 'play' | 'pause' | 'next' | 'previous',
): Promise<void> {
  let url: string;
  let method: string;

  switch (action) {
    case 'play':
      url = `${SPOTIFY_API_BASE}/me/player/play`;
      method = 'PUT';
      break;
    case 'pause':
      url = `${SPOTIFY_API_BASE}/me/player/pause`;
      method = 'PUT';
      break;
    case 'next':
      url = `${SPOTIFY_API_BASE}/me/player/next`;
      method = 'POST';
      break;
    case 'previous':
      url = `${SPOTIFY_API_BASE}/me/player/previous`;
      method = 'POST';
      break;
  }

  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    throw new TokenExpiredError();
  }

  if (response.status === 403) {
    await handleForbidden(response);
  }

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
    throw new RateLimitedError(retryAfter);
  }

  if (!response.ok) {
    throw new Error(`Playback control failed (${response.status})`);
  }
}

export async function seekToPosition(accessToken: string, positionMs: number): Promise<void> {
  const response = await fetch(
    `${SPOTIFY_API_BASE}/me/player/seek?position_ms=${Math.round(positionMs)}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (response.status === 401) throw new TokenExpiredError();
  if (response.status === 403) await handleForbidden(response);
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
    throw new RateLimitedError(retryAfter);
  }
  if (!response.ok) throw new Error(`Seek failed (${response.status})`);
}

export async function toggleShuffle(accessToken: string, state: boolean): Promise<void> {
  const url = `${SPOTIFY_API_BASE}/me/player/shuffle?state=${state}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) throw new TokenExpiredError();
  if (response.status === 403) await handleForbidden(response);
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
    throw new RateLimitedError(retryAfter);
  }
  if (!response.ok) throw new Error(`Toggle shuffle failed (${response.status})`);
}

export async function setRepeatMode(
  accessToken: string,
  state: 'off' | 'track' | 'context',
): Promise<void> {
  const url = `${SPOTIFY_API_BASE}/me/player/repeat?state=${state}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) throw new TokenExpiredError();
  if (response.status === 403) await handleForbidden(response);
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
    throw new RateLimitedError(retryAfter);
  }
  if (!response.ok) throw new Error(`Set repeat mode failed (${response.status})`);
}

export interface CloudSettings {
  theme: string;
  transitionTime: number;
  eqSettings: {
    preAmpGain: number;
    bandGains: number[];
  };
  blockedPresets: string[];
  favoritePresets: string[];
}

export async function saveSettings(sessionId: string, settings: CloudSettings): Promise<void> {
  const apiUrl = import.meta.env.VITE_API_URL;
  const response = await fetch(`${apiUrl}/settings/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, settings }),
  });

  if (!response.ok) {
    throw new Error('Failed to save settings');
  }
}

export async function loadSettings(sessionId: string): Promise<CloudSettings | null> {
  const apiUrl = import.meta.env.VITE_API_URL;
  const response = await fetch(`${apiUrl}/settings/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    throw new Error('Failed to load settings');
  }

  const data = await response.json();
  return data.settings ?? null;
}

export class TokenExpiredError extends Error {
  constructor() {
    super('Access token expired');
    this.name = 'TokenExpiredError';
  }
}

export class PremiumRequiredError extends Error {
  constructor() {
    super('Spotify Premium is required for playback controls');
    this.name = 'PremiumRequiredError';
  }
}

export class RateLimitedError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited — retry after ${retryAfterSeconds}s`);
    this.name = 'RateLimitedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Parse a 403 response from Spotify and throw the appropriate error.
 * Only throws PremiumRequiredError when Spotify explicitly indicates PREMIUM_REQUIRED.
 * Other 403 reasons (stale token, player command failure, etc.) throw a generic error.
 */
async function handleForbidden(response: Response): Promise<never> {
  try {
    const data = await response.json();
    const reason: string | undefined = data?.error?.reason;
    if (reason === 'PREMIUM_REQUIRED') {
      throw new PremiumRequiredError();
    }
    throw new Error(data?.error?.message ?? `Spotify API error (403)`);
  } catch (err) {
    if (err instanceof PremiumRequiredError) throw err;
    if (err instanceof Error && err.message !== 'Unexpected end of JSON input') throw err;
    throw new Error('Spotify API error (403)');
  }
}
