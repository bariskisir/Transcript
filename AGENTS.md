# Agent Instructions

## Project Overview

Transcript is a .NET 10 C# desktop application for live speech transcription. The application uses .NET MAUI as the desktop shell and hosts a compact local HTML/CSS/JavaScript UI inside a MAUI WebView. The C# backend captures speaker and microphone audio, converts it to 16 kHz mono PCM16, streams each enabled source to Deepgram on its own WebSocket, persists settings/transcripts as JSON files, and pushes live transcript events back to the web UI.

## Repository Layout

- `.github/workflows/release-desktop.yml`: tagged-release workflow. Builds and tests the .NET solution on Windows, restores MAUI workloads, publishes a self-contained Windows x64 desktop build, zips it, and publishes a GitHub Release asset.
- `.gitignore`: ignores .NET/MAUI build output, Node artifacts, IDE files, logs, and local runtime data.
- `README.md`: user-facing overview and development commands.
- `CHANGELOG.md`: migration and release notes.
- `LICENSE`: MIT license copied from the original project.
- `images/`: original screenshots and icon assets copied from the Rust project.
- `src/Transcript.slnx`: solution file. The solution intentionally lives under `src/`.
- `src/Transcript.Domain`: domain entities, value objects, constants, transcript model, language catalog, and export format enum.
- `src/Transcript.Application`: use cases, DTOs, service interfaces, and workspace orchestration.
- `src/Transcript.Infrastructure`: Deepgram, JSON persistence, AppData paths, Serilog logging, export rendering, audio device discovery, and live audio capture.
- `src/Transcript.Presentation`: MAUI shell, WebView bridge, platform bootstraps, and local web UI assets.
- `src/Transcript.Tests`: xUnit tests for domain behavior, persistence, exports, and Deepgram JSON parsing.

## Build And Verification

Run commands from the repository root unless noted.

- Restore MAUI workloads: `dotnet workload restore src/Transcript.Presentation/Transcript.Presentation.csproj`
- Restore solution: `dotnet restore src/Transcript.slnx`
- Build solution: `dotnet build src/Transcript.slnx`
- Run tests: `dotnet test src/Transcript.Tests/Transcript.Tests.csproj`
- Run Windows app:

```powershell
cd src\Transcript.Presentation
dotnet run -f net10.0-windows10.0.19041.0
```

## Runtime Architecture

1. `Platforms/Windows/App.xaml.cs` or `Platforms/MacCatalyst/*` starts the MAUI application.
2. `MauiProgram.cs` registers logging, infrastructure services, and `MainPage`.
3. `App.xaml.cs` loads application resources first, then resolves `MainPage` inside `CreateWindow`. Do not inject `MainPage` directly into the `App` constructor; that creates pages before resource dictionaries are loaded.
4. `MainPage.xaml` hosts one WebView. Native XAML controls are not the UI surface.
5. `MainPage.xaml.cs` loads `Resources/Raw/wwwroot/index.html`, inlines CSS/JS, intercepts `transcript://...` navigation, dispatches commands to `ITranscriptWorkspaceService`, and pushes events back to JavaScript.
6. The web UI in `Resources/Raw/wwwroot` renders controls, sends commands through `window.transcriptBridge.invoke`, and receives live events through `window.transcriptApp.receiveEvent`.
7. `TranscriptWorkspaceService` loads settings/transcripts, resolves default devices, starts/stops capture, persists final segments, and emits state/interim events.
8. `PlatformLiveAudioCaptureService` captures selected Windows speaker/microphone audio and emits 16 kHz mono PCM16 frames.
9. `DeepgramTranscriptionService` opens one Deepgram WebSocket per active source, matching the original Rust app behavior. Do not merge speaker and microphone into a single WebSocket.

## UI Boundary Rules

- The UI source of truth is:
  - `src/Transcript.Presentation/Resources/Raw/wwwroot/index.html`
  - `src/Transcript.Presentation/Resources/Raw/wwwroot/styles.css`
  - `src/Transcript.Presentation/Resources/Raw/wwwroot/app.js`
- Keep DOM ids in `index.html` synchronized with the `bindRefs` list in `app.js`.
- WebView bridge command names are lowercased by URL host parsing. C# command routing in `MainPage.xaml.cs` must match lowercase command names.
- Do not replace the HTML/CSS/JS UI with native MAUI controls unless explicitly requested.
- Preserve the compact desktop utility layout.
- The transcript body should use the full available body space; avoid decorative borders or metadata headers that reduce transcript space.

## Command Boundary Rules

- JavaScript calls C# through `transcript://{command}?id=...&payload=...`.
- `MainPage.xaml.cs` is the only presentation bridge. Keep command parsing small and delegate behavior to `ITranscriptWorkspaceService`.
- If adding a UI command, update all of:
  - DOM control in `index.html`
  - refs/event binding in `app.js`
  - command case in `MainPage.xaml.cs`
  - application service method/interface if behavior crosses into use cases
- External URLs should be opened through `Launcher.Default.OpenAsync` in the C# bridge.

## Data, Storage, And Security

- Settings are stored at the platform AppData-equivalent path under `Transcript/settings.json`.
- Transcripts are stored as JSON under `Transcript/transcripts/`.
- Logs are rolling Serilog files under `Transcript/logs/`.
- API keys are saved only after Deepgram validation through `TestAndSaveApiKeyAsync`.
- Do not commit real API keys, runtime settings, transcript data, logs, `.env` files, or build outputs.

## Audio And Deepgram Notes

- Windows speaker loopback uses NAudio WASAPI loopback.
- Windows microphone capture uses NAudio input capture.
- macOS/Mac Catalyst live capture is scaffolded but not fully implemented; unsupported devices should be clearly marked.
- Captured audio must be converted to mono 16 kHz PCM16 before sending to Deepgram.
- Speaker and microphone must each get a separate Deepgram WebSocket. A single mixed WebSocket produces unreliable source attribution and poor transcript results.
- Deepgram realtime uses:
  - `wss://api.deepgram.com/v1/listen`
  - linear16, 16000 Hz, mono
  - interim results
  - VAD events
  - punctuation and smart formatting
  - model selected by `LanguageCatalog.GetModel`
- Treat remote close handshake errors during stop as normal shutdown, not as user-facing transcription failures.

## Testing Notes

- Parser changes should add or update tests in `src/Transcript.Tests/Infrastructure/DeepgramMessageParserTests.cs`.
- Persistence changes should update tests around `JsonSettingsService` or `JsonTranscriptRepository`.
- Domain behavior changes should update tests under `src/Transcript.Tests/Domain`.
- Before finishing code changes, run:

```powershell
dotnet build src\Transcript.slnx
dotnet test src\Transcript.Tests\Transcript.Tests.csproj
```

## Release Workflow Notes

- Releases are triggered by tags matching `v*`.
- The workflow builds on `windows-latest`, restores .NET 10 and MAUI workloads, runs tests, publishes the Windows x64 app, zips the publish directory, uploads the artifact, and publishes a GitHub Release.
- If changing target frameworks, package type, app icons, or publish settings, update `.github/workflows/release-desktop.yml` and `src/Transcript.Presentation/Transcript.Presentation.csproj` together.

## Common Change Checklist

1. Identify whether the change touches UI, bridge commands, application workflow, audio/Deepgram infrastructure, persistence, project config, or release packaging.
2. Keep synchronized boundaries aligned: DOM refs, JS command names, bridge routing, DTOs, and workspace service methods.
3. Keep speaker/mic Deepgram streams separate.
4. Run build and tests.
5. For release-related changes, inspect the workflow and project publish settings.
