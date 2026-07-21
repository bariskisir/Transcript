/**
 * Verifies persisted application settings defaults and schema migrations.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import { parsePersistedSettings, settingsPatchSchema } from '../src/main/settingsSchema'

describe('settings schema migrations', () => {
  it('migrates version 2 settings to the default 24-hour clock', () => {
    const legacySettings: Record<string, unknown> = {
      ...DEFAULT_SETTINGS,
      settingsRevision: 2,
    }
    delete legacySettings.timeFormat

    const settings = parsePersistedSettings(legacySettings)

    expect(settings.settingsRevision).toBe(3)
    expect(settings.timeFormat).toBe('24-hour')
  })

  it('accepts bounded settings patches and rejects unrelated configuration keys', () => {
    expect(settingsPatchSchema.parse({ theme: 'dark', endpointingMs: 250 })).toEqual({
      theme: 'dark',
      endpointingMs: 250,
    })
    expect(() => settingsPatchSchema.parse({})).toThrow('At least one setting must be provided.')
    expect(() => settingsPatchSchema.parse({ theme: 'dark', unrelated: true })).toThrow()
    expect(() => settingsPatchSchema.parse({ settingsRevision: 3 })).toThrow()
  })
})
