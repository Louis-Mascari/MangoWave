# @mangowave/backend

Lambda handlers for MangoWave's optional Spotify integration and cloud settings sync.

## Development

```bash
npm run build   # tsc
npm run test    # Vitest
```

Handlers are deployed via CDK (see `infrastructure/`). No local server — test with Vitest.

## Project Structure

```
src/
├── handlers/           # Lambda entry points (one per route)
│   ├── auth-callback.ts
│   ├── auth-refresh.ts
│   ├── settings-save.ts
│   └── settings-load.ts
├── lib/
│   ├── spotify.ts      # Spotify API client (token exchange, refresh, profile)
│   └── dynamo.ts       # DynamoDB operations (sessions, settings)
└── types/
    ├── api.ts          # Response helpers (jsonResponse, errorResponse)
    └── spotify.ts      # Spotify API response types
```

## Handlers

| Handler         | Method | Path             | Description                            |
| --------------- | ------ | ---------------- | -------------------------------------- |
| `auth-callback` | POST   | `/auth/callback` | Exchange Spotify OAuth code for tokens |
| `auth-refresh`  | POST   | `/auth/refresh`  | Refresh expired Spotify access token   |
| `settings-save` | POST   | `/settings/save` | Save user settings to DynamoDB         |
| `settings-load` | POST   | `/settings/load` | Load user settings from DynamoDB       |

All endpoints require a valid `sessionId` (except `auth-callback`, which creates one). Sessions are validated against DynamoDB on every request.

## OAuth Flow (Owner Mode)

The hosted site uses **owner-mode OAuth** — the backend proxies the Spotify OAuth flow using server-side client credentials stored in SSM Parameter Store. This is the only auth mode exposed in the hosted UI.

Spotify's dev mode policy (as of March 2026) limits each developer app to 1 Client ID, the app owner plus 5 authorized users, and requires a Premium account to register the app. Authorized users must be added to the developer app's User Management tab in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). Authorized users don't need Premium themselves.

1. Frontend redirects user to Spotify authorize page with CSRF `state`
2. Spotify redirects back with `?code=...&state=...`
3. Frontend calls `POST /auth/callback` with the code
4. Handler exchanges code for tokens via Spotify API using server-side client secret (from SSM)
5. Generates a `sessionId` (UUID) and stores the session in DynamoDB
6. Frontend uses the access token, auto-refreshes via `POST /auth/refresh`
7. If Spotify rotates the refresh token during a refresh, the new token is stored automatically

A PKCE-based flow also exists in the frontend code (`spotifyPkce.ts`) for self-hosters who want to use their own Spotify developer app without a backend proxy, but the UI for it has been removed from the hosted site.

## Settings Sync

Authenticated users can sync settings to the cloud via `settings-save` / `settings-load`. The synced settings include:

- Theme, transition time
- EQ settings (pre-amp gain + 10 band gains)
- Blocked presets, favorite presets

Settings are keyed to the user's Spotify ID (resolved from their session). Spotify credentials are never stored in settings.

## Security

- **Spotify client secret** stored in SSM Parameter Store (encrypted at rest), never exposed to the client
- **Session validation** on every request — all endpoints look up the `sessionId` in DynamoDB before proceeding
- **CORS** restricted to allowed origins at the API Gateway level (not open to `*`)
- **Input validation** — JSON parsing with try-catch, required fields validated before use
- **Error opacity** — generic 500 errors don't expose implementation details; 400/404 errors are specific

## Error Handling

- `403` from Spotify → non-Premium users still see Now Playing metadata but the frontend hides playback controls (seek, shuffle, repeat)
- `401` from Spotify → triggers automatic token refresh on the frontend
- `429` from Spotify → rate limit toast on frontend, polling pause with auto-resume
