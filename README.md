<p align="center">
  <img src="packages/landing/images/logo.png" alt="MangoWave logo" width="200">
</p>

<h1 align="center">MangoWave</h1>

<p align="center">
  Browser-based audio-reactive visualizer inspired by Winamp/MilkDrop.<br>
  Plays local files, captures system audio, or listens via microphone — feeds real-time FFT data into
  <a href="https://github.com/jberg/butterchurn">butterchurn</a> (a WebGL 2 MilkDrop port) with 400+ presets.
</p>

<p align="center">
  <a href="https://play.mangowave.app"><strong>Launch App</strong></a> &middot;
  <a href="https://mangowave.app">Landing Page</a> &middot;
  <a href="https://ko-fi.com/louismascari">Buy Mango a Treat 🐾</a>
</p>

## Features

- **400+ MilkDrop presets** from 6 butterchurn packs, organized by source pack with virtualized browsing
- **Pack filtering** — enable/disable built-in packs to control which presets appear and which autopilot draws from
- **Quarantine system** — suspected broken or vibe-killing presets hidden by default, with per-preset unquarantine
- **Multiple audio sources** — system/tab audio, local files, or microphone input
- **Local file playback** with queue, shuffle, repeat, seek, volume controls, and ID3 metadata display (title, artist, album, album art)
- **10-band EQ** that shapes which frequencies drive the visuals
- **Pre-amp gain** to boost quiet audio sources
- **Autopilot** with shuffle-style rounds (no repeats), all or favorites-only mode, proportional favorite weighting (1–10x)
- **Preset history** with previous/next navigation and browseable history tab
- **Shortcuts** — keyboard and mouse shortcuts for preset navigation, fullscreen, favorites, and more
- **Mobile-optimized UI** with radial FAB menu, full-screen modal panels, and optional rendering optimizations for mobile GPUs
- **Optional Spotify integration** — Now Playing metadata for all authorized users; seek, shuffle, and repeat controls for Premium users. Cloud-synced settings. Owner-mode only due to Spotify's dev mode policy (1 Client ID per developer, max 5 authorized users, Premium required to register the app). Self-hosters can set up their own Spotify developer app via the included PKCE code
- **Visual quality controls** — mesh resolution, texture quality, FXAA anti-aliasing, plus FPS cap, resolution scaling, FFT size, smoothing
- **Settings export/import** — transfer settings between browsers or devices via JSON file
- **First-time onboarding** — guided tips overlay for new visitors (separate desktop and mobile variants)
- **Zero setup** — no signup, no install, no ads — everything runs in the browser

## Architecture

The core visualizer is **100% client-side**. Audio sources (system capture, local files, microphone), rendering, EQ, presets, and all settings run in the browser with zero backend calls.

The backend only serves **optional Spotify integration** — 4 Lambda endpoints behind API Gateway handle OAuth token exchange, token refresh, and settings sync to DynamoDB.

### Audio Pipeline

```
Source → GainNode (pre-amp) → 10× BiquadFilter (EQ) → AnalyserNode → butterchurn
```

Three audio sources feed the pipeline:

- **System audio** ([`getDisplayMedia`](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support)) — captures audio from a screen, window, or tab share. Desktop only (Chrome, Edge, Opera). Not available on mobile browsers, Safari, or Firefox (both support `getDisplayMedia` for video but not audio capture). On Windows and ChromeOS all sharing modes support audio; on macOS (Sonoma+) screen and window sharing also support audio via ScreenCaptureKit; on older macOS or Linux, tab sharing is the most reliable option
- **Local files** (`HTMLAudioElement`) — plays audio files directly in the browser. Works on all browsers and devices. EQ feeds the visualizer while audio plays directly to speakers
- **Microphone** (`getUserMedia`) — captures live audio input. Works on all browsers and devices

### Spotify Integration

Spotify's dev mode policy (as of March 2026) restricts each developer app to 1 Client ID, the app owner plus up to 5 authorized users, and requires a Premium account to register the app. Because of these limits, MangoWave's hosted site exposes Spotify only in **owner mode** — the app owner connects via backend-proxied OAuth, and authorized users must be added to the developer app's User Management tab. Authorized users don't need Premium themselves, but playback controls (seek, shuffle, repeat) require Premium; non-Premium users still see Now Playing metadata.

