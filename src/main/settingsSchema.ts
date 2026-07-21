/**
 * Centralizes persisted and IPC settings validation, including migrations from earlier schemas.
 */

import {
  DEEPGRAM_DIARIZATION_MODES,
  DEEPGRAM_MODEL_IDS,
  DEEPGRAM_REDACTION_MODES,
  isDeepgramLanguageSupported,
} from '@shared/deepgram'
import {
  APP_LOCALES,
  DEFAULT_SETTINGS,
  LOG_LEVELS,
  TIME_FORMATS,
  THEME_MODES,
  type AppSettings,
} from '@shared/types'
import { z } from 'zod'

const settingsFieldsSchema = z.object({
  settingsRevision: z.literal(3),
  uiLanguage: z.enum(APP_LOCALES),
  theme: z.enum(THEME_MODES),
  timeFormat: z.enum(TIME_FORMATS),
  language: z.string().min(1).max(24),
  model: z.enum(DEEPGRAM_MODEL_IDS),
  modelVersion: z.string().trim().min(1).max(80),
  microphoneDeviceId: z.string().max(512),
  microphoneEnabled: z.boolean(),
  speakerDeviceId: z.string().max(512),
  speakerEnabled: z.boolean(),
  punctuate: z.boolean(),
  smartFormat: z.boolean(),
  numerals: z.boolean(),
  profanityFilter: z.boolean(),
  diarization: z.enum(DEEPGRAM_DIARIZATION_MODES),
  redaction: z.enum(DEEPGRAM_REDACTION_MODES),
  endpointingMs: z.number().int().min(10).max(5_000),
  utteranceEndEnabled: z.boolean(),
  utteranceEndMs: z.number().int().min(1_000).max(5_000),
  vocabulary: z.array(z.string().trim().min(1).max(120)).max(100),
  mipOptOut: z.boolean(),
  alwaysOnTop: z.boolean(),
  autoUpdate: z.boolean(),
  logLevel: z.enum(LOG_LEVELS),
})

export const settingsSchema = settingsFieldsSchema.superRefine((settings, context) => {
  if (!isDeepgramLanguageSupported(settings.model, settings.language)) {
    context.addIssue({
      code: 'custom',
      path: ['language'],
      message: 'The selected language is not supported by this Deepgram model.',
    })
  }
  if (settings.redaction !== 'none' && !settings.language.startsWith('en')) {
    context.addIssue({
      code: 'custom',
      path: ['redaction'],
      message: 'Deepgram streaming redaction is available for English audio only.',
    })
  }
})

export const settingsPatchSchema = settingsFieldsSchema
  .omit({ settingsRevision: true })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'At least one setting must be provided.')

/** Migrates a previously persisted settings object and applies new defaults safely. */
export const parsePersistedSettings = (input: unknown): AppSettings => {
  if (!input || typeof input !== 'object') return { ...DEFAULT_SETTINGS }
  const legacy = input as Record<string, unknown>
  const candidate = {
    ...DEFAULT_SETTINGS,
    ...legacy,
    settingsRevision: 3 as const,
    endpointingMs:
      (legacy.settingsRevision === 2 || legacy.settingsRevision === 3) &&
      typeof legacy.endpointingMs === 'number'
        ? legacy.endpointingMs
        : DEFAULT_SETTINGS.endpointingMs,
    speakerDeviceId:
      typeof legacy.speakerDeviceId === 'string' ? legacy.speakerDeviceId : 'default',
    speakerEnabled:
      typeof legacy.speakerEnabled === 'boolean'
        ? legacy.speakerEnabled
        : typeof legacy.systemAudioEnabled === 'boolean'
          ? legacy.systemAudioEnabled
          : DEFAULT_SETTINGS.speakerEnabled,
  }
  const model =
    DEEPGRAM_MODEL_IDS.find((supportedModel) => supportedModel === candidate.model) ??
    DEFAULT_SETTINGS.model
  const fallbackLanguage = isDeepgramLanguageSupported(model, DEFAULT_SETTINGS.language)
    ? DEFAULT_SETTINGS.language
    : 'en'
  const language = isDeepgramLanguageSupported(model, String(candidate.language))
    ? String(candidate.language)
    : fallbackLanguage
  const parsed = settingsSchema.safeParse({
    ...candidate,
    model,
    language,
    ...(language.startsWith('en') ? {} : { redaction: 'none' }),
  })
  if (parsed.success) return parsed.data

  const safeModel = DEFAULT_SETTINGS.model
  return settingsSchema.parse({
    ...DEFAULT_SETTINGS,
    uiLanguage: APP_LOCALES.includes(candidate.uiLanguage)
      ? candidate.uiLanguage
      : DEFAULT_SETTINGS.uiLanguage,
    theme: THEME_MODES.includes(candidate.theme) ? candidate.theme : DEFAULT_SETTINGS.theme,
    model: safeModel,
    language: isDeepgramLanguageSupported(safeModel, String(candidate.language))
      ? candidate.language
      : DEFAULT_SETTINGS.language,
  })
}
