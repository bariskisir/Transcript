# Agent Instructions

## Project Overview

Transcript is a Tauri 2 desktop app for live speech transcription. The Rust backend captures speaker and microphone audio, converts audio to 16 kHz mono PCM, streams it to Deepgram, persists settings/transcripts as JSON files, and emits live events to a TypeScript frontend.

The UI is a compact desktop control surface with:

- Deepgram API key validation and saved-key gating.
- Speaker and microphone source toggles/selects.
- Language selection.
- Transcript navigation, create/delete, copy, start/stop controls.
- Footer links for developer and source repository.

## Repository Layout

- `.github/workflows/release-desktop.yml`: tagged-release workflow. Builds Windows, Linux, and macOS packages with Node 22, stable Rust, Tauri CLI v2, `npm ci`, and `cargo tauri build`, then publishes release assets.
- `.gitignore`: ignores build outputs, generated schemas, IDE files, logs, local DBs, `.env`, and `frontend/dist`.
- `README.md`: user-facing overview and basic development commands.
- `LICENSE`: MIT license.
- `Cargo.toml`: Rust package manifest. Main crate is `transcript`, edition 2024, Tauri 2 desktop app. Uses `vendor/typeid` through `[patch.crates-io]`.
- `Cargo.lock`: locked Rust dependency graph for Tauri, CPAL, Deepgram HTTP/WebSocket stack, Tokio, Reqwest, Serde, etc.
- `package-lock.json`: root-level empty npm lock; the active frontend lockfile is `frontend/package-lock.json`.
- `tauri.conf.json`: Tauri product metadata, frontend build hooks, app window size, icons, and bundle targets.
- `build.rs`: ensures `frontend/dist` exists for `cargo run`, then calls `tauri_build::build()`.
- `capabilities/default.json`: Tauri capability for the `main` window with `core:default`.
- `gen/schemas/*`: generated Tauri schema/ACL metadata. These are ignored generated files; avoid manual edits.
- `icons/*`: app icon assets.
- `images/interface.png`: README/interface screenshot.
- `claude.md`: intentionally contains only `read agents.md`.

## Rust Backend

- `src/main.rs`: app startup, path/logger setup, `AppState` creation, event forwarder setup, Tauri command registration.
- `src/domain.rs`: domain constants, audio source enum, audio device DTO, language options, transcript records/segments, app settings, Deepgram account status, language normalization/model selection.
- `src/app/mod.rs`: application-layer module declarations and public re-exports.
- `src/app/commands.rs`: thin Tauri command wrappers. Keep command handlers small and delegate behavior to `AppState`.
- `src/app/state.rs`: central mutable app state behind `Arc<Mutex<_>>`; owns storage, settings, balance/status, transcript list, active transcript id, audio devices, capture session, Tokio runtime, and Deepgram event sender.
- `src/app/capture.rs`: starts/stops/reconciles speaker and microphone capture streams and spawns one Deepgram streaming worker per active source.
- `src/app/events.rs`: bridges Deepgram worker events to Tauri frontend events and persists final transcript segments.
- `src/app/transcripts.rs`: helpers for default device selection, active transcript resolution, and transcript display text formatting.
- `src/app/view.rs`: frontend-facing DTOs. Rust serializes these as camelCase; keep them synchronized with `frontend/src/types.d.ts`.
- `src/infra/mod.rs`: infrastructure module exports.
- `src/infra/audio.rs`: CPAL device discovery and capture. Speaker loopback is Windows-only. Captured samples are converted to mono 16 kHz PCM16.
- `src/infra/deepgram.rs`: Deepgram API key validation, balance lookup, realtime WebSocket streaming, auth fallback, keepalive/silence handling, and response parsing.
- `src/infra/logging.rs`: minimal file logger writing INFO-level records to the app data directory.
- `src/infra/paths.rs`: resolves app data paths under `dirs::data_dir()/Transcript`; creates `data/` for transcript JSON files.
- `src/infra/shell.rs`: opens external URLs with `cmd /C start`, `open`, or `xdg-open`.
- `src/infra/storage.rs`: JSON persistence for `settings.json` and transcript files.

