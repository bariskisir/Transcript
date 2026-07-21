# Agent Instructions

## Project Overview

Transcript is a secure Electron desktop application for live speech transcription. It uses
TypeScript across the Electron main process, sandboxed preload bridge, and React renderer. The
renderer captures microphone and Windows speaker-loopback audio, converts every source to 16 kHz
mono PCM16 in an AudioWorklet, and sends bounded frames to the main process. The main process opens
one Deepgram WebSocket per enabled source, persists settings and transcripts as validated JSON,
stores the API key with Electron `safeStorage`, writes rolling logs, and manages GitHub Releases
updates.

## Repository Layout

- `.github/workflows/release.yml`: tagged Windows release workflow.
- `build/`: committed SVG, PNG, and ICO application icons.
- `src/main/`: Electron lifecycle, hardened window, IPC boundary, validation, persistence,
  Deepgram, logging, credentials, exports, migration, and updates.
- `src/preload/`: the only API exposed to the sandboxed renderer.
- `src/renderer/`: Vite HTML entry and the React application.
- `src/renderer/src/audio/`: browser media capture and AudioWorklet integration.
- `src/renderer/src/components/`: reusable title bar and sidebar components.
- `src/renderer/src/pages/`: Transcript workspace and settings UI.
- `src/renderer/src/i18n/`: i18next initialization and all interface locales.
- `src/renderer/src/store/`: Redux Toolkit application and live-session state.
- `src/renderer/src/assets/styles/`: global SCSS tokens, resets, and scrollbar styling.
- `src/shared/`: serializable contracts, IPC channel names, Deepgram catalog, and worklet source.
- `tests/`: Vitest coverage for domain behavior and infrastructure boundaries.
- `vite.config.ts`: Vite 8 build for renderer, main, and preload outputs.
- `package.json`: scripts, direct dependency versions, Electron Builder configuration, and release
  metadata.

Keep production application code under `src/`. Root-level files should be limited to repository,
tooling, and build configuration.

## Toolchain And Commands

Use Node.js 24 or newer. Run commands from the repository root. On PowerShell installations that
block `npm.ps1`, invoke `npm.cmd` instead of changing the machine execution policy.

- Install exactly from the lockfile: `npm ci`
- Start the development application: `npm run dev`
- Type-check both process targets: `npm run typecheck`
- Lint: `npm run lint`
- Run tests: `npm test`
- Check formatting: `npm run format:check`
- Build main, preload, and renderer: `npm run build`

Before finishing a code change, run at minimum:

```powershell
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
```

Do not run `npm run package`, `npm run package:win`, or `npm run release` unless packaging or a
release artifact is explicitly requested. A normal verification build must not create an installer.

## Dependency Policy

- Keep direct dependencies pinned to exact versions and commit `package-lock.json` with changes.
- Check every direct package against its npm `latest` dist-tag; `npm outdated --json` should be
  empty after an intentional dependency refresh.
- Respect peer dependency and Node engine ranges. Do not use `--force` to leave an invalid tree.
- Run `npm ls --depth=0`, the full verification suite, and a production build after upgrades.
- Vite 8 uses Rolldown options. Keep third-party packages in one stable vendor group; size-based
  vendor subdivision can break initialization order in packaged `file://` renderer builds.
- Main-process runtime dependencies must remain available to Electron Builder when externalized by
  `vite-plugin-electron`.

## Runtime Architecture

1. `src/main/index.ts` configures application paths before Electron becomes ready, acquires the
   single-instance lock, composes services, creates the window, registers IPC, and schedules the
   optional packaged update check.
2. `WindowService` creates a hardened `BrowserWindow` with context isolation, sandboxing, no Node
   integration, restricted navigation, and narrowly scoped media permissions.
3. `src/preload/index.ts` exposes the typed `TranscriptApi` through `contextBridge`. The renderer
   never imports Electron or Node APIs directly.
4. `src/renderer/src/entryPoint.tsx` initializes i18next and mounts the Redux, theme, Ant Design,
   and React provider stack.
5. `useAppInit` bootstraps persisted state and owns main-to-renderer event subscriptions.
6. `AudioCaptureService` captures enabled sources independently and streams PCM frames through the
   preload API without awaiting one IPC round trip per frame.
7. `TranscriptService` coordinates the encrypted key, transcript workspace, source-separated
   Deepgram connections, interim events, batched final-segment persistence, and deterministic stop.
8. `StorageService` validates durable data and serializes all operations targeting the same file.

