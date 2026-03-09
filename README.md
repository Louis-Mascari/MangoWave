# MangoWave

Browser-based audio-reactive visualizer inspired by Winamp/MilkDrop. Captures system or tab audio via `getDisplayMedia`, feeds real-time FFT data into [butterchurn](https://github.com/jberg/butterchurn) (a WebGL 2 MilkDrop port) with 555 presets.

**Live app:** [play.mangowave.app](https://play.mangowave.app) | **Landing page:** [mangowave.app](https://mangowave.app)

## Features

- **555 MilkDrop presets** from all butterchurn preset packs
- **10-band EQ** that shapes which frequencies drive the visuals
- **Pre-amp gain** to boost quiet audio sources
- **Preset browser** with search, favorites, and blocking
- **Autopilot** auto-cycles presets on a configurable interval (5-120s)
- **Keyboard shortcuts** for preset navigation, fullscreen, favorites, and more
- **Optional Spotify integration** for Now Playing metadata and playback controls
- **Configurable performance** — FPS cap, resolution scaling, FFT size, smoothing
- **Zero install** — runs entirely in the browser, no extensions needed

## Architecture

The core visualizer is **100% client-side**. Audio capture, rendering, EQ, presets, and all settings run in the browser with zero backend calls.

The backend only serves **optional Spotify integration** — 4 Lambda endpoints behind API Gateway handle OAuth token exchange, token refresh, and settings sync to DynamoDB.

```
getDisplayMedia -> MediaStreamSource -> GainNode (pre-amp) -> 10x BiquadFilter (EQ) -> AnalyserNode -> butterchurn
```

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

# Testing (151 tests)
npm run test -w packages/frontend    # 119 Vitest tests (jsdom)
npm run test -w packages/backend     # 17 Vitest tests
npm run test -w infrastructure       # 15 Jest tests (CDK assertions)
npm test                             # All workspaces

# Linting & formatting
npm run lint -w packages/frontend    # ESLint
npm run format:check                 # Prettier check
npm run format                       # Prettier fix

# Build
npm run build -w packages/frontend   # tsc + vite build
```

## Keyboard Shortcuts

| Key       | Action              |
| --------- | ------------------- |
| Space / N | Next preset         |
| F         | Toggle fullscreen   |
| A         | Toggle autopilot    |
| S         | Toggle favorite     |
| B         | Toggle block        |
| Escape    | Close panel/overlay |
| ? / H     | Shortcut help       |

## Tech Stack

- **Frontend:** React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Zustand
- **Visual engine:** butterchurn (WebGL 2 MilkDrop port)
- **Audio:** Web Audio API (`getDisplayMedia` + `AnalyserNode`)
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

- **WebGL 2** — required for butterchurn rendering
- **Browser with `getDisplayMedia` support** — Chrome, Edge, Firefox (not Safari)
- **Node >= 20** for local development

## License

This project is open source.
