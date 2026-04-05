# @mangowave/frontend

The MangoWave visualizer app — a React 19 + Vite 8 + TypeScript SPA that plays local files, captures system audio, or listens via microphone, rendering real-time MilkDrop-style visuals via butterchurn.

## Development

```bash
pnpm run dev        # Vite dev server at localhost:5173
pnpm run build      # tsc -b && vite build
pnpm run test       # Vitest (jsdom)
pnpm run test:watch # Vitest in watch mode
pnpm run e2e        # Playwright E2E tests
pnpm run e2e:ui     # Playwright with interactive UI
pnpm run e2e:headed # Playwright in headed mode
pnpm run lint       # ESLint (includes jsx-a11y)
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
├── components/    # UI: ControlBar, SettingsPanel (tabbed: EQ/Rendering/Presets/Shortcuts/Data/Sync/Spotify),
│                  #     PresetBrowser, MediaPlaylist, NowPlaying, PlaybackPanel, StartScreen,
│                  #     ImportModal (drag-and-drop import with progress/results),
│                  #     OnboardingOverlay (first-time tips), etc.
├── engine/        # AudioEngine (Web Audio pipeline), VisualizerRenderer (butterchurn),
│                  # milkdropConverter (.milk → butterchurn JSON via workspace milkdrop-preset-converter),
│                  # eelWasmAdapter (EEL→WASM compilation via eel-wasm, butterchurn adapter functions),
│                  # textureLoader (image validation), importProcessor (batch import with progress callbacks),
│                  # isWebGL2Supported
├── data/          # quarantined-presets.json, mobile-blocked-presets.json, excludedPresets.ts (shared Sets),
│                  # presetThematicPacks.ts (832-preset thematic classification map)
├── constants/     # shortcuts.ts (keyboard/mouse shortcut definitions)
├── i18n/          # i18next config + 9 locale dirs (en, es, zh, hi, ja, ko, ru, id, pt-BR)
│                  # 4 namespaces per locale: common, start, settings, messages
├── hooks/         # useAudioCapture, useLocalPlayback, useAutopilot, useKeyboardShortcuts,
│                  # useIdleTimer, useHideCursor, useFullscreen, useFocusTrap, useSpotifyAuth,
│                  # useNowPlaying, useSpotifyPlayback, useSpotifyProgress (smooth seek via rAF),
│                  # usePlaybackAdapter, usePresetNavigation, useUnlockCheck, useSettingsSync,
│                  # useWindowSync (multi-window sync bridge),
│                  # useDeviceSync (cross-device PeerJS WebRTC sync bridge)
├── lib/           # PostHog & Sentry init (no-op when env vars absent)
├── services/      # Spotify Web API client (owner-mode OAuth + PKCE utilities for self-hosters),
│                  # WindowSyncService (BroadcastChannel-based multi-window sync),
│                  # DeviceSyncService (PeerJS WebRTC cross-device sync),
│                  # syncTypes (shared sync type definitions), syncUtils (shared sync utilities)
├── store/         # Zustand stores: useSettingsStore, useSpotifyStore, useMediaPlayerStore,
│                  #     usePresetHistoryStore, usePresetBrowserStore, useImportedPresetsStore,
│                  #     useImportedTexturesStore, useToastStore, useConfirmStore, useImportModalStore,
│                  #     useWindowSyncStatusStore, useDeviceSyncStatusStore
├── utils/         # Shared utilities (isMobileDevice, browserInfo, settingsPortability, audioFileValidation)
├── types/         # music-metadata.d.ts, getDisplayMedia.d.ts, eel-wasm.d.ts (type declarations for untyped APIs)
└── test/          # Vitest global setup

e2e/                 # Playwright E2E tests (separate from Vitest, own tsconfig)
├── fixtures/        # Custom test fixture (state isolation), audio API mocks, test assets
└── *.spec.ts        # Test files: start-screen, visualizer, preset-browser, settings, keyboard, mobile
```

### State Management

Zustand with `localStorage` persistence. Key sections:

