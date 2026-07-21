/**
 * Verifies GitHub release parsing, version selection, and streamed installer integrity checks.
 */

import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import GitHubReleaseClient, {
  isNewerVersion,
  selectWindowsInstaller,
  type GitHubRelease,
} from '@main/services/GitHubReleaseClient'
import { afterEach, describe, expect, it, vi } from 'vitest'

const temporaryDirectories: string[] = []

/** Creates a release object using the production asset naming convention. */
const createRelease = (version = '3.1.0'): GitHubRelease => ({
  version,
  name: `Transcript v${version}`,
  releaseNotes: 'Release notes',
  pageUrl: `https://github.com/bariskisir/Transcript/releases/tag/v${version}`,
  assets: [
    {
      name: `transcript-${version}-windows-x64-setup.exe`,
      downloadUrl: `https://github.com/bariskisir/Transcript/releases/download/v${version}/transcript-${version}-windows-x64-setup.exe`,
      size: 4,
    },
  ],
})

/** Returns the single fixture asset while failing clearly if the fixture becomes invalid. */
const getFixtureAsset = (): GitHubRelease['assets'][number] => {
  const asset = createRelease().assets[0]
  if (!asset) throw new Error('Release fixture must contain one installer asset.')
  return asset
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('GitHubReleaseClient', () => {
  it('parses the latest stable GitHub release without updater metadata files', async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            tag_name: 'v3.1.0',
            name: 'Transcript v3.1.0',
            body: 'Release notes',
            html_url: 'https://github.com/bariskisir/Transcript/releases/tag/v3.1.0',
            draft: false,
            prerelease: false,
            assets: [
              {
                name: 'transcript-3.1.0-windows-x64-setup.exe',
                browser_download_url:
                  'https://github.com/bariskisir/Transcript/releases/download/v3.1.0/transcript-3.1.0-windows-x64-setup.exe',
                size: 4,
                digest: null,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const client = new GitHubReleaseClient(fetcher)

    await expect(client.getLatestRelease()).resolves.toEqual(createRelease())
    await expect(client.getLatestRelease()).resolves.toEqual(createRelease())
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('selects the exact architecture-specific setup executable', () => {
    expect(selectWindowsInstaller(createRelease(), 'x64').name).toBe(
      'transcript-3.1.0-windows-x64-setup.exe',
    )
    expect(() => selectWindowsInstaller(createRelease(), 'arm64')).toThrow(
      'does not contain transcript-3.1.0-windows-arm64-setup.exe',
    )
  })

  it('compares stable semantic release versions numerically', () => {
    expect(isNewerVersion('3.0.1', '3.0.0')).toBe(true)
    expect(isNewerVersion('3.10.0', '3.9.9')).toBe(true)
    expect(isNewerVersion('3.0.0', '3.0.0')).toBe(false)
    expect(isNewerVersion('2.9.9', '3.0.0')).toBe(false)
  })

  it('streams and verifies a setup executable using the GitHub asset digest', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const digest = createHash('sha256').update(bytes).digest('hex')
    const fetcher: typeof globalThis.fetch = async () => new Response(bytes, { status: 200 })
    const directory = await mkdtemp(join(tmpdir(), 'transcript-release-test-'))
    temporaryDirectories.push(directory)
    const progress = vi.fn()
    const asset = { ...getFixtureAsset(), digest: `sha256:${digest}` }

    const downloaded = await new GitHubReleaseClient(fetcher).downloadInstaller(
      asset,
      directory,
      progress,
    )

    await expect(readFile(downloaded.filePath)).resolves.toEqual(Buffer.from(bytes))
    expect(downloaded.sha256).toBe(digest)
    expect(progress).toHaveBeenLastCalledWith(100)
  })

  it('deletes a downloaded executable when checksum verification fails', async () => {
    const fetcher: typeof globalThis.fetch = async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })
    const directory = await mkdtemp(join(tmpdir(), 'transcript-release-test-'))
    temporaryDirectories.push(directory)
    const asset = { ...getFixtureAsset(), digest: `sha256:${'0'.repeat(64)}` }

    await expect(
      new GitHubReleaseClient(fetcher).downloadInstaller(asset, directory, () => undefined),
    ).rejects.toThrow('checksum verification failed')
    await expect(readFile(join(directory, asset.name))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a lookalike host before attempting an installer download', async () => {
    const fetcher: typeof globalThis.fetch = async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })
    const asset = {
      ...getFixtureAsset(),
      downloadUrl:
        'https://github.com.evil/bariskisir/Transcript/releases/download/v3.1.0/transcript-3.1.0-windows-x64-setup.exe',
    }

    await expect(
      new GitHubReleaseClient(fetcher).downloadInstaller(asset, 'unused', () => undefined),
    ).rejects.toThrow('untrusted update download URL')
  })
})
