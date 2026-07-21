/**
 * Verifies static model compatibility and the validated Deepgram streaming query contract.
 */

import { describe, expect, it } from 'vitest'
import { getDeepgramModel, isDeepgramLanguageSupported } from '../src/shared/deepgram'
import { DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS } from '../src/shared/transcription'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import { buildDeepgramEndpoint } from '../src/main/services/DeepgramEndpoint'
import { parsePersistedSettings } from '../src/main/settingsSchema'

describe('Deepgram model catalog', () => {
  it('contains supported single languages without exposing multilingual mode', () => {
    expect(getDeepgramModel('nova-3').languages).toContain('tr')
    expect(getDeepgramModel('nova-3').languages).not.toContain('multi')
    expect(isDeepgramLanguageSupported('nova-3-medical', 'tr')).toBe(false)
  })

  it('migrates legacy speaker settings and rejects a persisted multilingual selection', () => {
    const settings = parsePersistedSettings({
      ...DEFAULT_SETTINGS,
      settingsRevision: 4,
      transcriptionProvider: undefined,
      transcriptionProviderSettings: undefined,
      language: 'multi',
      systemAudioEnabled: false,
      speakerEnabled: undefined,
    })

    expect(settings.transcriptionProvider).toBe('deepgram')
    expect(settings.transcriptionProviderSettings.deepgram.language).toBe('en')
    expect(settings.speakerEnabled).toBe(false)
    expect(settings.transcriptionProviderSettings.deepgram.endpointingMs).toBe(10)
  })
})

describe('buildDeepgramEndpoint', () => {
  it('encodes Nova-3 keyterms and advanced live options', () => {
    const endpoint = new URL(
      buildDeepgramEndpoint({
        ...DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS,
        language: 'tr',
        vocabulary: ['Transcript', 'Barış'],
        diarization: 'latest',
        redaction: 'none',
      }),
    )

    expect(endpoint.origin).toBe('wss://api.deepgram.com')
    expect(endpoint.pathname).toBe('/v1/listen')
    expect(endpoint.searchParams.get('language')).toBe('tr')
    expect(endpoint.searchParams.get('diarize_model')).toBe('latest')
    expect(endpoint.searchParams.get('endpointing')).toBe('10')
    expect(endpoint.searchParams.getAll('keyterm')).toEqual(['Transcript', 'Barış'])
    expect(endpoint.searchParams.has('keywords')).toBe(false)
  })

  it('uses keywords for Nova-2 and omits disabled optional parameters', () => {
    const endpoint = new URL(
      buildDeepgramEndpoint({
        ...DEFAULT_DEEPGRAM_TRANSCRIPTION_SETTINGS,
        model: 'nova-2',
        language: 'de',
        vocabulary: ['Electron'],
        utteranceEndEnabled: false,
      }),
    )

    expect(endpoint.searchParams.getAll('keywords')).toEqual(['Electron'])
    expect(endpoint.searchParams.has('keyterm')).toBe(false)
    expect(endpoint.searchParams.has('utterance_end_ms')).toBe(false)
    expect(endpoint.searchParams.has('redact')).toBe(false)
  })
})
