# Agent Instructions

## Project Overview

Transcript is a security-sensitive Electron desktop application for live speech transcription and
optional sentence translation. TypeScript is used across the Electron main process, the sandboxed
preload bridge, and the React renderer. The renderer captures microphone and Windows
speaker-loopback audio, converts every source independently to 16 kHz mono PCM16 in an
AudioWorklet, and sends bounded frames to the main process. The main process opens one Deepgram
WebSocket per enabled source, translates completed sentences through the selected Google or Bing
provider, persists validated settings and transcript documents, protects the Deepgram key with
Electron `safeStorage`, writes rolling logs, and manages GitHub Releases updates.

Treat the current working tree as the source of truth. Do not inspect Git history or perform Git
operations unless the user explicitly requests them.

## Repository Layout

- `.github/workflows/release.yml`: tagged Windows verification, packaging, and release workflow.
- `build/`: committed SVG, PNG, and ICO application icons.
- `images/`: README interface screenshots; production assets still belong under `build/` or `src/`.
- `src/main/`: Electron lifecycle, paths, IPC validation, persistence, credentials, Deepgram,
  translation, exports, logging, migration, window security, and updates.
- `src/preload/`: the only API exposed to the sandboxed renderer.
- `src/renderer/`: Vite HTML entry and the React application.
- `src/renderer/src/audio/`: browser media capture and AudioWorklet integration.
- `src/renderer/src/components/`: reusable desktop-shell and transcript-sidebar components.
- `src/renderer/src/pages/`: live transcript workspace and categorized settings UI.
- `src/renderer/src/i18n/`: i18next initialization and all interface locales.
- `src/renderer/src/store/`: Redux Toolkit application and live-session state.
- `src/renderer/src/assets/styles/`: global SCSS tokens, reset, and scrollbar styling.
- `src/shared/`: serializable contracts, IPC channel names, provider catalogs, and worklet source.
- `tests/`: Vitest coverage for domain behavior and infrastructure boundaries.
- `vite.config.ts`: Vite 8 build for renderer, main, and preload outputs.
- `package.json`: scripts, exact direct dependency versions, Electron Builder configuration, and
  release metadata.

Keep production application code under `src/`. Root-level files should be limited to repository
documentation, tooling, and build configuration.

## Toolchain and Commands

Use Node.js 24 or newer and run commands from the repository root. On PowerShell installations that
block `npm.ps1`, invoke `npm.cmd` instead of changing the machine execution policy.

- Install exactly from the lockfile: `npm ci`
- Start the development application: `npm run dev`
- Type-check both process targets: `npm run typecheck`
- Lint source, tests, and build configuration: `npm run lint`
- Run the deterministic test suite: `npm test`
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

- Keep direct dependencies pinned to exact versions and commit `package-lock.json` with dependency
  changes.
- Check every direct package against its npm `latest` dist-tag; `npm outdated --json` should be
  empty after an intentional dependency refresh.
- Respect peer dependency and Node engine ranges. Do not use `--force` to leave an invalid tree.
- Run `npm ls --depth=0`, the full verification suite, and a production build after upgrades.
- Vite 8 uses Rolldown options. Keep third-party packages in one stable `vendor` group; size-based
  vendor subdivision can break initialization order in packaged `file://` renderer builds.
- Main-process runtime dependencies must remain available to Electron Builder when externalized by
  `vite-plugin-electron`.

## Runtime Architecture

1. `src/main/index.ts` configures application paths before Electron becomes ready, acquires the
   single-instance lock, migrates allow-listed legacy data, composes services, creates the window,
   registers IPC, and schedules the optional packaged update check.
2. `WindowService` creates a hardened `BrowserWindow` with context isolation, sandboxing, no Node
   integration, restricted navigation, and narrowly scoped media permissions.
3. `src/preload/index.ts` exposes the typed `TranscriptApi` through `contextBridge`. The renderer
   never imports Electron or Node APIs directly.
4. `src/renderer/src/entryPoint.tsx` initializes i18next and mounts the Redux, theme, Ant Design,
   and React provider stack.
