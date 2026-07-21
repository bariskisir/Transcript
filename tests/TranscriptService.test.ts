/**
 * Verifies recording-session lifecycle races independently from Electron and the network.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  type TranscriptDocument,
  type TranscriptResultEvent,
  type TranslationResultEvent,
} from '../src/shared/types'
import type CredentialService from '../src/main/services/CredentialService'
import type DeepgramService from '../src/main/services/DeepgramService'
import type LoggerService from '../src/main/services/LoggerService'
import type StorageService from '../src/main/services/StorageService'
import TranscriptService from '../src/main/services/TranscriptService'
import type TranslationProviderService from '../src/main/services/TranslationProviderService'

const transcript: TranscriptDocument = {
  id: '60816155-248f-4896-a010-bd6b1b0f80a0',
  title: 'New Transcript',
  isDefaultTitle: true,
  language: 'en',
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
  durationMs: 0,
  segments: [],
  translations: [],
}

/** Creates a promise and exposes its resolver for deterministic lifecycle ordering. */
const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: () => resolvePromise?.() }
}

describe('TranscriptService', () => {
  it('cancels a pending connection without publishing a delayed recording state', async () => {
    const connection = deferred()
    const states: string[] = []
    const deepgram = {
      start: vi.fn(() => connection.promise),
      stop: vi.fn(async () => undefined),
      send: vi.fn(),
    } as unknown as DeepgramService
    const storage = {
      getTranscript: vi.fn(async () => transcript),
    } as unknown as StorageService
    const credentials = {
      getApiKey: vi.fn(async () => 'test-api-key'),
    } as unknown as CredentialService
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as LoggerService
    const translator = {
      translate: vi.fn(),
    } as unknown as TranslationProviderService
    const service = new TranscriptService(
      storage,
      credentials,
      deepgram,
      translator,
      {
        onState: (event) => states.push(event.state),
        onResult: vi.fn(),
        onTranslation: vi.fn(),
        onError: vi.fn(),
      },
      logger,
    )

    const startPromise = service.start({
      settings: { ...DEFAULT_SETTINGS, speakerEnabled: false },
      transcriptId: transcript.id,
    })
    await vi.waitFor(() => expect(deepgram.start).toHaveBeenCalledOnce())
    const stopPromise = service.stop()
    connection.resolve()

    await expect(startPromise).rejects.toThrow('Recording start was cancelled.')
    await expect(stopPromise).resolves.toBeNull()
    expect(states).toContain('connecting')
    expect(states).toContain('stopping')
    expect(states).not.toContain('recording')
    expect(states.at(-1)).toBe('idle')
  })

  it('retranslates existing live text after the target changes and uses it for later sentences', async () => {
    let publishResult: ((event: TranscriptResultEvent) => void) | undefined
    const translations: TranslationResultEvent[] = []
    const deepgram = {
      start: vi.fn(async (options: { onResult: (event: TranscriptResultEvent) => void }) => {
        publishResult = options.onResult
      }),
      stop: vi.fn(async () => undefined),
      send: vi.fn(),
    } as unknown as DeepgramService
    const storage = {
      getTranscript: vi.fn(async () => transcript),
      appendSegments: vi.fn(async () => undefined),
      appendTranslation: vi.fn(async () => undefined),
      finishTranscript: vi.fn(async () => transcript),
    } as unknown as StorageService
    const credentials = {
      getApiKey: vi.fn(async () => 'test-api-key'),
    } as unknown as CredentialService
    const translator = {
      translate: vi.fn(async () => 'Merhaba dünya.'),
    } as unknown as TranslationProviderService
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as LoggerService
    const service = new TranscriptService(
      storage,
      credentials,
      deepgram,
      translator,
      {
        onState: vi.fn(),
        onResult: vi.fn(),
        onTranslation: (event) => translations.push(event),
        onError: vi.fn(),
      },
      logger,
    )

    await service.start({
      settings: {
        ...DEFAULT_SETTINGS,
        speakerEnabled: false,
      },
      transcriptId: transcript.id,
    })
    expect(deepgram.start).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: DEFAULT_SETTINGS.transcriptionProviderSettings.deepgram,
      }),
    )
    publishResult?.({
      source: 'microphone',
      text: 'Hello world.',
      isFinal: true,
      speechFinal: true,
      confidence: 0.98,
    })
    expect(translator.translate).not.toHaveBeenCalled()
    await service.translateTranscript(transcript.id, true, 'bing', 'tr')
    publishResult?.({
      source: 'microphone',
      text: 'How are you?',
      isFinal: true,
      speechFinal: true,
      confidence: 0.97,
    })
    await service.stop()

    expect(translator.translate).toHaveBeenNthCalledWith(1, 'bing', 'Hello world.', 'en', 'tr')
    expect(translator.translate).toHaveBeenNthCalledWith(2, 'bing', 'How are you?', 'en', 'tr')
    expect(storage.appendTranslation).toHaveBeenCalledTimes(2)
    expect(translations).toHaveLength(2)
    expect(translations[0]?.translation).toMatchObject({
      provider: 'bing',
      sourceText: 'Hello world.',
      text: 'Merhaba dünya.',
      targetLanguage: 'tr',
    })
  })

  it('translates a stopped transcript through its unpunctuated final text', async () => {
    const stoppedTranscript: TranscriptDocument = {
      ...transcript,
      segments: [
        {
          id: '94156f2a-6b99-42b2-8a4f-eb391893d117',
          source: 'microphone',
          text: 'Final words without punctuation',
          confidence: 0.95,
          createdAt: '2026-07-21T10:00:01.000Z',
          offsetMs: 1_000,
        },
      ],
    }
    const storage = {
      getTranscript: vi.fn(async () => stoppedTranscript),
      appendTranslation: vi.fn(async () => undefined),
    } as unknown as StorageService
    const translator = {
      translate: vi.fn(async () => 'Noktalamasız son kelimeler'),
    } as unknown as TranslationProviderService
    const service = new TranscriptService(
      storage,
      {} as CredentialService,
      {} as DeepgramService,
      translator,
      {
        onState: vi.fn(),
        onResult: vi.fn(),
        onTranslation: vi.fn(),
        onError: vi.fn(),
      },
      { warn: vi.fn() } as unknown as LoggerService,
    )

    await service.translateTranscript(stoppedTranscript.id, true, 'google', 'tr')
    await vi.waitFor(() => expect(storage.appendTranslation).toHaveBeenCalledOnce())

    expect(translator.translate).toHaveBeenCalledWith(
      'google',
      'Final words without punctuation',
      'en',
      'tr',
    )
  })
})
