/**
 * Verifies that tagged builds publish one normal executable release without updater metadata.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageConfiguration {
  scripts?: {
    'package:win'?: string
    'package:win:x64'?: string
    'package:win:arm64'?: string
  }
  build?: {
    nsis?: { differentialPackage?: boolean }
    publish?: unknown
    win?: {
      artifactName?: string
      signExecutable?: boolean
      target?: Array<{ target?: string; arch?: string[] }>
    }
  }
}

describe('release configuration', () => {
  /** Reads the package and workflow sources used by tagged Windows releases. */
  const readReleaseSources = async (): Promise<{
    configuration: PackageConfiguration
    workflow: string
  }> => {
    const [packageSource, workflow] = await Promise.all([
      readFile(resolve(process.cwd(), 'package.json'), 'utf8'),
      readFile(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8'),
    ])
    return { configuration: JSON.parse(packageSource) as PackageConfiguration, workflow }
  }

  it('publishes only the NSIS executable as a direct non-draft GitHub release', async () => {
    const { configuration, workflow } = await readReleaseSources()

    expect(configuration.build?.publish).toBeUndefined()
    expect(configuration.build?.win?.artifactName).toBe(
      `transcript-\${version}-windows-\${arch}-setup.\${ext}`,
    )
    expect(configuration.build?.win?.signExecutable).toBe(false)
    expect(configuration.build?.win?.target?.[0]?.arch).toEqual(['x64', 'arm64'])
    expect(configuration.scripts?.['package:win']).toContain('--x64 --publish never')
    expect(configuration.scripts?.['package:win']).toContain('--arm64 --publish never')
    expect(configuration.scripts?.['package:win:x64']).toContain('--x64 --publish never')
    expect(configuration.scripts?.['package:win:arm64']).toContain('--arm64 --publish never')
    expect(configuration.build?.nsis?.differentialPackage).toBe(false)
    expect(workflow).toContain('uses: softprops/action-gh-release@v2')
    expect(workflow).toContain('name: Build Windows x64 and arm64 setup')
    expect(workflow).toContain('group: release-')
    expect(workflow).toContain('cancel-in-progress: true')
    expect(workflow).toContain('name: Validate tagged version')
    expect(workflow).toContain('$packageVersion = (Get-Content package.json')
    expect(workflow).toContain('release/transcript-*-windows-x64-setup.exe')
    expect(workflow).toContain('release/transcript-*-windows-arm64-setup.exe')
    expect(workflow).toContain('draft: false')
    expect(workflow).toContain('prerelease: false')
    expect(workflow).toContain('make_latest: true')
    expect(workflow).not.toContain('--publish always')
    expect(workflow).not.toContain('latest.yml')
    expect(workflow).not.toContain('.blockmap')
  })
})
