# Self-Hosting MangoWave

## Overview

MangoWave's core visualizer is **100% client-side** — audio sources, rendering, EQ, presets, and all settings run entirely in the browser with zero backend calls. You can deploy just the frontend to any static host and it works out of the box.

The backend is optional and provides:

- **Spotify integration** — OAuth token exchange and refresh via server-side client credentials
- **Cloud settings sync** — saves all visualizer settings (EQ, performance, presets, autopilot, etc.) to DynamoDB, keyed to the user's Spotify ID

Settings sync is gated behind Spotify auth as a security measure (prevents anonymous writes), but the synced data covers all visualizer settings — not just Spotify-related ones. Spotify credentials are never included in synced settings.

## Option 1: Frontend Only (No Backend)

The simplest path — no AWS account, no Spotify app, no environment variables needed.

```bash
pnpm install
pnpm --filter @mangowave/frontend build
```

Deploy the `packages/frontend/dist/` directory to any static host (Netlify, Vercel, S3 + CloudFront, GitHub Pages, etc.).

**Optional environment variables** (set before building):

| Variable                   | Purpose                    |
| -------------------------- | -------------------------- |
| `VITE_SENTRY_DSN`          | Your Sentry DSN for errors |
| `VITE_PUBLIC_POSTHOG_KEY`  | Your PostHog project key   |
| `VITE_PUBLIC_POSTHOG_HOST` | Your PostHog ingest host   |

**Landing page:** Optionally deploy `packages/landing/` as a separate static site — it's plain HTML + CSS with no build step.

## Option 2: Full Stack (Spotify + Settings Sync)

### Step 1: Create a Spotify Developer App

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app (requires a Spotify Premium account to register)
3. Set the redirect URI to your domain (e.g. `https://play.yourdomain.com/callback`)
4. Copy the **Client ID** and **Client Secret**
5. Add authorized users in the **User Management** tab

> **Spotify dev mode limits (as of March 2026):** 1 Client ID per developer, app owner + 5 authorized users, Premium required to register the app. Authorized users don't need Premium themselves, but playback controls (seek, shuffle, repeat) require Premium.

### Step 2: AWS Prerequisites (before CDK deploy)

These resources must exist before running `cdk deploy`:

- **ACM certificate** (us-east-1) — TLS cert for your CloudFront domain (e.g. `*.yourdomain.com`)
- **Route 53 hosted zone** — DNS for your domain (or configure DNS manually)
- **WAF WebACL** (us-east-1) — CloudFront security protection (optional but recommended)
- **SSM Parameter Store entries** — 3 SecureString parameters:
  ```
  /mangowave/spotify/client-id       → your Spotify Client ID
  /mangowave/spotify/client-secret   → your Spotify Client Secret
  /mangowave/spotify/redirect-uri    → your redirect URI
  ```
  Lambda env vars contain the parameter _names_, not the actual secrets — values are fetched at runtime via `GetParameter` with decryption.
- **GitHub OIDC provider + IAM role** — only if using CI/CD (see `infrastructure/README.md`)

### Step 3: Deploy Infrastructure

```bash
cd infrastructure
pnpm exec cdk deploy \
  -c alertEmail=you@example.com \
  -c acmCertArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID \
  -c webAclArn=arn:aws:wafv2:us-east-1:ACCOUNT:global/webacl/NAME/ID
```

This creates: DynamoDB table, 4 Lambda functions, API Gateway, S3 bucket, CloudFront distribution, CloudWatch alarms, and budget alerts.

Note the **API Gateway URL** from CDK outputs — you'll need it for the frontend build.

### Step 4: Build & Deploy Frontend

Set environment variables, then build:

```bash
export VITE_API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com
export VITE_SPOTIFY_CLIENT_ID=your-spotify-client-id
export VITE_SPOTIFY_REDIRECT_URI=https://play.yourdomain.com/callback

pnpm --filter @mangowave/frontend build
```

Deploy `packages/frontend/dist/` to your S3 bucket and invalidate the CloudFront cache. See `infrastructure/README.md` for the full list of GitHub secrets if using CI/CD.

### Step 5: Deploy Landing Page (optional)

