# @mangowave/frontend

The MangoWave visualizer app — a React 19 + Vite 8 + TypeScript SPA that plays local files, captures system audio, or listens via microphone, rendering real-time MilkDrop-style visuals via butterchurn.

## Development

```bash
npm run dev        # Vite dev server at localhost:5173
npm run build      # tsc -b && vite build
npm run test       # Vitest (jsdom)
npm run test:watch # Vitest in watch mode
npm run e2e        # Playwright E2E tests
npm run e2e:ui     # Playwright with interactive UI
npm run e2e:headed # Playwright in headed mode
npm run lint       # ESLint (includes jsx-a11y)
```

## Architecture

### Audio Pipeline

```
Source → GainNode (pre-amp) → 10× BiquadFilter (EQ) → AnalyserNode → butterchurn
```

Three source modes:

- **System audio** ([`getDisplayMedia`](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia_audio_capture_support)) — captures tab/screen audio. Computer only (Chrome, Edge, Opera). Firefox and Safari support `getDisplayMedia` for video but not audio capture. On Windows/ChromeOS all sharing modes support audio; on macOS 14.2+ screen and window sharing also support audio via ScreenCaptureKit; on older macOS or Linux, only tab sharing supports audio
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
├── data/          # quarantined-presets.json, mobile-blocked-presets.json, excludedPresets.ts (shared Sets)
├── constants/     # shortcuts.ts (keyboard/mouse shortcut definitions)
├── i18n/          # i18next config + 9 locale dirs (en, es, zh, hi, ja, ko, ru, id, pt-BR)
│                  # 4 namespaces per locale: common, start, settings, messages
├── hooks/         # useAudioCapture, useLocalPlayback, useAutopilot, useKeyboardShortcuts,
│                  # useIdleTimer, useHideCursor, useFullscreen, useFocusTrap, useSpotifyAuth,
│                  # useNowPlaying, useSpotifyPlayback, useSpotifyProgress (smooth seek via rAF),
│                  # usePlaybackAdapter, usePresetNavigation, useUnlockCheck, useSettingsSync
├── lib/           # PostHog & Sentry init (no-op when env vars absent)
├── services/      # Spotify Web API client (owner-mode OAuth + PKCE utilities for self-hosters)
├── store/         # Zustand stores: useSettingsStore, useSpotifyStore, useMediaPlayerStore,
│                  #     usePresetHistoryStore, usePresetBrowserStore, useToastStore
├── utils/         # Shared utilities (isMobileDevice, browserInfo, settingsPortability, audioFileValidation)
├── types/         # butterchurn.d.ts, music-metadata.d.ts (type declarations for untyped packages)
└── test/          # Vitest global setup

