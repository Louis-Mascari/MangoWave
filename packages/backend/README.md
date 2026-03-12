# @mangowave/backend

Lambda handlers for MangoWave's optional Spotify integration and cloud settings sync.

## Development

```bash
npm run build   # tsc
npm run test    # Vitest
```

Handlers are deployed via CDK (see `infrastructure/`). No local server — test with Vitest.

## Handlers

| Handler         | Method | Path             | Description                            |
| --------------- | ------ | ---------------- | -------------------------------------- |
| `auth-callback` | POST   | `/auth/callback` | Exchange Spotify OAuth code for tokens |
| `auth-refresh`  | POST   | `/auth/refresh`  | Refresh expired Spotify access token   |
| `settings-save` | POST   | `/settings/save` | Save user settings to DynamoDB         |
| `settings-load` | GET    | `/settings/load` | Load user settings from DynamoDB       |

## OAuth Flow (Owner Mode)

The hosted site uses **owner-mode OAuth** — the backend proxies the Spotify OAuth flow using server-side client credentials stored in SSM Parameter Store. This is the only auth mode exposed in the hosted UI.

Spotify's dev mode policy (as of March 2026) limits each developer app to 1 Client ID, the app owner plus 5 authorized users, and requires a Premium account to register the app. Authorized users must be added to the developer app's User Management tab in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). Authorized users don't need Premium themselves.

1. Frontend redirects user to Spotify authorize page with CSRF `state`
2. Spotify redirects back with `?code=...&state=...`
3. Frontend calls `POST /auth/callback` with the code
4. Handler exchanges code for tokens via Spotify API using server-side client secret (from SSM)
5. Stores `sessionId -> {userId, refreshToken}` in DynamoDB
6. Frontend uses access token, auto-refreshes via `POST /auth/refresh`

A PKCE-based flow also exists in the frontend code (`spotifyPkce.ts`) for self-hosters who want to use their own Spotify developer app without a backend proxy, but the UI for it has been removed from the hosted site.

## Error Handling

- `403` from Spotify -> `PremiumRequiredError` — non-Premium users still see Now Playing metadata but the frontend hides playback controls (seek, shuffle, repeat)
- `401` from Spotify -> triggers automatic token refresh on the frontend
- `429` from Spotify -> rate limit toast on frontend, polling pause with auto-resume