The landing page is static HTML + CSS in `packages/landing/`. Deploy it to the S3 bucket's `/landing/` prefix (same bucket as the frontend) or to any separate static host. Update the URLs in `index.html` if using a custom domain.

## Optional: Locked Mode

Restrict Spotify connect to visitors who arrive via a magic link:

```bash
export VITE_LOCKED_MODE=true
export VITE_UNLOCK_HASH=<sha256-of-your-passphrase>
```

Only visitors who open `https://play.yourdomain.com/?unlock=YOUR_PASSPHRASE` can access Spotify features. The hash is compared client-side.

## Optional: BYOC PKCE (No Backend Needed for Spotify)

A PKCE-based auth flow exists in the frontend code (`services/spotifyPkce.ts`) that handles Spotify OAuth entirely client-side — no Lambda, API Gateway, or DynamoDB needed. The UI for it has been removed from the hosted site but the code is intact.

To re-enable:

1. Create your own Spotify developer app (same 5-user dev mode limit applies)
2. Modify `useSpotifyAuth` to use the PKCE functions from `spotifyPkce.ts`
3. Set `VITE_SPOTIFY_CLIENT_ID` and `VITE_SPOTIFY_REDIRECT_URI`
4. No backend deployment needed — but you also won't have cloud settings sync

## Secret Architecture

| Secret                     | Where stored                        | When accessed                                      |
| -------------------------- | ----------------------------------- | -------------------------------------------------- |
| Spotify Client ID / Secret | AWS SSM Parameter Store (encrypted) | Lambda runtime (fetched per invocation)            |
| Lambda env vars            | CloudFormation / CDK                | Contain parameter _names_, not values              |
| `VITE_*` env vars          | Embedded in JS bundle at build time | Client-side (public)                               |
| `SENTRY_AUTH_TOKEN`        | GitHub secret / CI env              | Build-time only (source map upload), not in bundle |
| Synced settings            | DynamoDB                            | Never include Spotify credentials                  |

## Environment Variables Reference

### Frontend (VITE\_\* — embedded in bundle at build time)

| Variable                    | Required | Purpose                                       |
| --------------------------- | -------- | --------------------------------------------- |
| `VITE_API_URL`              | Backend  | API Gateway endpoint URL                      |
| `VITE_SPOTIFY_CLIENT_ID`    | Backend  | Spotify app Client ID                         |
| `VITE_SPOTIFY_REDIRECT_URI` | Backend  | Spotify OAuth redirect URI                    |
| `VITE_LOCKED_MODE`          | No       | Set `true` to restrict Spotify to magic links |
| `VITE_UNLOCK_HASH`          | No       | SHA-256 hash of the magic-link passphrase     |
| `VITE_SENTRY_DSN`           | No       | Sentry DSN for error tracking                 |
| `VITE_PUBLIC_POSTHOG_KEY`   | No       | PostHog project API key                       |
| `VITE_PUBLIC_POSTHOG_HOST`  | No       | PostHog ingest host                           |

### Build-time (CI only — not embedded in bundle)

| Variable            | Required | Purpose                  |
| ------------------- | -------- | ------------------------ |
| `SENTRY_AUTH_TOKEN` | No       | Sentry source map upload |
| `SENTRY_ORG`        | No       | Sentry organization slug |
| `SENTRY_PROJECT`    | No       | Sentry project slug      |

### Infrastructure (GitHub secrets for CI/CD)

| Variable              | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN for GitHub OIDC credential assumption |
| `ALERT_EMAIL`         | Email for CloudWatch alarm + budget notifications  |
| `ACM_CERT_ARN`        | ACM certificate ARN for CloudFront                 |
| `WEB_ACL_ARN`         | WAF WebACL ARN for CloudFront                      |

## CI/CD

The repository includes GitHub Actions workflows:

- **`ci.yml`** — runs on push to `main` and PRs: lint, typecheck, unit tests, E2E tests
- **`deploy.yml`** — triggers automatically via `workflow_run` after CI succeeds on `main`: CDK deploy, frontend build (with Sentry source map upload), S3 sync, CloudFront invalidation, landing page sync

See `infrastructure/README.md` for the complete GitHub secrets list.
