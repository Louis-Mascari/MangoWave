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
Source → GainNode (pre-amp) → 10× BiquadFilter (EQ) → AnalyserNode → butterchurn
```

Three source modes:

- **System audio** ([`getDisplayMedia`](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support)) — captures tab/screen audio. Desktop only (Chrome, Edge, Opera). Firefox and Safari support `getDisplayMedia` for video but not audio capture. On Windows/ChromeOS the entire system audio can be captured; on Linux/macOS only tab audio is available
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
│                  #     PresetBrowser, MediaPlaylist, NowPlaying, PlaybackPanel, StartScreen,
│                  #     OnboardingOverlay (first-time tips), etc.
├── engine/        # AudioEngine (Web Audio pipeline), VisualizerRenderer (butterchurn),
│                  # isWebGL2Supported
├── data/          # quarantined-presets.json, mobile-safe-presets.json
├── constants/     # shortcuts.ts (keyboard/mouse shortcut definitions)
├── hooks/         # useAudioCapture, useLocalPlayback, useAutopilot, useKeyboardShortcuts,
│                  # useIdleTimer, useHideCursor, useFullscreen, useSpotifyAuth, useNowPlaying,
│                  # useUnlockCheck, useSettingsSync, useSpotifyProgress (smooth seek via rAF)
├── lib/           # PostHog & Sentry init (no-op when env vars absent)
├── services/      # Spotify Web API client (owner-mode OAuth + PKCE utilities for self-hosters)
├── store/         # Zustand stores: useSettingsStore, useSpotifyStore, useMediaPlayerStore,
│                  #     usePresetHistoryStore, useToastStore
├── utils/         # Shared utilities (isMobileDevice, settingsPortability)
├── types/         # butterchurn.d.ts, music-metadata.d.ts (type declarations for untyped packages)
└── test/          # Vitest global setup
```

### State Management

Zustand with `localStorage` persistence. Key sections:

| Section               | Fields                                                                         | Defaults                                                                    |
| --------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `performance`         | `fpsCap`, `resolutionScale`, `meshWidth`, `meshHeight`, `textureRatio`, `fxaa` | Desktop: 60, 1.0, 48, 36, 1.0, false / Mobile: 30, 0.75, 32, 24, 0.5, false |
| `audio`               | `smoothingConstant`, `fftSize`                                                 | 0.3, 1024                                                                   |
| `autopilot`           | `enabled`, `interval`, `mode`, `favoriteWeight`                                | true, 15s, `'all'`, 2                                                       |
| `eq`                  | `preAmpGain`, `bandGains[10]`                                                  | 1.5, all 0dB                                                                |
| `blockedPresets`      | string[]                                                                       | []                                                                          |
| `favoritePresets`     | string[]                                                                       | []                                                                          |
| `presetNameDisplay`   | `'off' \| 'always' \| number`                                                  | 5                                                                           |
| `songInfoDisplay`     | `'off' \| number` (on/off toggle, hardcoded 5s when on)                        | 5                                                                           |
| `transitionTime`      | number (seconds)                                                               | 2.0                                                                         |
| `volume`              | number (0.0–1.0)                                                               | 0.5                                                                         |
| `enabledPacks`        | string[]                                                                       | all packs                                                                   |
| `showQuarantined`     | boolean                                                                        | false                                                                       |
| `quarantineOverrides` | string[]                                                                       | []                                                                          |
| `mobileNoticeShown`   | boolean                                                                        | false                                                                       |
| `onboardingShown`     | boolean                                                                        | false                                                                       |

Blocked and favorited presets are mutually exclusive.

On mobile, a notice appears in the StartScreen modals (Local Files, Microphone) offering to reduce rendering settings that can overload mobile GPUs. Users choose Optimize (applies mobile defaults) or Skip (keeps desktop values), with a "Remember my choice" checkbox to persist the decision via `mobileNoticeShown`.

