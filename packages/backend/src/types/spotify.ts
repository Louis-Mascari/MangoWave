export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string | null;
  images: Array<{ url: string; width: number; height: number }>;
  product?: string; // "premium", "free", "open"
}
