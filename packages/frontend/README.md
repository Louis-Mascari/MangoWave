# @mangowave/frontend

The MangoWave visualizer app — a React 19 + Vite 7 + TypeScript SPA that captures audio and renders real-time MilkDrop-style visuals via butterchurn.

## Development

```bash
npm run dev        # Vite dev server at localhost:5173
npm run build      # tsc -b && vite build
npm run test       # Vitest (119 tests, jsdom)
npm run test:watch # Vitest in watch mode
npm run lint       # ESLint
```

## Architecture

### Audio Pipeline

```
getDisplayMedia -> MediaStreamSource -> GainNode (pre-amp) -> 10x BiquadFilter (EQ) -> AnalyserNode -> butterchurn
```

- **EQ is purely visual** — shapes FFT data for butterchurn, does not change audio output
- **Pre-amp** scales overall visual reactivity (0-3x linear gain)
- butterchurn calls `connectAudio(analyserNode)` and reads FFT data directly

### Source Layout

```
src/
├── components/    # UI: ControlBar, EQPanel, PerformancePanel, PresetBrowser,
│                  #     StartScreen, ShortcutOverlay, Tooltip, ErrorBoundary, etc.
├── engine/        # AudioEngine (Web Audio pipeline), VisualizerRenderer (butterchurn),
│                  # isWebGL2Supported
├── hooks/         # useAudioCapture, useAutopilot, useKeyboardShortcuts,
│                  # useIdleTimer, useHideCursor, useSpotifyAuth, useNowPlaying
├── lib/           # PostHog & Sentry init (no-op when env vars absent)
├── services/      # Spotify Web API client
├── store/         # Zustand stores: useSettingsStore, useSpotifyStore
├── types/         # butterchurn.d.ts (type declarations for untyped packages)
└── test/          # Vitest global setup
```

### State Management

Zustand with `localStorage` persistence. Key sections:

| Section             | Fields                                 | Defaults          |
| ------------------- | -------------------------------------- | ----------------- |
| `performance`       | `fpsCap`, `resolutionScale`            | 0 (uncapped), 1.0 |
| `audio`             | `smoothingConstant`, `fftSize`         | 0.3, 1024         |
| `autopilot`         | `enabled`, `interval`, `favoritesOnly` | true, 15s, false  |
| `eq`                | `preAmpGain`, `bandGains[10]`          | 1.0, all 0dB      |
| `blockedPresets`    | string[]                               | []                |
| `favoritePresets`   | string[]                               | []                |
| `presetNameDisplay` | `'off' \| 'always' \| number`          | 5                 |
| `transitionTime`    | number (seconds)                       | 2.0               |

Blocked and favorited presets are mutually exclusive.

## Environment Variables

Create a `.env` file (gitignored):

```
VITE_SPOTIFY_CLIENT_ID=
VITE_SPOTIFY_REDIRECT_URI=
VITE_API_URL=
VITE_SENTRY_DSN=
VITE_PUBLIC_POSTHOG_KEY=
VITE_PUBLIC_POSTHOG_HOST=
```

All are optional — the app runs fully without them. Spotify integration requires the first three; analytics/error tracking require the last three.

## Key Technical Notes

- **WebGL 2 required.** `isWebGL2Supported()` checks on mount and shows a fallback if unavailable.
- **butterchurn is untyped** — type declarations live in `src/types/butterchurn.d.ts`.
- **`vite.config.ts`** imports `defineConfig` from `vitest/config` (not `vite`) to support the `test` property.
- **555 presets** loaded from all butterchurn preset packs (base, Extra, Extra2, MD1, NonMinimal, Minimal).
- **Cursor auto-hides** after 3s idle in fullscreen via `useHideCursor`.
- **ControlBar panel state** is lifted to `App.tsx` so keyboard shortcuts can close panels.
