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
│   ├── __tests__/      # Handler tests (auth-callback, auth-refresh, settings-save, settings-load)
│   ├── auth-callback.ts
│   ├── auth-refresh.ts
│   ├── settings-save.ts
│   └── settings-load.ts
├── lib/
│   ├── __tests__/      # Lib tests (validation)
│   ├── spotify.ts      # Spotify API client (token exchange, refresh, profile)
│   ├── dynamo.ts       # DynamoDB operations (sessions, settings)
│   └── validation.ts   # Server-side settings validation (type, range, size checks)
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

The hosted site uses **owner-mode OAuth** — the backend proxies the Spotify OAuth flow using server-side client credentials stored in SSM Parameter Store. This is the only auth mode exposed in the hosted UI. Settings sync (below) is gated behind Spotify auth as a security measure — it prevents anonymous writes, but the synced data covers all visualizer settings, not just Spotify-related ones.

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

Authenticated users can sync all visualizer settings to the cloud via `settings-save` / `settings-load`. The synced payload mirrors the frontend Zustand store:

- **performance** — fpsCap (0/15–300), resolutionScale (0.25–1.0), mesh resolution (meshWidth 16–128 / meshHeight 12–96), texture quality (0.25–2.0), fxaa
- **eqSettings** — pre-amp gain (0–3 linear) + 10 band gains (±12 dB)
- **audio** — smoothingConstant (0–1), fftSize (512/1024/2048/4096)
- **autopilot** — enabled, interval (5–120s), mode (all/favorites), favoriteWeight (1–10)
- **transitionTime** — preset blend duration (0–30s)
- **blockedPresets / favoritePresets** — preset name lists (up to 500 items, 200 chars each)
- **enabledPacks** — active butterchurn pack names (up to 100 items)
- **excludedOverrides** — user-restored excluded presets (up to 500 items)
- **presetNameDisplay** — "off", "always", or duration in seconds (1–10)
- **songInfoDisplay** — "off" or duration in seconds (1–10)
- **volume** — local file playback volume (0–1)
- **customPacks** — user-created preset collections (up to 50 packs, each with id, name, presets list, createdAt)
- **activeCustomPackId** — currently active custom pack ID, or null
- **importedPresets** — imported .milk preset metadata (name, fileName, addedAt). Metadata only — raw .milk text stored in client-side IndexedDB, not synced

Settings are keyed to the user's Spotify ID (resolved from their session). Spotify credentials are never included in settings sync.

## Security

- **Spotify client secret** stored in SSM Parameter Store (encrypted at rest), never exposed to the client
- **Session validation** on every request — all endpoints look up the `sessionId` in DynamoDB before proceeding
- **Session TTL** — sessions expire after 90 days via DynamoDB TTL (auto-deleted). TTL is refreshed on each token rotation
- **CORS** restricted to allowed origins at the API Gateway level (not open to `*`)
- **Settings validation** — `settings-save` validates all fields server-side: type checks, `Number.isFinite()` guards, range clamping, enum validation (fftSize, autopilot mode), preset list limits (500 items, 200 chars each), and extra key stripping. 1 MB body size limit (413 response)
- **Error opacity** — generic 500 errors don't expose implementation details; 400/404 errors are specific