## Frontend

- `frontend/package.json`: active frontend package. Scripts: `build` and `watch`.
- `frontend/package-lock.json`: locks TypeScript 5.9.3.
- `frontend/tsconfig.json`: strict TypeScript, `outFile` is `frontend/dist/app.js`, source root is `frontend/src`.
- `frontend/scripts/prepare-dist.mjs`: creates `frontend/dist` and copies `index.html` and `styles.css`.
- `frontend/index.html`: source document shell. DOM ids must match `frontend/src/dom.ts`.
- `frontend/styles.css`: source UI styles. Compact dark desktop theme; footer, controls, transcript body, and buttons are styled here.
- `frontend/src/types.d.ts`: TypeScript mirrors of Rust DTOs and UI event payloads.
- `frontend/src/tauri.d.ts`: Tauri global API declarations.
- `frontend/src/dom.ts`: typed DOM lookup. Any new DOM id used by TS must be registered here.
- `frontend/src/backend.ts`: wrapper around `window.__TAURI__.core.invoke` and `window.__TAURI__.event.listen`.
- `frontend/src/render.ts`: rendering, select population, button state, transcript text, copy feedback, toggle state, and device-name cleanup.
- `frontend/src/app.ts`: UI event binding, command invocation, backend event handling, app state refresh/navigation/settings save.
- `frontend/app.js`: legacy/fallback compiled JavaScript. It can be copied by `build.rs` only when `frontend/dist/app.js` is missing. Prefer rebuilding from TypeScript with `npm.cmd run build`; do not treat this file as the source of truth.

## Generated And Vendor Files

- `gen/schemas/acl-manifests.json`, `gen/schemas/capabilities.json`, `gen/schemas/desktop-schema.json`, and `gen/schemas/windows-schema.json` are generated Tauri schema/ACL files. They document/validate Tauri capability formats and built-in core permissions.
- `vendor/typeid/` is a local patched copy of `typeid` 1.0.3 without its upstream build script. The patch exists because the upstream build script caused file-lock issues in the Windows sandboxed development environment. Avoid modifying it unless the dependency patch itself is the task.

## Build And Verification

Run commands from the repository root unless noted.

- Install frontend deps: `cd frontend; npm.cmd install`
- Frontend build: `cd frontend; npm.cmd run build`
- Frontend watch: `cd frontend; npm.cmd run watch`
- Rust format: `cargo fmt`
- Rust build: `cargo build`
- Run locally: `cargo run`
- Release package build: `cargo tauri build`

There is no dedicated automated test suite. For most changes:

1. Run `npm.cmd run build` after frontend source, HTML, or CSS changes.
2. Run `cargo fmt` after Rust changes.
3. Run `cargo build` after Rust, Tauri config, build script, or command-boundary changes.

## Runtime Architecture

1. `src/main.rs` resolves app paths, installs file logging, creates `AppState`, spawns the event forwarder, and registers commands.
2. The frontend calls Rust commands with `window.__TAURI__.core.invoke`.
3. `AppState` loads settings and transcripts from the app data directory, resolves default devices, and creates an initial transcript if needed.
4. `start_capture` validates saved API/source state, starts CPAL streams through `CaptureSession`, and spawns Deepgram stream workers on the Tokio runtime.
5. CPAL callbacks convert incoming audio to mono 16 kHz PCM16 and push chunks into Tokio channels.
6. Deepgram workers emit status, interim, final, or error events over `crossbeam_channel`.
7. `spawn_event_forwarder` updates state, persists final segments, and emits `transcript-event` payloads to the frontend.
8. Frontend render helpers update status, transcript text, controls, and navigation from returned `AppViewState` or live events.

## Command Boundary Rules

