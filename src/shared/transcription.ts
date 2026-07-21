/**
 * Defines independently typed transcription providers and their provider-specific settings.
 */

import type { DeepgramDiarization, DeepgramModel, DeepgramRedaction } from './deepgram'

export const TRANSCRIPTION_PROVIDERS = ['deepgram'] as const

export type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number]

export interface DeepgramTranscriptionSettings {
  language: string
  model: DeepgramModel
  modelVersion: string
  punctuate: boolean
  smartFormat: boolean
  numerals: boolean
  profanityFilter: boolean
  diarization: DeepgramDiarization
  redaction: DeepgramRedaction
  endpointingMs: number
  utteranceEndEnabled: boolean
  utteranceEndMs: number
  vocabulary: string[]
  mipOptOut: boolean
}

export interface TranscriptionProviderSettings {
  deepgram: DeepgramTranscriptionSettings
}

export type DeepgramTranscriptionSettingsPatch = {
  [Key in keyof DeepgramTranscriptionSettings]?: DeepgramTranscriptionSettings[Key] | undefined
}

export type TranscriptionProviderSettingsPatch = {
  deepgram?: DeepgramTranscriptionSettingsPatch | undefined
}

export const DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS: DeepgramTranscriptionSettings = {
  language: 'en',
  model: 'nova-3',
  modelVersion: 'latest',
  punctuate: true,
  smartFormat: true,
  numerals: true,
  profanityFilter: false,
  diarization: 'off',
  redaction: 'none',
  endpointingMs: 10,
  utteranceEndEnabled: true,
  utteranceEndMs: 1_000,
  vocabulary: [],
  mipOptOut: false,
}