5. `useAppInit` bootstraps persisted state and owns main-to-renderer event subscriptions.
6. `AudioCaptureService` captures enabled sources independently. `useRecordingActions` starts local
   capture promptly, keeps only a bounded pre-connect frame queue per source, and streams PCM frames
   through preload without awaiting one IPC round trip per frame.
7. `TranscriptService` coordinates the encrypted key, transcript workspace, source-separated
   Deepgram connections, interim events, batched final-segment persistence, sentence translation,
   and deterministic stop.
8. `TranslationProviderService` routes completed sentences to Google or Bing. Persisted translations
   retain source character ranges and segment identifiers so the renderer can correlate both panes.

## Process and IPC Boundaries

- The main process owns filesystem access, credentials, remote provider calls, WebSockets, native
  dialogs, external links, logging, window state, and updates.
- The preload must remain capability-limited. Never expose raw `ipcRenderer`, unrestricted channel
  access, filesystem primitives, or shell execution.
- The renderer is untrusted input. Validate every IPC payload in `src/main/ipc.ts` with Zod, bound
  strings and binary payload sizes, and verify the sender belongs to the active main window.
- Keep all IPC payloads serializable. Shared contracts belong in `src/shared/types.ts`; channel
  names belong in `src/shared/IpcChannel.ts`.
- When adding or changing a command, update all relevant boundaries together: `IpcChannel`,
  `TranscriptApi`, preload implementation, main handler and schema, renderer caller, and tests.
- External URLs must pass the main-process HTTPS origin allow-list before `shell.openExternal` is
  called. Update downloads have a separate exact GitHub origin, path, filename, size, and digest
  trust boundary.
- Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`.
  Do not add development flags that disable the Electron sandbox or web security.

## Audio and Deepgram Rules

- Microphone and speaker audio are separate `AudioSource` values from capture through persistence.
  Each enabled source must have its own Deepgram WebSocket. Never mix both sources into one stream.
- Audio sent to Deepgram must be mono linear PCM16 at 16 kHz. Preserve multi-channel averaging,
  resampling, bounded worklet chunks, the IPC size limit, socket backpressure limit, and bounded
  pre-connect/application queues.
- Keep realtime latency low: send interim results immediately, replace interim text as Deepgram
  revises it, append final results once, and batch only durable final-segment writes.
- Stop local capture first, stop its tracks, flush the worklet's partial PCM frame, then finalize and
  close Deepgram, await pending transcript and translation persistence, and save the duration. Stop
  must remain idempotent, cancellable during connection, and promptly visible in the UI.
- Treat expected WebSocket send or close-handshake failures during an intentional stop as normal
  shutdown, not as user-facing transcription errors.
- Speaker loopback is Windows-only. Keep the platform limitation explicit in IPC and the UI.
- Device lists must expose one synthetic Default choice plus distinct physical endpoints; filter
  Chromium's duplicate `default` and `communications` pseudo-devices.
- The Deepgram model/language catalog is static in `src/shared/deepgram.ts`. Do not scrape provider
  documentation at runtime and do not add the unreliable multilingual mode. A selected speech
  language must be valid for its selected model.
- Model option changes must be reflected in the catalog, endpoint builder, settings schema,
  migration/default behavior, settings UI, locales when needed, and relevant Deepgram tests.
  English-only options such as streaming redaction must stay constrained.

## Translation Rules

- Translation is optional and independent from the interface language and Deepgram speech language.
  Supported providers and target languages belong in `src/shared/translation.ts`.
- Translate complete sentences during live capture. On explicit translation requests or session
  stop, include the final unpunctuated trailing text so no durable text is stranded.
- Preserve the sentence matcher's exact continuous-text convention: trim segments, join them with a
  single space, and store `sourceStartIndex`, `sourceEndIndex`, and `sourceSegmentIds` against that
  text. The renderer and persistence logic depend on these ranges for hover correspondence.
- Track translation coverage separately for transcript, provider, source language, and target
  language. Avoid duplicate work and preserve per-pair ordering when requests overlap.
- Persist a successful translation before publishing it to the renderer. A provider failure is
  recoverable and must not stop transcription.
- Never log sentence text sent to a translation provider. Keep provider response parsing defensive,
  normalize regional language codes deliberately, retain request timeouts, and mock network clients
  in tests.
- TXT exports may append only the currently selected provider/target translation. JSON remains the
  complete lossless transcript document. Supported export formats are TXT and JSON only.

## Persistence, Credentials, and Logging

- Durable paths are rooted below `Transcript`: `Data/settings.json`,
  `Data/transcripts/*.json`, `Data/credentials.bin`, and `Logs/`. Chromium cache and session files
  belong below `Runtime/`.
- Preserve the distinction between durable data and disposable Electron runtime state.
- Settings, transcript segments, translations, and complete transcript JSON must pass their Zod
  schemas on both read and write.
- Renderer settings commands send only changed fields. Merge each validated patch with the latest
  settings inside the same main-process file lock so concurrent controls cannot overwrite each
  other. Do not persist application settings through renderer `localStorage`.
- `StorageService` intentionally uses direct complete-file writes protected by per-file operation
  queues. Do not reintroduce temporary-file-plus-rename persistence or recovery logic; obsolete
  `.tmp` files are cleanup-only legacy artifacts.
- Preserve the workspace invariant: there is always at least one transcript. The only empty
  transcript cannot be deleted; deleting the only populated transcript creates and selects an empty
  replacement.
- Default transcript titles use `isDefaultTitle` and are localized only for display. Renaming sets
  `isDefaultTitle` to `false`. Do not persist a UI-language-specific default title.
- API keys are validated before saving and encrypted only with asynchronous Electron `safeStorage`.
  There is no plaintext fallback. Never log, serialize into settings, expose during bootstrap, or
  commit an API key. Decryption is allowed only for the explicit settings credential field and live
  transcription.
- Logs are level-filtered daily files below `Transcript/Logs`, with general and error retention.
  Renderer logging must go through the validated preload/main boundary. Do not log raw audio, API
  keys, full credentials, or complete transcript/translation text.
- Legacy migration must remain allow-listed to durable settings, credentials, transcript JSON, and
  logs. Never copy an entire previous Chromium profile into the new data root.

## Renderer, Styling, and Localization

- Keep the compact desktop shell: native-style title bar, left global action rail, collapsible
  transcript sidebar, full-height workspace, and scrollable categorized settings content.
- Reuse Ant Design controls, Lucide icons, semantic SCSS tokens, and component-scoped
  `*.module.scss` files. Do not place CSS in TSX `style` props or inline `<style>` elements.
- Global theme values belong in `assets/styles/_tokens.scss`; shared reset and scroll behavior
  belongs in `assets/styles/index.scss` and `_scrollbar.scss`.
- Use `build/icon.svg` for renderer logos. Keep SVG, PNG, ICO, package metadata, and About branding
  synchronized when changing the application identity.
- Transcript body text should remain continuous and space-efficient. Do not add per-segment source
  labels, clocks, cards, or metadata headers to the live reading surface. Keep optional translation
  as the existing correlated secondary pane.
- Transcript history is the collapsible left workspace sidebar, not a drawer from the right.
  Preserve create, open, rename, immediate delete, localized default titles, and the configured
  12/24-hour timestamp behavior.
- Keep renderer orchestration in hooks and Redux state. Native, credential, provider-network, and
  filesystem work stays out of React components.
- Every user-facing string must come from i18next. Supported interface locales are `en`, `tr`, `de`,
  `fr`, `pt`, `zh`, and `es`; this is independent of speech and translation languages.
- English is the canonical complete locale shape. When adding or renaming a key, update every locale
  in `src/renderer/src/i18n/locales/` and keep `tests/Localization.test.ts` passing.
- Error interpolation uses i18next parameters such as `{{details}}`; pass the matching value and do
  not hardcode unresolved template text.
- A settings field change normally requires updates to `AppSettings`, `DEFAULT_SETTINGS`,
  `settingsSchema`, persisted migration/default behavior, UI, all locales, and tests. Increment
  `settingsRevision` only when persisted compatibility requires a schema migration.

## Updates and Releases

- `AppUpdater` queries GitHub's latest-release API for `bariskisir/transcript`. Development reports
  available metadata without downloading or installing; packaged builds download the matching
  Windows installer.
- Packaged startup update checks run immediately when enabled. Cache release discovery briefly so
  repeated controls do not consume the unauthenticated GitHub REST API quota unnecessarily.
- Downloaded updates install only after the user explicitly chooses install/restart. Run assisted
  NSIS updates silently with `--force-run`, select the exact architecture-specific setup asset,
  stream it to disk, and verify its size and GitHub SHA-256 digest when present.
- Releases are triggered by tags matching `v*`. The Windows workflow installs Node 24 dependencies,
  validates the tag against `package.json`, runs typecheck, lint, tests, and formatting checks, then
  builds and publishes x64 and arm64 NSIS setup executables.
- GitHub publishing must create a normal release rather than a draft. Publish only the lowercase
  architecture-specific setup executables; do not publish `.blockmap` or `latest.yml` metadata.
- Keep `package.json` version, product metadata, artifact names, GitHub API selection, icons, and
  workflow behavior aligned when changing release configuration.

## Testing Guidance

- Deepgram result parsing changes: update `tests/DeepgramMessageParser.test.ts`.
- Endpoint, model, language, or option changes: update `tests/DeepgramEndpoint.test.ts` and settings
  tests.
- Connection lifecycle, latency, backpressure, or stop changes: update
  `tests/DeepgramConnection.test.ts` and `tests/TranscriptService.test.ts`.
- AudioWorklet framing, resampling, or channel handling changes: update
  `tests/AudioWorklet.test.ts`.
- Persistence, migration, title, deletion, translation storage, or workspace invariants: update
  `tests/StorageService.test.ts` and `tests/LegacyDataMigrationService.test.ts` as relevant.
- Translation provider behavior: update `tests/GoogleTranslateService.test.ts` or
  `tests/BingTranslateService.test.ts`; sentence boundaries and range mapping belong in
  `tests/TranscriptSentenceMatcher.test.ts` and session scheduling in
  `tests/TranscriptService.test.ts`.
- UI state, formatting, settings serialization, and localization changes: update `AppSlice`,
  `Formatters`, `SettingsPersistenceQueue`, `SettingsSchema`, and `Localization` tests as relevant.
- Credential balance behavior: update `tests/DeepgramAccountService.test.ts`.
- Export changes: update `tests/ExportService.test.ts`. Supported exports are TXT and JSON only.
- Navigation, logging, updater, release client, or packaging configuration changes have dedicated
  boundary tests under `tests/`; keep them synchronized.

Prefer deterministic unit tests with mocked filesystem, WebSocket, updater, account, fetch, or
translation boundaries. Do not require a real Deepgram API key, microphone, speaker, GitHub release,
or network connection in the test suite.

## Code and Change Conventions

- Use English for filenames, identifiers, comments, logs, source-level error messages, and this
  document.
- Begin each source and configuration file with a concise English description comment. Add a concise
  doc comment above each function, class, component, hook, and method that explains responsibility
  rather than restating its name.
- Follow the repository Prettier style: two spaces, no semicolons, single quotes, trailing commas,
  100-column print width, UTF-8, LF, and a final newline.
- Keep strict TypeScript enabled, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Do not bypass errors with broad casts, `any`, or blanket lint
  suppressions.
- Use the `@main`, `@renderer`, and `@shared` aliases at layer boundaries; keep relative imports for
  nearby files when clearer.
- Prefer small services and hooks with explicit dependencies. Keep presentation orchestration out
  of main service implementations and native/filesystem logic out of React components.
- Preserve unrelated user files and changes. Never commit runtime data, logs, credentials, `.env`
  files, `node_modules`, `out`, `release`, TypeScript build info, coverage output, or installers.
