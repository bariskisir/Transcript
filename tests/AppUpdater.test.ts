/**
 * Verifies development update discovery without downloading or launching release installers.
 */

import AppUpdater, {
  type UpdateLogger,
  type UpdateRuntime,
  WINDOWS_INSTALLER_ARGUMENTS,
} from '@main/services/AppUpdater'
import GitHubReleaseClient from '@main/services/GitHubReleaseClient'
import type { UpdateStateEvent } from '@shared/types'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: (): string => '0.0.0',
    getPath: (): string => '',
    quit: (): void => undefined,
  },
}))

/** Creates a successful latest-release response using GitHub's canonical repository casing. */
const createReleaseResponse = (): Response =>
  new Response(
    JSON.stringify({
      tag_name: 'v3.0.1',
      name: 'Transcript v3.0.1',
      body: 'Release notes',
      html_url: 'https://github.com/bariskisir/Transcript/releases/tag/v3.0.1',
      draft: false,
      prerelease: false,
      assets: [
        {
          name: 'transcript-3.0.1-windows-x64-setup.exe',
          browser_download_url:
            'https://github.com/bariskisir/Transcript/releases/download/v3.0.1/transcript-3.0.1-windows-x64-setup.exe',
          size: 4,
          digest: null,
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )

describe('AppUpdater', () => {
  it('runs the assisted NSIS installer silently and forces the updated app to reopen', () => {
    expect(WINDOWS_INSTALLER_ARGUMENTS).toEqual(['/S', '--updated', '--force-run'])
  })

  it('reports a newer GitHub release during development without downloading it', async () => {
    const fetcher = vi.fn(async () => createReleaseResponse())
    const launchInstaller = vi.fn(async () => undefined)
    const runtime: UpdateRuntime = {
      isPackaged: false,
      version: '3.0.0',
      architecture: 'x64',
      temporaryDirectory: 'unused',
      quit: vi.fn(),
      launchInstaller,
    }
    const logger: UpdateLogger = { error: vi.fn(), info: vi.fn() }
    const events: UpdateStateEvent[] = []
    const updater = new AppUpdater(logger, new GitHubReleaseClient(fetcher), runtime)
    updater.initialize((event) => events.push(event))

    await updater.checkForUpdates()

    expect(events).toEqual([
      { state: 'checking' },
      { state: 'available', version: '3.0.1', releaseNotes: 'Release notes' },
    ])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(launchInstaller).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})
