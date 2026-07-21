/**
 * Verifies that legacy migration keeps only durable Transcript data and removes runtime clutter.
 */

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import LegacyDataMigrationService from '../src/main/services/LegacyDataMigrationService'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('LegacyDataMigrationService', () => {
  it('migrates allow-listed files without carrying Chromium runtime data forward', async () => {
    const appDataRoot = await mkdtemp(join(tmpdir(), 'transcript-migration-'))
    temporaryRoots.push(appDataRoot)
    const applicationDataRoot = join(appDataRoot, 'Transcript')
    const dataRoot = join(applicationDataRoot, 'Data')
    const logsRoot = join(applicationDataRoot, 'Logs')
    const legacyRoot = join(appDataRoot, ['transcript', 'desktop'].join('-'))
    const legacyDataRoot = join(legacyRoot, 'Transcript')
    await mkdir(join(legacyDataRoot, 'transcripts'), { recursive: true })
    await mkdir(join(legacyRoot, 'logs'), { recursive: true })
    await mkdir(join(legacyRoot, 'Cache'), { recursive: true })
    await mkdir(dataRoot, { recursive: true })
    await writeFile(join(dataRoot, 'settings.json'), 'new-settings', 'utf8')
    await writeFile(join(legacyDataRoot, 'settings.json'), 'old-settings', 'utf8')
    await writeFile(join(legacyDataRoot, 'credentials.bin'), 'credential', 'utf8')
    await writeFile(join(legacyDataRoot, 'transcripts', 'one.json'), 'transcript', 'utf8')
    await writeFile(join(legacyRoot, 'logs', 'app.log'), 'log', 'utf8')
    await writeFile(join(legacyRoot, 'Cache', 'cache.bin'), 'runtime', 'utf8')

    await new LegacyDataMigrationService({
      applicationDataRoot,
      dataRoot,
      logsRoot,
      legacyRoot,
    }).migrate()

    expect(await readFile(join(dataRoot, 'settings.json'), 'utf8')).toBe('new-settings')
    expect(await readFile(join(dataRoot, 'credentials.bin'), 'utf8')).toBe('credential')
    expect(await readFile(join(dataRoot, 'transcripts', 'one.json'), 'utf8')).toBe('transcript')
    expect(await readFile(join(logsRoot, 'app.log'), 'utf8')).toBe('log')
    await expect(access(legacyRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(applicationDataRoot, 'Cache'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
