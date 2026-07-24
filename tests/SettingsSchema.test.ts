/**
 * Verifies settings schema validation, parsing, and edge-case handling
 * for persisted settings and the Deepgram-specific super refinement rules.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS } from '../src/shared/transcription'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/shared/types'
import {
  parsePersistedSettings,
  settingsPatchSchema,
  settingsSchema,
} from '../src/main/settingsSchema'

const validSettings: AppSettings = structuredClone(DEFAULT_SETTINGS)

describe('parsePersistedSettings', () => {
  it('returns defaults for null input', () => {
    const result = parsePersistedSettings(null)
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults for undefined input', () => {
    const result = parsePersistedSettings(undefined)
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults for a non-object input', () => {
    const result = parsePersistedSettings('garbage')
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults for an array input', () => {
    const result = parsePersistedSettings([1, 2, 3])
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults for an empty object', () => {
    const result = parsePersistedSettings({})
    expect(result.settingsRevision).toBe(1)
    expect(result.transcriptionProvider).toBe('deepgram')
    expect(result.theme).toBe('system')
  })

  it('preserves valid theme and ui language from partial input', () => {
    const result = parsePersistedSettings({ theme: 'dark', uiLanguage: 'tr' })
    expect(result.theme).toBe('dark')
    expect(result.uiLanguage).toBe('tr')
  })

  it('falls back to defaults for unknown theme values', () => {
    const result = parsePersistedSettings({ theme: 'neon' })
    expect(result.theme).toBe('system')
  })

  it('falls back to defaults for unknown ui language', () => {
    const result = parsePersistedSettings({ uiLanguage: 'xx' })
    expect(result.uiLanguage).toBe('en')
  })

  it('enforces settingsRevision to 1 regardless of input', () => {
    const result = parsePersistedSettings({ settingsRevision: 5 })
    expect(result.settingsRevision).toBe(1)
  })

  it('enforces transcriptionProvider to deepgram', () => {
    const result = parsePersistedSettings({ transcriptionProvider: 'other' })
    expect(result.transcriptionProvider).toBe('deepgram')
  })

  it('preserves a valid Deepgram language from input', () => {
    const result = parsePersistedSettings({
      transcriptionProviderSettings: { deepgram: { language: 'tr', model: 'nova-3' } },
    })
    expect(result.transcriptionProviderSettings.deepgram.language).toBe('tr')
  })

  it('falls back to en for an unsupported language', () => {
    const result = parsePersistedSettings({
      transcriptionProviderSettings: { deepgram: { language: 'xx', model: 'nova-2-meeting' } },
    })
    expect(result.transcriptionProviderSettings.deepgram.language).toBe('en')
  })

  it('disables redaction for non-English languages', () => {
    const result = parsePersistedSettings({
      transcriptionProviderSettings: {
        deepgram: { language: 'tr', redaction: 'pii', model: 'nova-3' },
      },
    })
    expect(result.transcriptionProviderSettings.deepgram.redaction).toBe('none')
  })

  it('preserves translation target language when it is valid', () => {
    const result = parsePersistedSettings({ translationTargetLanguage: 'de' })
    expect(result.translationTargetLanguage).toBe('de')
  })

  it('falls back to default translation language for unsupported values', () => {
    const result = parsePersistedSettings({ translationTargetLanguage: 'xx' })
    expect(result.translationTargetLanguage).toBe(DEFAULT_SETTINGS.translationTargetLanguage)
  })

  it('enables translation when a valid target language is set without an explicit toggle', () => {
    const result = parsePersistedSettings({
      translationTargetLanguage: 'de',
      translationEnabled: undefined,
    })
    expect(result.translationEnabled).toBe(true)
  })

  it('preserves translationEnabled false even when a target language exists', () => {
    const result = parsePersistedSettings({
      translationTargetLanguage: 'de',
      translationEnabled: false,
    })
    expect(result.translationEnabled).toBe(false)
  })

  it('preserves speakerEnabled from input', () => {
    const result = parsePersistedSettings({ speakerEnabled: false })
    expect(result.speakerEnabled).toBe(false)
  })

  it('falls back to speakerDeviceId as "default" when missing', () => {
    const result = parsePersistedSettings({})
    expect(result.speakerDeviceId).toBe('default')
  })

  it('migrates legacy endpointingMs only for recognized revisions', () => {
    const result = parsePersistedSettings({
      settingsRevision: 2,
      endpointingMs: 500,
    })
    expect(result.transcriptionProviderSettings.deepgram.endpointingMs).toBe(500)
  })

  it('ignores legacy endpointingMs without a recognized revision', () => {
    const result = parsePersistedSettings({
      endpointingMs: 500,
    })
    expect(result.transcriptionProviderSettings.deepgram.endpointingMs).toBe(
      DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS.endpointingMs,
    )
  })
})

describe('settingsSchema', () => {
  it('accepts valid default settings without error', () => {
    expect(settingsSchema.safeParse(validSettings).success).toBe(true)
  })

  it('accepts valid custom settings', () => {
    const custom: AppSettings = {
      ...validSettings,
      theme: 'light',
      uiLanguage: 'de',
      timeFormat: '12-hour',
    }
    expect(settingsSchema.safeParse(custom).success).toBe(true)
  })

  it('rejects an unsupported Deepgram model', () => {
    const invalid = {
      ...validSettings,
      transcriptionProviderSettings: {
        deepgram: {
          ...DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS,
          model: 'nova-999',
        },
      },
    }
    const result = settingsSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('rejects a language not supported by a specialized model', () => {
    const invalid = {
      ...validSettings,
      transcriptionProviderSettings: {
        deepgram: {
          ...DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS,
          model: 'nova-2-meeting',
          language: 'tr',
        },
      },
    }
    const result = settingsSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('rejects redaction for non-English languages via superRefine', () => {
    const invalid = {
      ...validSettings,
      transcriptionProviderSettings: {
        deepgram: {
          ...DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS,
          model: 'nova-3',
          language: 'tr',
          redaction: 'pii',
        },
      },
    }
    const result = settingsSchema.safeParse(invalid)
    expect(result.success).toBe(false)
    if (!result.success) {
      const redactionIssue = result.error.issues.find(
        (issue) =>
          issue.path.includes('redaction') || issue.message.toLowerCase().includes('redaction'),
      )
      expect(redactionIssue).toBeDefined()
    }
  })

  it('rejects endpointingMs below the minimum', () => {
    const invalid = {
      ...validSettings,
      transcriptionProviderSettings: {
        deepgram: { ...DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS, endpointingMs: 5 },
      },
    }
    expect(settingsSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects endpointingMs above the maximum', () => {
    const invalid = {
      ...validSettings,
      transcriptionProviderSettings: {
        deepgram: { ...DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS, endpointingMs: 10_000 },
      },
    }
    expect(settingsSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects a non-integer endpointingMs', () => {
    const invalid = {
      ...validSettings,
      transcriptionProviderSettings: {
        deepgram: { ...DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS, endpointingMs: 250.5 },
      },
    }
    const result = settingsSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('strips unknown extra properties from the top level', () => {
    const withExtra = { ...validSettings, futureField: 'unexpected' }
    const result = settingsSchema.safeParse(withExtra)
    expect(result.success).toBe(true)
    // The extra property should not appear in the parsed output
    if (result.success) {
      expect((result.data as any).futureField).toBeUndefined()
    }
  })

  it('accepts English redaction for nova-3', () => {
    const withRedaction: AppSettings = {
      ...validSettings,
      transcriptionProviderSettings: {
        deepgram: {
          ...DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS,
          model: 'nova-3',
          language: 'en',
          redaction: 'pii',
        },
      },
    }
    expect(settingsSchema.safeParse(withRedaction).success).toBe(true)
  })

  it('rejects an empty language string', () => {
    const invalid = {
      ...validSettings,
      transcriptionProviderSettings: {
        deepgram: { ...DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS, language: '' },
      },
    }
    expect(settingsSchema.safeParse(invalid).success).toBe(false)
  })
})

describe('settingsPatchSchema', () => {
  it('accepts a single valid field change', () => {
    const result = settingsPatchSchema.safeParse({ theme: 'dark' })
    expect(result.success).toBe(true)
  })

  it('accepts multiple valid field changes', () => {
    const result = settingsPatchSchema.safeParse({ theme: 'light', logLevel: 'debug' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty patch', () => {
    const result = settingsPatchSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects an unknown field', () => {
    const result = settingsPatchSchema.safeParse({ unknownField: true })
    expect(result.success).toBe(false)
  })

  it('rejects settingsRevision in patch', () => {
    const result = settingsPatchSchema.safeParse({ settingsRevision: 2 })
    expect(result.success).toBe(false)
  })

  it('accepts a Deepgram settings partial patch', () => {
    const result = settingsPatchSchema.safeParse({
      transcriptionProviderSettings: { deepgram: { language: 'tr' } },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty Deepgram settings patch', () => {
    const result = settingsPatchSchema.safeParse({
      transcriptionProviderSettings: { deepgram: {} },
    })
    expect(result.success).toBe(false)
  })
})