`useMediaPlayerStore` manages local file playback state (queue, current track, shuffle history, repeat mode). Not persisted — `File` objects can't survive page reload.

`usePresetHistoryStore` tracks preset navigation history (max 100 entries, cursor-based) for previous/next preset navigation. Also tracks `playedSet` for shuffle-style autopilot rounds. Not persisted.

`useToastStore` drives single-message action toasts (favorite/block confirmations). Default 3.5s auto-clear, optional `durationMs` param for longer error toasts.

## Environment Variables

Create a `.env` file (gitignored):

```
VITE_SPOTIFY_CLIENT_ID=
VITE_SPOTIFY_REDIRECT_URI=
VITE_API_URL=
VITE_LOCKED_MODE=          # 'true' to restrict Spotify connect button to magic-link visitors
VITE_UNLOCK_HASH=          # SHA-256 hash of the unlock passphrase (visitors use ?unlock=PASSPHRASE)
VITE_SENTRY_DSN=
VITE_PUBLIC_POSTHOG_KEY=
VITE_PUBLIC_POSTHOG_HOST=
```

All are optional — the app runs fully without them. Spotify integration requires the first three; lock gate requires the next two; analytics/error tracking require the last three.

### Spotify Integration

Spotify is optional and only available in **owner mode** (backend-proxied OAuth). The hosted site's UI has no BYOC (bring your own client) option due to Spotify's dev mode limits (1 Client ID, 5 users, Premium to register). The PKCE code is retained in `services/spotifyPkce.ts` for self-hosters.

Key details:

- **PlaybackAdapter** — source-agnostic interface (`local | system | mic | spotify | none`). Spotify adapter only activates for Premium users; non-Premium falls to `'none'` (no PlaybackPanel, but Now Playing metadata still shown)
- **`GET /me/player`** — full playback state (device name, shuffle, repeat) instead of `/me/player/currently-playing`
- **`useSpotifyProgress`** — interpolates progress between 5s polls via `useSyncExternalStore` + `requestAnimationFrame` for smooth seek bar
- **Seek/shuffle/repeat** — `PUT /me/player/seek`, `PUT /me/player/shuffle`, `PUT /me/player/repeat` with 401/403/429 error handling
- **Auth mode** — UI branches on `authMode === 'owner'` (not `isSpotifyUnlocked`)
- **Connect button** — click guard (`isConnecting` state) prevents double-auth

### PlaybackPanel

Floating panel (`components/PlaybackPanel.tsx`) rendered by App.tsx when source is `local` or `spotify`. Contains seek bar, transport controls (prev/play/next), shuffle, repeat, Now Playing toggle, queue toggle (local only), and volume (local only, desktop only).

- **Responsive layout** — flex-wrap groups: `[prev play next]` + `[shuffle repeat nowplaying queue]` wrap as units, volume wraps last
- **Idle auto-hide** — `useIdleTimer` with `pause`/`resume` (hover keeps visible on desktop) and `forceIdle` (instant hide after mobile radial actions). 5s mobile, 3s desktop
- **Mobile** — `bottom-24 left-4 right-4`, hidden when FAB menu is open (`mobileMenuOpen` state in App.tsx)
- **Desktop** — `bottom-16 left-1/2 -translate-x-1/2`, centered above ControlBar

## Key Technical Notes

- **WebGL 2 required.** `isWebGL2Supported()` checks on mount and shows a fallback if unavailable.
- **butterchurn is untyped** — type declarations live in `src/types/butterchurn.d.ts`.
- **`vite.config.ts`** imports `defineConfig` from `vitest/config` (not `vite`) to support the `test` property.
- **400+ presets** loaded from 6 butterchurn packs, organized by source pack with virtualized browsing (`react-virtuoso`).
- **`secure-json-parse`** used for prototype pollution protection on settings import.
- **Settings import sanitization** — all imported values clamped to UI-enforced ranges. Whitelisted data keys only (store functions can't be overwritten).
