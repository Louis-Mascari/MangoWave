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

<p align="center">
  <video src="https://github.com/user-attachments/assets/72154209-0dc2-49a0-8ad4-4f47c4e95f57" autoplay loop muted playsinline width="100%"></video>
</p>

## Features

- **400+ MilkDrop presets** from 5 butterchurn packs, organized by source pack with virtualized browsing
- **Import .milk/.milk2 presets** — add community MilkDrop presets from the thousands available online. Raw files stored in IndexedDB, converted lazily on-demand via `milkdrop-preset-converter`
- **Custom packs** — create, edit, import/export preset collections; start a pack to lock autopilot and navigation to its presets only
- **Pack filtering** — enable/disable built-in packs to control which presets appear and which autopilot draws from
- **Excluded presets** — quarantined presets (broken or inappropriate content) and mobile-blocked presets (27 GPU-heavy presets identified via device testing) collected in a unified Excluded tab with reason badges and per-preset overrides
- **Multiple audio sources** — system/tab audio, local files, or microphone input
- **Local file playback** with queue, shuffle, repeat, seek, volume controls, and ID3 metadata display (title, artist, album, album art)
- **10-band EQ** that shapes which frequencies drive the visuals
- **Pre-amp gain** to boost quiet audio sources
- **Autopilot** with shuffle-style rounds (no repeats), all or favorites-only mode, proportional favorite weighting (1–10x)
- **Preset history** with previous/next navigation and browseable history tab
- **Shortcuts** — keyboard and mouse shortcuts for preset navigation, fullscreen, favorites, and more
- **Mobile-optimized UI** with tap-to-reveal circular controls, full-screen modal panels, and automatic filtering of 27 GPU-heavy presets on mobile devices
- **Optional Spotify integration** — Now Playing metadata for all authorized users; seek, shuffle, and repeat controls for Premium users. Cloud-synced settings. Owner-mode only due to Spotify's dev mode policy (1 Client ID per developer, max 5 authorized users, Premium required to register the app). Self-hosters can set up their own Spotify developer app via the included PKCE code
- **Visual quality controls** — mesh resolution, texture quality, FXAA anti-aliasing, plus FPS cap, resolution scaling, FFT size, smoothing
- **Multi-window sync** — sync presets and settings across browser windows on the same device via BroadcastChannel. Any window can make changes; automatic leader election drives autopilot from one window
- **Settings export/import** — transfer settings between browsers or devices via JSON file
- **First-time onboarding** — guided tips overlay for new visitors (separate desktop and mobile variants)
- **9-language i18n** — English, Spanish, Chinese, Hindi, Japanese, Korean, Russian, Indonesian, Brazilian Portuguese. Browser language auto-detected with manual override on the start screen. Non-English translations are AI-generated — if you spot an error, please [open an issue](https://github.com/Louis-Mascari/MangoWave/issues/new/choose)
- **Zero setup** — no signup, no install, no ads — everything runs in the browser

## Architecture

The core visualizer is **100% client-side**. Audio sources (system capture, local files, microphone), rendering, EQ, presets, and all settings run in the browser with zero backend calls.

The backend only serves **optional Spotify integration** — 4 Lambda endpoints behind API Gateway handle OAuth token exchange, token refresh, and settings sync to DynamoDB.

### Audio Pipeline

```
Source → GainNode (pre-amp) → 10× BiquadFilter (EQ) → AnalyserNode → butterchurn
```

Three audio sources feed the pipeline:

- **System audio** ([`getDisplayMedia`](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support)) — captures audio from a screen, window, or tab share
- **Local files** (`HTMLAudioElement`) — plays audio files directly in the browser. EQ feeds the visualizer while audio plays directly to speakers
- **Microphone** (`getUserMedia`) — captures live audio input (silent mode, no speaker output)

### Browser & Device Compatibility

[WebGL 2](https://caniuse.com/webgl2) is required for rendering (fallback shown if unsupported). The visualizer, presets, EQ, and settings work on all modern browsers and devices. Audio source availability varies:

| Audio Source     | Chrome / Edge / Opera | Firefox | Safari | Mobile (any browser) |
| ---------------- | --------------------- | ------- | ------ | -------------------- |
| **Local files**  | Yes                   | Yes     | Yes    | Yes                  |
| **Microphone**   | Yes                   | Yes     | Yes    | Yes                  |
| **System audio** | Yes (computer only)   | No      | No     | No                   |

System audio capture uses `getDisplayMedia` with audio. Firefox and Safari support `getDisplayMedia` for video but have not implemented audio capture. No mobile browser supports `getDisplayMedia` at all. On the start screen, the Share Audio card is disabled on mobile and shows a compatibility hint on non-Chromium desktop browsers.

**System audio by OS (Chromium only, computer):**

| OS                     | Screen | Window | Tab   |
| ---------------------- | ------ | ------ | ----- |
| **Windows / ChromeOS** | Audio  | Audio  | Audio |
| **macOS 14.2+**        | Audio  | Audio  | Audio |
| **macOS < 14.2**       | No     | No     | Audio |
| **Linux**              | No     | No     | Audio |

### Spotify Integration

Spotify's dev mode policy (as of March 2026) restricts each developer app to 1 Client ID, the app owner plus up to 5 authorized users, and requires a Premium account to register the app. Because of these limits, MangoWave's hosted site exposes Spotify only in **owner mode** — the app owner connects via backend-proxied OAuth, and authorized users must be added to the developer app's User Management tab. Authorized users don't need Premium themselves, but playback controls (seek, shuffle, repeat) require Premium; non-Premium users still see Now Playing metadata.

The BYOC (bring your own client) PKCE flow is retained in the codebase (`spotifyPkce.ts`) but the UI for it has been removed from the hosted site. Self-hosters who fork the repo can re-enable it and connect their own Spotify developer app.

## Project Structure

NPM workspaces monorepo. Node >= 20 required.

```
MangoWave/
├── packages/frontend/          # React 19 + Vite 8 + TypeScript — the visualizer app
├── packages/butterchurn/       # Vendored butterchurn with ESM wrapper + types
├── packages/butterchurn-presets/ # Vendored preset packs with ESM wrapper + types
├── packages/backend/           # Lambda handlers for Spotify OAuth & settings sync
├── packages/landing/           # Static landing page (HTML + CSS, no JS)
├── infrastructure/             # AWS CDK v2 — DynamoDB, Lambda, API Gateway, S3, CloudFront, CloudWatch
├── .github/                # CI, deploy, dependabot, issue templates, PR template, CODEOWNERS, SECURITY
├── SELF-HOSTING.md        # Guide for deploying your own instance
├── knip.json              # Knip config (unused code detection)
└── LICENSE                # AGPL-3.0
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
npm run e2e -w packages/frontend     # Playwright (requires browser binaries)
npm run test -w packages/backend     # Vitest
npm run test -w infrastructure       # Jest (CDK assertions)
npm test                             # All workspaces (unit only)

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

- **Frontend:** React 19, Vite 8, TypeScript 6, Tailwind CSS 4, Zustand, react-i18next
- **Visual engine:** butterchurn (WebGL 2 MilkDrop port)
- **Audio:** Web Audio API (`getDisplayMedia`, `HTMLAudioElement`, `getUserMedia`), music-metadata (ID3 parsing)
- **Backend:** AWS Lambda (Node.js/TypeScript), API Gateway, DynamoDB
- **Infrastructure:** AWS CDK v2
- **Testing:** Vitest (unit/integration, jsdom), Playwright E2E (5 browser configs: Chromium + mobile Chrome full suite, Firefox + WebKit start-screen only, mobile Safari local-only; all 5 run full suite locally)
- **Code quality:** ESLint (with jsx-a11y), Prettier, Knip (unused code detection), Husky pre-commit hooks (lint-staged + typecheck + Knip)
- **CI/CD:** GitHub Actions — CI runs on push to `main` and PRs (lint → unit tests → E2E). Deploy triggers automatically after CI succeeds on `main` via `workflow_run` (CDK → S3/CloudFront)
- **Analytics:** PostHog (user analytics), Sentry (error tracking)

## Deployment

All infrastructure is managed via AWS CDK. Pushes to `main` trigger CI (lint, typecheck, unit tests, E2E). When CI succeeds, the Deploy workflow runs automatically via `workflow_run`:

1. CDK deploys all infrastructure (DynamoDB, Lambda, API Gateway, S3, CloudFront, CloudWatch)
2. Vite builds the frontend (source maps uploaded to Sentry during build, then deleted before deploy)
3. Frontend synced to S3 (bucket name from CDK outputs) + CloudFront cache invalidated
4. Landing page synced separately to S3

Both the app (`play.mangowave.app`) and landing page (`mangowave.app`) are served from the same CloudFront distribution. A CloudFront Function routes requests by `Host` header to the appropriate S3 prefix.

## Self-Hosting

The core visualizer is 100% client-side — you can deploy just the frontend to any static host with no backend or environment variables required. For Spotify integration and cloud settings sync, you'll need to set up the AWS infrastructure and a Spotify developer app.

See **[SELF-HOSTING.md](SELF-HOSTING.md)** for full instructions.

## Requirements

- **Node >= 20** for local development
- **WebGL 2** and browser compatibility — see [Browser & Device Compatibility](#browser--device-compatibility) above

## Acknowledgments

- [butterchurn](https://github.com/jberg/butterchurn) — WebGL 2 implementation of the MilkDrop visualizer
- [MilkDrop](https://en.wikipedia.org/wiki/MilkDrop) — original visualizer by Ryan Geiss
- [Winamp](https://en.wikipedia.org/wiki/Winamp) — created by Nullsoft

## License

[AGPL-3.0](LICENSE)
