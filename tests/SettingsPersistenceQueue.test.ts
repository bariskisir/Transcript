/**
 * Verifies that rapid settings controls cannot overwrite an earlier in-flight update.
 */

import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings, type AppSettingsPatch } from '../src/shared/types'
import { settingsSchema } from '../src/main/settingsSchema'
import SettingsPersistenceQueue from '../src/renderer/src/services/SettingsPersistenceQueue'

describe('SettingsPersistenceQueue', () => {
  it('merges concurrent patches onto the latest successfully persisted settings', async () => {
    const queue = new SettingsPersistenceQueue()
    const persisted: AppSettings[] = []
    let durableSettings = DEFAULT_SETTINGS
    const persist = vi.fn(async (patch: AppSettingsPatch) => {
      durableSettings = settingsSchema.parse({ ...durableSettings, ...patch })
      persisted.push(durableSettings)
      return durableSettings
    })

    const themeWrite = queue.enqueue({ theme: 'light' }, persist)
    const loggingWrite = queue.enqueue({ logLevel: 'debug' }, persist)
    await Promise.all([themeWrite, loggingWrite])

    expect(persisted).toHaveLength(2)
    expect(persisted[1]).toMatchObject({ theme: 'light', logLevel: 'debug' })
  })

  it('recovers from a failed write using the caller fallback state', async () => {
    const queue = new SettingsPersistenceQueue()
    const failingPersist = vi.fn(async (): Promise<AppSettings> => {
      throw new Error('disk unavailable')
    })

    await expect(queue.enqueue({ theme: 'light' }, failingPersist)).rejects.toThrow(
      'disk unavailable',
    )
    await expect(
      queue.enqueue({ logLevel: 'debug' }, async (patch) =>
        settingsSchema.parse({ ...DEFAULT_SETTINGS, ...patch }),
      ),
    ).resolves.toMatchObject({ theme: DEFAULT_SETTINGS.theme, logLevel: 'debug' })
  })
})