- If adding a Tauri command, update all of:
  - `src/app/commands.rs`
  - `src/app/mod.rs`
  - `src/main.rs` `tauri::generate_handler!`
  - frontend caller in `frontend/src/app.ts` or another TS module
- Command names in frontend `invoke` calls must match Rust command function names exactly.
- Command handlers should return `Result<T, String>` at the IPC boundary and delegate actual logic to `AppState`.
- External URLs should be opened through Rust shell helpers or approved Tauri APIs, not ad hoc frontend navigation.

## DTO And Event Synchronization

- Keep `src/app/view.rs` and `frontend/src/types.d.ts` synchronized.
- Keep `src/app/events.rs` `UiEvent` payloads and `UiEventPayload` in `frontend/src/types.d.ts` synchronized.
- Keep DOM ids in `frontend/index.html` and refs in `frontend/src/dom.ts` synchronized.
- Rust structs crossing the frontend boundary use `#[serde(rename_all = "camelCase")]`.
- Preserve `AppSettings` serde aliases unless intentionally migrating older stored settings.

## Data, Storage, And Security

- API keys are saved only through `test_deepgram_key` after Deepgram validation.
- `FrontendSettings` intentionally excludes the API key; do not add it there casually.
- Settings are stored as JSON at the platform app data directory under `Transcript/settings.json`.
- Transcript files are stored as JSON under `Transcript/data/`.
- Logs are written to `Transcript/app.log`.
- Do not commit real API keys, local settings, transcript data, logs, `.env`, DB files, or build outputs.

## Audio And Deepgram Notes

- Speaker loopback currently works only on Windows; microphone capture uses the default CPAL host.
- Audio stream handles must own and drop CPAL streams on their owner threads.
- Keep audio callbacks lightweight; do not block in CPAL callbacks.
- `send_pcm` uses simple nearest-neighbor resampling; improve carefully if changing audio quality behavior.
- Deepgram realtime uses:
  - `wss://api.deepgram.com/v1/listen`
  - linear16, 16000 Hz, mono
  - interim results and VAD events
  - model selected by `model_for_language`
  - auth fallback via WebSocket protocol names and Authorization header
- Keepalive sends both silence PCM and a Deepgram KeepAlive JSON message while the stream is open.

## Frontend Guidelines

- Source of truth is `frontend/src/*`, `frontend/index.html`, and `frontend/styles.css`.
- Run `npm.cmd run build` to regenerate `frontend/dist`.
- Do not manually edit `frontend/dist`.
- Avoid relying on `frontend/app.js`; it is a fallback and may lag behind TypeScript source.
- Preserve the compact desktop layout. This is a utility app, not a landing page.
- Keep UI labels short and stable; ensure text fits in the small resizable window.
- Add new controls with explicit disabled/running states in `TranscriptRender.updateButtons`.

## Release Workflow Notes

- Releases are triggered by tags matching `v*`.
- Linux CI installs WebKit/GTK, ALSA, appindicator, OpenSSL, xdo, librsvg, and pkg-config dependencies.
- The workflow uploads per-platform artifacts and publishes a GitHub Release with generated notes.
- If changing bundle targets, app identifiers, icons, or Linux system dependencies, update both `tauri.conf.json` and `.github/workflows/release-desktop.yml` as needed.

## Common Change Checklist

1. Identify whether the change touches frontend, Rust state/commands, audio/Deepgram infrastructure, persistence, config, or release packaging.
2. Update all synchronized boundaries: command registration, DTOs, event payloads, DOM refs, and HTML ids.
3. Keep generated outputs generated; do not manually edit `frontend/dist` or `gen/schemas`.
4. For frontend changes, run `cd frontend; npm.cmd run build`.
5. For Rust changes, run `cargo fmt` and `cargo build`.
6. For release/config changes, review `.github/workflows/release-desktop.yml`, `tauri.conf.json`, `capabilities/default.json`, and `build.rs`.

