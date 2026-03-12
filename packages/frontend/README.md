# @mangowave/frontend

The MangoWave visualizer app — a React 19 + Vite 7 + TypeScript SPA that plays local files, captures system audio, or listens via microphone, rendering real-time MilkDrop-style visuals via butterchurn.

## Development

```bash
npm run dev        # Vite dev server at localhost:5173
npm run build      # tsc -b && vite build
npm run test       # Vitest (jsdom)
npm run test:watch # Vitest in watch mode
npm run lint       # ESLint
```

## Architecture

### Audio Pipeline

```
Source -> GainNode (pre-amp) -> 10x BiquadFilter (EQ) -> AnalyserNode -> butterchurn
```

Three source modes:

- **System audio** (`getDisplayMedia`) — captures tab/screen audio
- **Local files** (`HTMLAudioElement` via `createMediaElementSource`) — forked pipeline: EQ → analyser for visuals, direct → speakers for audio output. ID3 metadata (title, artist, album, album art) parsed via `music-metadata`
- **Microphone** (`getUserMedia`) — silent mode, no speaker output to prevent feedback

Key details:

- **EQ is purely visual** — shapes FFT data for butterchurn, does not change audio output
- **Pre-amp** scales overall visual reactivity (0-3x linear gain)
- butterchurn calls `connectAudio(analyserNode)` and reads FFT data directly
- `createMediaElementSource` can only be called once per element — engine is created once, track changes update `audioElement.src`

### Source Layout

```
src/
├── components/    # UI: ControlBar, SettingsPanel (tabbed: EQ/Rendering/Presets/Shortcuts/Data/Spotify),
│                  #     PresetBrowser, MediaPlaylist, NowPlaying, StartScreen, etc.
├── engine/        # AudioEngine (Web Audio pipeline), VisualizerRenderer (butterchurn),
│                  # isWebGL2Supported
├── data/          # quarantined-presets.json
├── hooks/         # useAudioCapture, useLocalPlayback, useAutopilot, useKeyboardShortcuts,
│                  # useIdleTimer, useHideCursor, useSpotifyAuth, useNowPlaying, useUnlockCheck
├── lib/           # PostHog & Sentry init (no-op when env vars absent)
├── services/      # Spotify Web API client, PKCE auth utilities
├── store/         # Zustand stores: useSettingsStore, useSpotifyStore, useMediaPlayerStore,
│                  #     usePresetHistoryStore, useToastStore
├── utils/         # Shared utilities (isMobileDevice, settingsPortability)
├── types/         # butterchurn.d.ts, music-metadata.d.ts (type declarations for untyped packages)
└── test/          # Vitest global setup
```

### State Management

Zustand with `localStorage` persistence. Key sections:

| Section               | Fields                                                                         | Defaults                    |
| --------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| `performance`         | `fpsCap`, `resolutionScale`, `meshWidth`, `meshHeight`, `textureRatio`, `fxaa` | 60, 1.0, 48, 36, 1.0, false |
| `audio`               | `smoothingConstant`, `fftSize`                                                 | 0.3, 1024                   |
| `autopilot`           | `enabled`, `interval`, `mode`, `favoriteWeight`                                | true, 15s, `'all'`, 2       |
| `eq`                  | `preAmpGain`, `bandGains[10]`                                                  | 1.5, all 0dB                |
| `blockedPresets`      | string[]                                                                       | []                          |
| `favoritePresets`     | string[]                                                                       | []                          |
| `presetNameDisplay`   | `'off' \| 'always' \| number`                                                  | 5                           |
| `songInfoDisplay`     | `'off' \| 'always' \| number`                                                  | 5                           |
| `transitionTime`      | number (seconds)                                                               | 2.0                         |
| `volume`              | number (0.0–1.0)                                                               | 0.5                         |
| `enabledPacks`        | string[]                                                                       | all packs                   |
| `showQuarantined`     | boolean                                                                        | false                       |
| `quarantineOverrides` | string[]                                                                       | []                          |

Blocked and favorited presets are mutually exclusive.

`useMediaPlayerStore` manages local file playback state (queue, current track, shuffle history, repeat mode). Not persisted — `File` objects can't survive page reload.

`usePresetHistoryStore` tracks preset navigation history (max 100 entries, cursor-based) for previous/next preset navigation. Also tracks `playedSet` for shuffle-style autopilot rounds. Not persisted.

`useToastStore` drives single-message action toasts (favorite/block confirmations). Default 3.5s auto-clear, optional `durationMs` param for longer error toasts.

## Environment Variables

Create a `.env` file (gitignored):

```
VITE_SPOTIFY_CLIENT_ID=
VITE_SPOTIFY_REDIRECT_URI=
VITE_API_URL=
VITE_LOCKED_MODE=          # 'true' to restrict Spotify UI to authorized visitors
VITE_UNLOCK_HASH=          # Hash used to verify visitor authorization
VITE_SENTRY_DSN=
VITE_PUBLIC_POSTHOG_KEY=
VITE_PUBLIC_POSTHOG_HOST=
```

All are optional — the app runs fully without them. Spotify integration requires the first three; lock gate requires the next two; analytics/error tracking require the last three.

## Key Technical Notes

- **WebGL 2 required.** `isWebGL2Supported()` checks on mount and shows a fallback if unavailable.
- **butterchurn is untyped** — type declarations live in `src/types/butterchurn.d.ts`.
- **`vite.config.ts`** imports `defineConfig` from `vitest/config` (not `vite`) to support the `test` property.
- **555+ presets** loaded from 6 butterchurn packs, organized by source pack with virtualized browsing (`react-virtuoso`).
- **`secure-json-parse`** used for prototype pollution protection on settings import.
- **Settings import sanitization** — all imported values clamped to UI-enforced ranges. Whitelisted data keys only (store functions can't be overwritten).
