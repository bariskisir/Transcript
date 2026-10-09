# Repository Guidelines

## Project Structure & Module Organization

Transcript is an Electron desktop application built with TypeScript, Vite, React, and Sass. Electron's main-process code and platform services live in `src/main/`; preload bridges are in `src/preload/`. The renderer UI is in `src/renderer/src/`, organized by `components/`, `pages/`, `hooks/`, `context/`, `store/`, and `services/`. Put cross-process types, IPC definitions, and provider contracts in `src/shared/`. Tests are standalone Vitest files in `tests/`, named after the unit under test (for example, `WindowService.test.ts`). Application icons belong in `build/`; README screenshots belong in `images/`.

Use the configured aliases instead of long relative paths: `@main`, `@shared`, and `@renderer`.

## Build, Test, and Development Commands

- `npm run dev` starts the Vite/Electron development environment.
- `npm run typecheck` checks both main/preload and renderer TypeScript projects.
- `npm test` runs the Vitest suite once; `npm run test:watch` keeps it running.
- `npm run lint` runs Biome against source, tests, and Vite configuration.
- `npm run format:check` verifies Prettier formatting; `npm run format` rewrites files.
- `npm run build` type-checks and produces the production build. Use `npm run package:win` or `npm run package:linux` for installers.

## Coding Style & Naming Conventions

Use two-space indentation, LF endings, UTF-8, and a final newline. Prettier uses no semicolons, single quotes, trailing commas, and a 100-character print width. Name React components and classes in PascalCase (`TranscriptView.tsx`, `StorageService.ts`); use camelCase for functions, hooks, and variables (`useRecordingActions`). Keep component-specific styles beside the component as `Name.module.scss`. Run formatting and linting before committing.

## Testing Guidelines

Write Vitest tests in `tests/` with the `*.test.ts` suffix. The suite runs in a Node environment, so test main-process services, parsers, schemas, IPC contracts, and renderer logic without relying on a running Electron window. Add focused regression coverage with every bug fix and run `npm test` plus `npm run typecheck` before opening a pull request. No repository-wide coverage threshold is configured.

## Commit & Pull Request Guidelines

Recent history favors concise imperative commits, often Conventional Commit-style: `feat: add tray settings`, `fix(providers): ...`, and `chore(deps-dev): ...`. Use `feat`, `fix`, or `chore` where appropriate; keep each commit scoped to one change. Pull requests should explain the user-visible behavior and implementation rationale, link related issues, list validation commands, and include screenshots for renderer/UI changes. Do not commit API keys, credentials, or generated release artifacts.
