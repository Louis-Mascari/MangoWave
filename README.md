<p align="center">
  <img src="packages/landing/images/logo.png" alt="MangoWave logo" width="200">
</p>

<h1 align="center">MangoWave</h1>

<p align="center">
  Browser-based audio-reactive visualizer inspired by Winamp/MilkDrop.<br>
  Captures system or tab audio via <code>getDisplayMedia</code>, feeds real-time FFT data into
  <a href="https://github.com/jberg/butterchurn">butterchurn</a> (a WebGL 2 MilkDrop port) with 555 presets.
</p>

<p align="center">
  <a href="https://play.mangowave.app"><strong>Launch App</strong></a> &middot;
  <a href="https://mangowave.app">Landing Page</a>
</p>

## Features

- **555 MilkDrop presets** from all butterchurn preset packs
- **Multiple audio sources** — system/tab audio, local files, or microphone input
- **Local file playback** with queue, shuffle, repeat, seek, and volume controls
- **10-band EQ** that shapes which frequencies drive the visuals
- **Pre-amp gain** to boost quiet audio sources
- **Preset browser** with search, favorites, and blocking
- **Autopilot** auto-cycles presets on a configurable interval (5-120s)
- **Keyboard shortcuts** for preset navigation, fullscreen, favorites, and more
- **Optional Spotify integration** for Now Playing metadata and playback controls
- **BYOC Spotify** — bring your own Client ID via PKCE auth to bypass app user limits
- **Configurable performance** — FPS cap, resolution scaling, FFT size, smoothing
- **Zero install** — runs entirely in the browser, no extensions needed

## Architecture

The core visualizer is **100% client-side**. Audio capture, rendering, EQ, presets, and all settings run in the browser with zero backend calls.

The backend only serves **optional Spotify integration** — 4 Lambda endpoints behind API Gateway handle OAuth token exchange, token refresh, and settings sync to DynamoDB.

```
Source -> GainNode (pre-amp) -> 10x BiquadFilter (EQ) -> AnalyserNode -> butterchurn
```

Sources: `getDisplayMedia` (system audio), `HTMLAudioElement` (local files), or `getUserMedia` (microphone). Local files fork the pipeline — EQ feeds the visualizer while audio plays directly to speakers.

## Project Structure

NPM workspaces monorepo. Node >= 20 required.

```
MangoWave/
├── packages/frontend/     # React 19 + Vite 7 + TypeScript — the visualizer app
├── packages/backend/      # Lambda handlers for Spotify OAuth & settings sync
├── packages/landing/      # Static landing page (HTML + CSS, no JS)
├── infrastructure/        # AWS CDK v2 — DynamoDB, Lambda, API Gateway, CloudWatch
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

## Keyboard Shortcuts

| Key          | Action                     |
| ------------ | -------------------------- |
| Space / N    | Next preset                |
| F            | Toggle fullscreen          |
| Double-click | Toggle fullscreen          |
| A            | Toggle autopilot           |
| S            | Toggle favorite            |
| B            | Toggle block               |
| Q            | Toggle queue (local files) |
| Escape       | Close panel/overlay        |
| ? / H        | Shortcut help              |

## Tech Stack

- **Frontend:** React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Zustand
- **Visual engine:** butterchurn (WebGL 2 MilkDrop port)
- **Audio:** Web Audio API (`getDisplayMedia`, `HTMLAudioElement`, `getUserMedia`)
- **Backend:** AWS Lambda (Node.js/TypeScript), API Gateway, DynamoDB
- **Infrastructure:** AWS CDK v2
- **CI/CD:** GitHub Actions (OIDC deploy to AWS)
- **Analytics:** PostHog (user analytics), Sentry (error tracking)

## Deployment

Pushes to `main` auto-deploy via GitHub Actions:

1. CDK deploys backend infrastructure
2. Vite builds the frontend
3. Frontend synced to S3 + CloudFront cache invalidated
4. Landing page synced separately to S3

## Requirements

- **[WebGL 2](https://caniuse.com/webgl2)** — required for butterchurn rendering
- **Browser with `getDisplayMedia` support** for system audio — Chrome, Edge, Firefox (not Safari). Local files and microphone work on all browsers including mobile
- **Node >= 20** for local development

## Acknowledgments

- [butterchurn](https://github.com/jberg/butterchurn) — WebGL 2 implementation of the MilkDrop visualizer
- [MilkDrop](https://en.wikipedia.org/wiki/MilkDrop) — original visualizer by Ryan Geiss
- [Winamp](https://en.wikipedia.org/wiki/Winamp) — created by Nullsoft

## License

[AGPL-3.0](LICENSE)
