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

## OAuth Flow

1. Frontend redirects user to Spotify authorize page with CSRF `state`
2. Spotify redirects back with `?code=...&state=...`
3. Frontend calls `POST /auth/callback` with the code
4. Handler exchanges code for tokens via Spotify API, stores `sessionId -> {userId, refreshToken}` in DynamoDB
5. Frontend uses access token, auto-refreshes via `POST /auth/refresh`

## Error Handling

- `403` from Spotify -> `PremiumRequiredError` (free users can see Now Playing but can't control playback)
- `401` from Spotify -> triggers automatic token refresh on the frontend