The BYOC (bring your own client) PKCE flow is retained in the codebase (`spotifyPkce.ts`) but the UI for it has been removed from the hosted site. Self-hosters who fork the repo can re-enable it and connect their own Spotify developer app.

## Project Structure

NPM workspaces monorepo. Node >= 20 required.

```
MangoWave/
├── packages/frontend/     # React 19 + Vite 7 + TypeScript — the visualizer app
├── packages/backend/      # Lambda handlers for Spotify OAuth & settings sync
├── packages/landing/      # Static landing page (HTML + CSS, no JS)
├── infrastructure/        # AWS CDK v2 — DynamoDB, Lambda, API Gateway, S3, CloudFront, CloudWatch
└── .github/workflows/     # CI (PR checks) + Deploy (OIDC -> CDK -> S3 -> CloudFront)
```

See each package's README for details.

## Quick Start

```bash
# Install dependencies
npm install

# Start the frontend dev server
npm run dev -w packages/frontend
# Open http://localhost:5173
```

## Commands

```bash
# Development
npm run dev -w packages/frontend     # Vite dev server (localhost:5173)

# Testing
npm run test -w packages/frontend    # Vitest (jsdom)
npm run test -w packages/backend     # Vitest
npm run test -w infrastructure       # Jest (CDK assertions)
npm test                             # All workspaces

# Linting & formatting
npm run lint -w packages/frontend    # ESLint
npm run format:check                 # Prettier check
npm run format                       # Prettier fix

# Build
npm run build -w packages/frontend   # tsc + vite build
```

## Shortcuts

| Input            | Action                     |
| ---------------- | -------------------------- |
| Space / N        | Next preset                |
| P                | Previous preset            |
| F / Double-click | Toggle fullscreen          |
| A                | Toggle autopilot           |
| S                | Toggle favorite            |
| B                | Toggle block               |
| Q                | Toggle queue (local files) |
| J                | Previous track             |
| K                | Play/pause                 |
| L                | Next track                 |
| Escape           | Close panel/overlay        |
| ? / H            | Shortcut help              |

## Tech Stack

- **Frontend:** React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Zustand
- **Visual engine:** butterchurn (WebGL 2 MilkDrop port)
- **Audio:** Web Audio API (`getDisplayMedia`, `HTMLAudioElement`, `getUserMedia`), music-metadata (ID3 parsing)
- **Backend:** AWS Lambda (Node.js/TypeScript), API Gateway, DynamoDB
- **Infrastructure:** AWS CDK v2
- **CI/CD:** GitHub Actions (OIDC deploy to AWS)
- **Analytics:** PostHog (user analytics), Sentry (error tracking)

## Deployment

All infrastructure is managed via AWS CDK. Pushes to `main` auto-deploy via GitHub Actions:

1. CDK deploys all infrastructure (DynamoDB, Lambda, API Gateway, S3, CloudFront, CloudWatch)
2. Vite builds the frontend
3. Frontend synced to S3 (bucket name from CDK outputs) + CloudFront cache invalidated
4. Landing page synced separately to S3

Both the app (`play.mangowave.app`) and landing page (`mangowave.app`) are served from the same CloudFront distribution. A CloudFront Function routes requests by `Host` header to the appropriate S3 prefix.

## Requirements

- **[WebGL 2](https://caniuse.com/webgl2)** — required for butterchurn rendering. A fallback message is shown if unsupported
- **Audio source availability varies by browser and device:**
  - **System audio** — desktop Chrome, Edge, or Opera (requires [`getDisplayMedia`](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support) audio capture, not supported by Firefox, Safari, or mobile browsers)
  - **Local files** — all modern browsers, desktop and mobile
  - **Microphone** — all modern browsers, desktop and mobile
- **Node >= 20** for local development

## Acknowledgments

- [butterchurn](https://github.com/jberg/butterchurn) — WebGL 2 implementation of the MilkDrop visualizer
- [MilkDrop](https://en.wikipedia.org/wiki/MilkDrop) — original visualizer by Ryan Geiss
- [Winamp](https://en.wikipedia.org/wiki/Winamp) — created by Nullsoft

## License

[AGPL-3.0](LICENSE)