## Process And IPC Boundaries

- The main process owns filesystem access, credentials, network WebSockets, native dialogs,
  external links, logging, window state, and updates.
- The preload must remain capability-limited. Never expose raw `ipcRenderer`, unrestricted channel
  access, filesystem primitives, or shell execution.
- The renderer is untrusted input. Validate every IPC payload in `src/main/ipc.ts` with Zod, bound
  strings and binary payload sizes, and verify the sender belongs to the active main window.
- Keep all IPC payloads serializable. Shared contracts belong in `src/shared/types.ts`; channel
  names belong in `src/shared/IpcChannel.ts`.
- When adding or changing a command, update all relevant boundaries together:
  `IpcChannel`, `TranscriptApi`, preload implementation, main handler and schema, renderer caller,
  and tests.
- External URLs must pass the main-process HTTPS origin allow-list before `shell.openExternal` is
  called.
- Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`.
  Do not add development flags that disable the Electron sandbox or web security.

## Audio And Deepgram Rules

- Microphone and speaker audio are separate `AudioSource` values from capture through persistence.
  Each enabled source must have its own Deepgram WebSocket. Never mix both sources into one stream.
- Audio sent to Deepgram must be mono linear PCM16 at 16 kHz. Preserve the resampling, bounded worklet
  chunks, IPC size limit, socket backpressure limit, and bounded pre-connect queue.
- Keep realtime latency low: send interim results immediately, replace interim text as Deepgram
  revises it, append final results once, and batch only durable final-segment writes.
- Stop local capture first, flush the worklet's partial PCM frame, then finalize and close Deepgram,
  await pending persistence, and save the duration. Stop must remain idempotent and promptly visible
  in the UI.
- Treat expected WebSocket close-handshake failures during an intentional stop as normal shutdown,
  not as user-facing transcription errors.
- Speaker loopback is Windows-only. Keep the interface explicit on unsupported platforms.
- Device lists must expose one synthetic Default choice plus distinct physical endpoints; filter
  Chromium's duplicate `default` and `communications` pseudo-devices.
- The Deepgram model/language catalog is static in `src/shared/deepgram.ts`. Do not scrape Deepgram
  documentation at runtime and do not add the unreliable multilingual mode. A selected speech
  language must be valid for its selected model.
- Model option changes must be reflected in the endpoint builder, settings schema, settings UI, and
  relevant Deepgram tests. English-only options such as streaming redaction must stay constrained.

## Persistence, Credentials, And Logging

- Durable paths are rooted below `Transcript`: `Data/settings.json`, `Data/transcripts/*.json`,
  `Data/credentials.bin`, and `Logs/`. Chromium cache/session files belong below `Runtime/`.
- Preserve the distinction between durable data and disposable Electron runtime state.
- Settings and transcript JSON must pass their Zod schemas on both read and write.
- Renderer settings commands send only changed fields. Merge each validated patch with the latest
  settings inside the same main-process file lock so concurrent controls cannot overwrite each
  other; do not persist application settings through renderer localStorage.
- `StorageService` intentionally uses direct complete-file writes protected by per-file operation
  queues. Do not reintroduce temporary-file plus rename persistence or recovery logic; it previously
  caused race conditions and missing-file errors.
- Preserve the workspace invariant: there is always at least one transcript. The only empty
  transcript cannot be deleted; deleting the only populated transcript creates and selects an empty
  replacement.
- Default transcript titles use `isDefaultTitle` and are localized only for display. Renaming sets
  `isDefaultTitle` to false. Do not persist a UI-language-specific default title.
- API keys are validated before saving and encrypted only with asynchronous Electron `safeStorage`.
  There is no plaintext fallback. Never log, serialize into settings, expose during bootstrap, or
  commit an API key. Decryption is allowed only for the explicit settings credential field and live
  transcription.
- Logs are rolling, level-filtered files below `Transcript/Logs`. Renderer logging must go through
  the validated preload/main boundary. Do not log raw audio or full credentials.
- Legacy migration must remain allow-listed to durable settings, credentials, transcript JSON, and
  logs. Never copy an entire previous Chromium profile into the new data root.

## Renderer, Styling, And Localization

- Keep the compact desktop shell: native-style title bar, left global action rail, collapsible
  transcript sidebar, full-height workspace, and scrollable settings content.
- Reuse Ant Design controls, Lucide icons, semantic SCSS tokens, and component-scoped
  `*.module.scss` files. Do not place CSS in TSX `style` props or inline `<style>` elements.
- Global theme values belong in `assets/styles/_tokens.scss`; shared reset/scroll behavior belongs in
  `assets/styles/index.scss` and `_scrollbar.scss`.
- Use `build/icon.svg` for renderer logos. Keep SVG, PNG, ICO, package metadata, and About branding
  synchronized when changing the application identity.
- Transcript body text should remain continuous and space-efficient. Do not add per-segment source
  labels, clocks, cards, or metadata headers to the live reading surface.
- Transcript history is the collapsible left workspace sidebar, not a drawer from the right.
  Preserve create, open, rename, immediate delete, localized default titles, and the configured
  12/24-hour timestamp behavior.
- Every user-facing string must come from i18next. Supported interface locales are `en`, `tr`, `de`,
  `fr`, `pt`, `zh`, and `es`; this is independent of Deepgram speech languages.
- English is the canonical complete locale shape. When adding or renaming a key, update every locale
  in `src/renderer/src/i18n/locales/` and keep `tests/Localization.test.ts` passing.
- Error interpolation uses i18next parameters such as `{{details}}`; pass the matching value and do
  not hardcode unresolved template text.
- A settings field change normally requires updates to `AppSettings`, `DEFAULT_SETTINGS`,
  `settingsSchema`, persisted migration/default behavior, UI, all locales, and tests. Increment
  `settingsRevision` when persisted compatibility requires a schema migration.

## Updates And Releases

- `AppUpdater` queries GitHub's latest-release API for `bariskisir/transcript` in development and
  packaged builds. Development reports available metadata without downloading or installing;
  packaged builds download the matching installer.
- Startup update checks run immediately when enabled. Cache release discovery briefly so repeated
  controls do not consume the unauthenticated GitHub REST API quota unnecessarily.
- Downloaded updates install only after the user explicitly chooses install/restart. Run assisted
  NSIS updates silently with `--force-run`, select the exact architecture-specific setup asset,
  stream it to disk, and verify GitHub's SHA-256 digest when present.
- Releases are triggered by tags matching `v*`. The Windows workflow installs Node 24 dependencies,
  runs typecheck, lint, tests, and formatting checks, then builds and publishes x64 and arm64 NSIS
  setup executables.
- GitHub publishing must create a normal release rather than a draft. Publish only the lowercase
  architecture-specific setup executable; do not publish `.blockmap` or `latest.yml` metadata.
- Keep `package.json` version, product metadata, artifact names, GitHub API selection, icons, and
  workflow behavior aligned when changing release configuration.

## Testing Guidance

- Deepgram result parsing changes: update `tests/DeepgramMessageParser.test.ts`.
- Endpoint or model option changes: update `tests/DeepgramEndpoint.test.ts` and settings tests.
- Connection lifecycle, latency, backpressure, or stop changes: update
  `tests/DeepgramConnection.test.ts` and related service tests.
- Persistence, migration, title, delete, or workspace invariants: update
  `tests/StorageService.test.ts` and `tests/LegacyDataMigrationService.test.ts`.
- AudioWorklet framing/resampling changes: update `tests/AudioWorklet.test.ts`.
- UI state, formatting, and localization changes: update `AppSlice`, `Formatters`, and
  `Localization` tests.
- Credential balance behavior: update `tests/DeepgramAccountService.test.ts`.
- Export changes: update `tests/ExportService.test.ts`. Supported exports are TXT and JSON only.

Prefer deterministic unit tests with mocked filesystem, WebSocket, updater, or account boundaries.
Do not require a real Deepgram API key, microphone, speaker, GitHub release, or network connection in
the test suite.

## Code And Change Conventions

- Use English for filenames, identifiers, comments, logs, and source-level error messages.
- Begin each source and configuration file with a concise English description comment. Add a concise
  doc comment above each function, class, component, hook, and method that explains responsibility
  rather than restating its name.
- Keep strict TypeScript enabled, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Do not bypass errors with broad casts, `any`, or blanket lint
  suppressions.
- Use the `@main`, `@renderer`, and `@shared` aliases at layer boundaries; keep relative imports for
  nearby files when clearer.
- Prefer small services and hooks with explicit dependencies. Keep presentation orchestration out of
  the main service implementations and native/filesystem logic out of React components.
- Preserve unrelated user changes in a dirty worktree. Never commit runtime data, logs, credentials,
  `.env` files, `node_modules`, `out`, `release`, coverage output, or installers.