| Section                  | Fields                                                                                  | Defaults                    |
| ------------------------ | --------------------------------------------------------------------------------------- | --------------------------- |
| `performance`            | `fpsCap`, `resolutionScale`, `meshWidth`, `meshHeight`, `textureRatio`, `fxaa`          | 60, 1.0, 48, 36, 1.0, false |
| `audio`                  | `smoothingConstant`, `fftSize`                                                          | 0.3, 1024                   |
| `autopilot`              | `enabled`, `interval`, `mode`, `favoriteWeight`                                         | true, 15s, `'all'`, 2       |
| `eq`                     | `preAmpGain`, `bandGains[10]`                                                           | 1.5, all 0dB                |
| `blockedPresets`         | string[]                                                                                | []                          |
| `favoritePresets`        | string[]                                                                                | []                          |
| `presetNameDisplay`      | `'off' \| 'always' \| number`                                                           | 5                           |
| `songInfoDisplay`        | `'off' \| number` (on/off toggle, hardcoded 5s when on)                                 | 5                           |
| `transitionTime`         | number (seconds)                                                                        | 2.0                         |
| `volume`                 | number (0.0–1.0)                                                                        | 0.5                         |
| `brightness`             | number (0.1–1.0)                                                                        | 1.0                         |
| `enabledPacks`           | string[]                                                                                | all packs                   |
| `customPacks`            | `CustomPack[]` (`id`, `name`, `presets[]`, `createdAt`)                                 | []                          |
| `activeCustomPackId`     | `string \| null`                                                                        | null                        |
| `excludedOverrides`      | string[]                                                                                | []                          |
| `importedPresets`        | `ImportedPresetMeta[]` (`name`, `fileName`, `addedAt`, `missingTextures?`)              | []                          |
| `importedTextures`       | `ImportedTextureMeta[]` (`name`, `fileName`, `width`, `height`, `sizeBytes`, `addedAt`) | []                          |
| `windowSyncEnabled`      | boolean                                                                                 | false                       |
| `deviceSyncEnabled`      | boolean                                                                                 | false                       |
| `deviceSyncSettingsSync` | boolean                                                                                 | false                       |
| `syncPerformance`        | boolean                                                                                 | true                        |
| `onboardingShown`        | boolean                                                                                 | false                       |

Blocked and favorited presets are mutually exclusive.

On mobile, 36 GPU-heavy presets (identified via Pixel 10 Pro testing) are filtered from the pool and shown in the Excluded tab alongside quarantined presets. Users can permanently restore any excluded preset via the Excluded tab — overrides persist in `excludedOverrides`.

**Custom packs** are user-created preset collections (max 50 packs, up to 832 presets each). Starting a pack takes highest priority in pool-building — autopilot and manual prev/next cycle within the pack's presets only (minus blocked). Starting a pack auto-switches `favorites` autopilot mode to `all` and auto-advances if the current preset isn't in the pack. Empty packs cannot be started (Start button hidden). Removing the currently playing preset from the active pack during editing auto-advances to the next preset. Packs can be exported/imported as standalone `.json` files (`_meta.source: 'mangowave-pack'`, distinct from settings export). In the pack edit view, presets show status tags (blocked/excluded/mobile-skipped) so users can see which will be skipped at play time. All tab pack filter checkboxes remain interactive while a pack is active (autopilot/next-preset still draw from the pack pool; filters only affect the visible list). Synced via window sync (BroadcastChannel) and cloud sync (backend validates and persists `customPacks` and `activeCustomPackId`).

`useMediaPlayerStore` manages local file playback state (queue, current track, shuffle history, repeat mode). Not persisted — `File` objects can't survive page reload.

`usePresetHistoryStore` tracks preset navigation history (max 100 entries, cursor-based) for previous/next preset navigation. Also tracks `playedSet` for shuffle-style autopilot rounds. Not persisted.

`usePresetBrowserStore` holds preset browser panel UI state (active filter tab including "packs" and "import", search term, collapsed packs, selected pack for editing, scroll position). Session-scoped (not persisted) — survives panel open/close but resets on page refresh.

**Language preference** is persisted separately by `i18next-browser-languagedetector` to `localStorage` key `mangowave-language` (not Zustand). This allows i18n to resolve synchronously at module load before React mounts.

`useConfirmStore` drives the reusable `ConfirmDialog` component. API: `show({ title, message, onConfirm, confirmLabel?, destructive? })`. Supports destructive (red) and normal (orange) confirm buttons.

`useImportModalStore` drives the `ImportModal` component for .milk preset and texture imports. API: `open(mode, presetPackMap?)` / `close()`. Processing logic lives in `importProcessor.ts` (not the component) — the modal only manages UI state (phase, results, progress). Supports drag-and-drop and file browser, per-file result log with texture warnings, filter tabs for mixed results, and inline texture upload in the results phase (collapsible section with missing texture list, compact drop zone, real-time resolution tracking).

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

### Cross-Device Sync

PeerJS-based P2P sync via WebRTC DataChannel (`DeviceSyncService`). Complements the existing same-browser `WindowSyncService` (BroadcastChannel).