e2e/                 # Playwright E2E tests (separate from Vitest, own tsconfig)
├── fixtures/        # Custom test fixture (state isolation), audio API mocks, test assets
└── *.spec.ts        # Test files: start-screen, visualizer, preset-browser, settings, keyboard, mobile
```

### State Management

Zustand with `localStorage` persistence. Key sections:

| Section             | Fields                                                                         | Defaults                    |
| ------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| `performance`       | `fpsCap`, `resolutionScale`, `meshWidth`, `meshHeight`, `textureRatio`, `fxaa` | 60, 1.0, 48, 36, 1.0, false |
| `audio`             | `smoothingConstant`, `fftSize`                                                 | 0.3, 1024                   |
| `autopilot`         | `enabled`, `interval`, `mode`, `favoriteWeight`                                | true, 15s, `'all'`, 2       |
| `eq`                | `preAmpGain`, `bandGains[10]`                                                  | 1.5, all 0dB                |
| `blockedPresets`    | string[]                                                                       | []                          |
| `favoritePresets`   | string[]                                                                       | []                          |
| `presetNameDisplay` | `'off' \| 'always' \| number`                                                  | 5                           |
| `songInfoDisplay`   | `'off' \| number` (on/off toggle, hardcoded 5s when on)                        | 5                           |
| `transitionTime`    | number (seconds)                                                               | 2.0                         |
| `volume`            | number (0.0–1.0)                                                               | 0.5                         |
| `enabledPacks`      | string[]                                                                       | all packs                   |
| `excludedOverrides` | string[]                                                                       | []                          |
| `onboardingShown`   | boolean                                                                        | false                       |

Blocked and favorited presets are mutually exclusive.

On mobile, 27 GPU-heavy presets (identified via Pixel 10 Pro testing) are filtered from the pool and shown in the Excluded tab alongside quarantined presets. Users can permanently restore any excluded preset via the Excluded tab — overrides persist in `excludedOverrides`.

`useMediaPlayerStore` manages local file playback state (queue, current track, shuffle history, repeat mode). Not persisted — `File` objects can't survive page reload.

`usePresetHistoryStore` tracks preset navigation history (max 100 entries, cursor-based) for previous/next preset navigation. Also tracks `playedSet` for shuffle-style autopilot rounds. Not persisted.

`usePresetBrowserStore` holds preset browser panel UI state (active filter tab, search term, collapsed packs, scroll position). Session-scoped (not persisted) — survives panel open/close but resets on page refresh.

**Language preference** is persisted separately by `i18next-browser-languagedetector` to `localStorage` key `mangowave-language` (not Zustand). This allows i18n to resolve synchronously at module load before React mounts.

`useToastStore` drives single-message action toasts with typed variants (`info`, `error`, `warning`). API: `show(message, { type?, durationMs? })` — info auto-clears at 3.5s, error/warning at 6s. `durationMs` stored in state and drives both the JS cleanup timer and the CSS `toast-fade` animation duration (set dynamically via inline style).

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
- **`useSpotifyProgress`** — interpolates progress between 5s polls via `useSyncExternalStore` + `requestAnimationFrame` for smooth seek bar. Returns `[currentMs, setOptimistic]` — seek bar calls `setOptimistic` on pointer-up to jump immediately instead of snapping back to stale position
- **Seek/shuffle/repeat** — `PUT /me/player/seek`, `PUT /me/player/shuffle`, `PUT /me/player/repeat`. `disallows` field parsed from player state (available for future UI hints but not used as action guards — stale poll data would block valid actions)
- **Error handling** — 403 responses parsed via `handleForbidden`: only `PREMIUM_REQUIRED` reason sets `premiumError` flag; other 403s show generic toast. 401 triggers `withTokenRetry` (refresh + single retry). Token refresh centralized in `useSpotifyStore.refreshAccessToken` (owner + BYOC)
- **Polling** — 5s interval via `useNowPlaying`, only active when visualizer is running (`isSpotifyConnected && isActive`). No API calls on the start screen
- **Auth mode** — UI branches on `authMode === 'owner'` (not `isSpotifyUnlocked`)
- **Connect button** — click guard (`isConnecting` state) prevents double-auth

### PlaybackPanel

Floating panel (`components/PlaybackPanel.tsx`) rendered by App.tsx when local playback is active or Spotify is connected (Premium only). Contains seek bar, transport controls (prev/play/next), shuffle, repeat, Now Playing toggle, queue toggle (local only), and volume (local only, desktop only).

- **Idle auto-hide** — `useIdleTimer` with `pause`/`resume` (hover keeps visible on desktop) and `forceIdle` (instant hide after mobile radial actions). 5s mobile, 3s desktop
- **Mobile** — hidden when FAB menu is open (`mobileMenuOpen` state in App.tsx)

## Key Technical Notes

- **WebGL 2 required.** `isWebGL2Supported()` checks on mount and shows a fallback if unavailable.
- **butterchurn is untyped** — type declarations live in `src/types/butterchurn.d.ts`.
- **`vite.config.ts`** imports `defineConfig` from `vitest/config` (not `vite`) to support the `test` property.
- **400+ presets** loaded from 5 butterchurn packs, organized by source pack with virtualized browsing (`react-virtuoso`).
- **`secure-json-parse`** used for prototype pollution protection on settings import.
- **Settings import sanitization** — all imported values clamped to UI-enforced ranges. Whitelisted data keys only (store functions can't be overwritten).
- **Audio capture errors** — `humanizeAudioError` in `useAudioCapture` maps DOMException names to user-friendly messages per source (system vs mic). Missing audio tracks on screen share (user forgot "Share audio") block launch with browser/OS-aware guidance via `buildNoAudioMessage` (uses `browserInfo` to show only the relevant platform's constraints and names the user's browser if non-Chromium). `startCapture`/`startMicCapture` return `boolean` success so callers gate on result.
- **Silence detection** — App.tsx polls time-domain waveform data every 1.5s after system or mic capture starts; warns via toast at ~6s if no signal. Auto-dismisses if audio starts flowing.
- **File validation** — `audioFileValidation.ts` validates files by MIME type (`audio/*`) with extension fallback for platforms where MIME detection is incomplete (e.g. Linux `shared-mime-info`). File inputs use `AUDIO_ACCEPT` (MIME wildcard + explicit extensions) so Linux file pickers don't hide valid audio files. StartScreen shows rejection errors in the modal; MediaPlaylist queue shows error toast. `useLocalPlayback` listens for `error` events on the audio element and shows a decode-error toast (with auto-advance to the next queued track).
- **WebGL context loss** — `Visualizer` listens for `webglcontextlost` on the canvas; App.tsx shows a reload overlay with user-facing explanation.
- **i18n** — `react-i18next` with 9 languages, 4 namespaces (common, start, settings, messages). All translations statically bundled (no lazy loading). Browser language auto-detected via `i18next-browser-languagedetector`, persisted to localStorage (`mangowave-language`). Synchronous init (`initImmediate: false`) prevents re-render flicker. Components use `useTranslation` hook; non-React code (error handlers, utils) uses `i18n.getFixedT()`. App.tsx uses the `i18n` singleton directly (not `useTranslation`) to avoid unstable hook references that restart effects. Language picker on StartScreen footer.
