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

- **System audio** ([`getDisplayMedia`](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support)) — captures tab/screen audio. Desktop only (Chrome, Edge, Opera). Firefox and Safari support `getDisplayMedia` for video but not audio capture. On Windows/ChromeOS all sharing modes support audio; on macOS 14.2+ screen and window sharing also support audio via ScreenCaptureKit; on older macOS or Linux, only tab sharing supports audio
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
├── utils/         # Shared utilities (isMobileDevice, settingsPortability, audioFileValidation)
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

`useToastStore` drives single-message action toasts with typed variants (`info`, `error`, `warning`). API: `show(message, { type?, durationMs? })` — info auto-clears at 3.5s, error/warning at 6s. `durationMs` stored in state and drives both the JS cleanup timer and the CSS `toast-fade` animation duration (set dynamically via inline style). `ActionToast` renders styled variants: info (neutral), error (red border/bg), warning (amber border/bg).

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
- **`GET /me/player`** — full playback state (device name, shuffle, repeat, `disallows`) instead of `/me/player/currently-playing`
- **`useSpotifyProgress`** — interpolates progress between 5s polls via `useSyncExternalStore` + `requestAnimationFrame` for smooth seek bar
- **Seek/shuffle/repeat** — `PUT /me/player/seek`, `PUT /me/player/shuffle`, `PUT /me/player/repeat`. `disallows` from player state guards actions client-side (prevents sending commands Spotify would reject)
- **Error handling** — 403 responses parsed via `handleForbidden`: only `PREMIUM_REQUIRED` reason sets `premiumError` flag; other 403s show generic toast. 401 triggers `withTokenRetry` (refresh + single retry). Token refresh centralized in `useSpotifyStore.refreshAccessToken` (owner + BYOC)
- **Polling** — 5s interval via `useNowPlaying`, only active when visualizer is running (`isSpotifyConnected && isActive`). No API calls on the start screen
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
- **Audio capture errors** — `humanizeAudioError` in `useAudioCapture` maps DOMException names to user-friendly messages per source (system vs mic). Missing audio tracks on screen share (user forgot "Share audio") block launch with platform-specific guidance. `startCapture`/`startMicCapture` return `boolean` success so callers gate on result.
- **Silence detection** — App.tsx polls FFT data every 1.5s after system capture starts; warns via toast at ~6s if no signal. Auto-dismisses if audio starts flowing.
- **File validation** — `audioFileValidation.ts` validates files by MIME type (`audio/*`) with extension fallback. StartScreen shows rejection errors in the modal; MediaPlaylist queue shows error toast. Defence-in-depth behind the `accept="audio/*"` attribute.
- **WebGL context loss** — `Visualizer` listens for `webglcontextlost` on the canvas; App.tsx shows a z-200 reload overlay with user-facing explanation.