- **Star topology** — room creator is the host. All peers connect to the host, host relays messages. Room code (`MANGO-XXXX`) is the host's PeerJS peer ID
- **Autopilot** — host runs autopilot, non-host peers suppress theirs. Any device can manually change presets — broadcasts to all and resets host's autopilot timer
- **Settings sync** — autopilot settings always sync across devices. EQ, performance, brightness, and audio settings sync optionally (`deviceSyncSettingsSync` toggle). Inbound WebRTC data is type-validated and range-clamped (unlike BroadcastChannel which is same-origin)
- **Mobile** — blocked presets automatically substituted with a random available preset; `preset-redirect` message informs other devices. Desktops ignore redirects to prevent loops
- **Cross-sync bridging** — window sync and device sync fan out independently in `handlePresetChange`: a preset from window sync broadcasts to device sync and vice versa. `isRemotePresetRef` flags prevent echo loops
- **Dynamic imports** — PeerJS and qrcode-generator loaded on demand, zero main bundle cost
- **Lifecycle** — `useDeviceSync` hook manages service creation/destruction, operation mutex (`operationInFlightRef`), unmount cleanup, and stale action cleanup on the ephemeral `useDeviceSyncStatusStore`
- **UI** — Sync tab visible on all platforms. Window sync section (desktop only) + device sync section (everywhere). Create/join room, QR code, room code copy, status dot, peer count, settings sync toggle

### PlaybackPanel

Floating panel (`components/PlaybackPanel.tsx`) rendered by App.tsx when local playback is active or Spotify is connected (Premium only). Contains seek bar, transport controls (prev/play/next), shuffle, repeat, Now Playing toggle, queue toggle (local only), and volume (local only, desktop only).

- **Idle auto-hide** — `useIdleTimer` with `pause`/`resume` (hover keeps visible on desktop) and `forceIdle` (instant hide after mobile actions). 5s timeout, starts paused until launch animation completes
- **Mobile** — fades in sync with mobile circle buttons via shared idle timer

## Key Technical Notes

- **WebGL 2 required.** `isWebGL2Supported()` checks on mount and shows a fallback if unavailable.
- **butterchurn is untyped** — vendored as workspace packages (`packages/butterchurn`, `packages/butterchurn-presets`) with ESM wrappers and `.d.ts` declarations. 66 standard MilkDrop textures bundled via `milkdrop-textures` workspace package (loaded at renderer init alongside butterchurn's 6 built-in textures).
- **`vite.config.ts`** imports `defineConfig` from `vitest/config` (not `vite`) to support the `test` property.
- **832 presets** (395 butterchurn + 437 MilkDrop-Original) across 4 thematic packs (Ambient, Reactive, Psychedelic, Ethereal) with virtualized browsing (`react-virtuoso`).
- **`secure-json-parse`** used for prototype pollution protection on settings import.
- **Settings import sanitization** — all imported values clamped to UI-enforced ranges. Whitelisted data keys only (store functions can't be overwritten). Array fields (favorites, blocked, packs) are merged/unioned with existing state rather than replaced. Custom packs merge by id with auto-rename on name collision. If a preset is in both favorites and blocked after merge, block wins (removed from favorites).
- **Audio capture errors** — `humanizeAudioError` in `useAudioCapture` maps DOMException names to user-friendly messages per source (system vs mic). Missing audio tracks on screen share (user forgot "Share audio") block launch with browser/OS-aware guidance via `buildNoAudioMessage` (uses `browserInfo` to show only the relevant platform's constraints and names the user's browser if non-Chromium). `startCapture`/`startMicCapture` return `boolean` success so callers gate on result.
- **Silence detection** — App.tsx polls time-domain waveform data every 1.5s after any audio source starts (system capture, microphone, or local files); warns via toast at ~6s if no signal. Source-specific messages guide the user. Auto-dismisses if audio starts flowing.
- **File validation** — `audioFileValidation.ts` validates files by MIME type (`audio/*`) with extension fallback for platforms where MIME detection is incomplete (e.g. Linux `shared-mime-info`). File inputs use `AUDIO_ACCEPT` (MIME wildcard + explicit extensions) so Linux file pickers don't hide valid audio files. StartScreen shows rejection errors in the modal; MediaPlaylist queue shows error toast. `useLocalPlayback` listens for `error` events on the audio element and shows a decode-error toast (with auto-advance to the next queued track).
- **WebGL context loss** — `Visualizer` listens for `webglcontextlost` on the canvas; App.tsx shows a reload overlay with user-facing explanation.
- **i18n** — `react-i18next` with 9 languages, 4 namespaces (common, start, settings, messages). All translations statically bundled (no lazy loading). Browser language auto-detected via `i18next-browser-languagedetector`, persisted to localStorage (`mangowave-language`). Synchronous init (`initImmediate: false`) prevents re-render flicker. Components use `useTranslation` hook; non-React code (error handlers, utils) uses `i18n.getFixedT()`. App.tsx uses the `i18n` singleton directly (not `useTranslation`) to avoid unstable hook references that restart effects. Language picker on StartScreen footer.
