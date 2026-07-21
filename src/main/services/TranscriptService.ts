/**
 * Coordinates credentials, storage, and source-separated streaming for each recording session.
 */

import { randomUUID } from 'node:crypto'
import type {
  AppErrorEvent,
  AudioSource,
  SessionStateEvent,
  StartSessionRequest,
  StartSessionResult,
  TranscriptDocument,
  TranscriptResultEvent,
  TranscriptSegment,
  TranslationResultEvent,
  TranslationSegment,
} from '@shared/types'
import type { TranslationProvider, TranslationTargetLanguage } from '@shared/translation'
import type CredentialService from './CredentialService'
import type DeepgramService from './DeepgramService'
import type LoggerService from './LoggerService'
import type StorageService from './StorageService'
import type TranslationProviderService from './TranslationProviderService'
import {
  findCompletedTranscriptSentences,
  type CompletedTranscriptSentence,
} from './TranscriptSentenceMatcher'

interface TranscriptEvents {
  onState: (event: SessionStateEvent) => void
  onResult: (event: TranscriptResultEvent) => void
  onTranslation: (event: TranslationResultEvent) => void
  onError: (event: AppErrorEvent) => void
}

const PERSISTENCE_BATCH_MS = 250

class SessionStartCancelledError extends Error {
  /** Creates an internal cancellation marker that is safe to serialize across IPC. */
  public constructor() {
    super('Recording start was cancelled.')
    this.name = 'SessionStartCancelledError'
  }
}

export default class TranscriptService {
  private currentTranscriptId: string | null = null
  private startingTranscriptId: string | null = null
  private baseDurationMs = 0
  private startedAt = 0
  private persistenceQueue = Promise.resolve()
  private startPromise: Promise<StartSessionResult> | null = null
  private startCancelled = false
  private stopPromise: Promise<TranscriptDocument | null> | null = null
  private pendingSegments: TranscriptSegment[] = []
  private persistenceTimer: NodeJS.Timeout | null = null
  private sessionSegments: TranscriptSegment[] = []
  private sessionLanguage = ''
  private translationProvider: TranslationProvider = 'google'
  private translationTarget: TranslationTargetLanguage = 'none'
  private readonly translationCoverage = new Map<string, number>()
  private readonly queuedTranslationKeys = new Set<string>()
  private readonly translationQueues = new Map<string, Promise<void>>()

  /** Creates a session coordinator with explicit service dependencies. */
  public constructor(
    private readonly storage: StorageService,
    private readonly credentials: CredentialService,
    private readonly deepgram: DeepgramService,
    private readonly translator: TranslationProviderService,
    private readonly events: TranscriptEvents,
    private readonly logger: LoggerService,
  ) {}

  /** Starts a transcript and one remote stream for every enabled source. */
  public async start(request: StartSessionRequest): Promise<StartSessionResult> {
    if (this.stopPromise) await this.stopPromise
    if (this.startPromise || this.currentTranscriptId) {
      throw new Error('A recording session is already active.')
    }
    this.startCancelled = false
    const startPromise = this.startInternal(request)
    this.startPromise = startPromise
    try {
      return await startPromise
    } finally {
      if (this.startPromise === startPromise) this.startPromise = null
    }
  }

  /** Performs the cancellable connection sequence for one recording request. */
  private async startInternal(request: StartSessionRequest): Promise<StartSessionResult> {
    try {
      const sources = this.resolveSources(request)
      const providerSettings = request.settings.transcriptionProviderSettings.deepgram
      const apiKey = await this.credentials.getApiKey()
      this.throwIfStartCancelled()
      if (!apiKey) throw new Error('Save a valid Deepgram API key before recording.')
      const transcript = request.transcriptId
        ? await this.storage.getTranscript(request.transcriptId)
        : await this.storage.createTranscript(providerSettings.language, request.title)
      this.startingTranscriptId = transcript.id
      this.throwIfStartCancelled()
      this.events.onState({ state: 'connecting', transcriptId: transcript.id })
      await this.deepgram.start({
        sources,
        apiKey,
        settings: providerSettings,
        onResult: (event) => this.handleResult(event),
        onError: (source, message) => {
          this.logger.error('TranscriptService', 'A Deepgram source reported an error.', {
            source,
            message,
          })
          this.events.onError({ source, message, recoverable: true })
        },
      })
      this.throwIfStartCancelled()
      this.currentTranscriptId = transcript.id
      this.startingTranscriptId = null
      this.baseDurationMs = transcript.durationMs
      this.startedAt = Date.now()
      this.persistenceQueue = Promise.resolve()
      this.pendingSegments = []
      this.clearPersistenceTimer()
      this.sessionSegments = [...transcript.segments]
      this.sessionLanguage = providerSettings.language
      this.translationProvider = request.settings.translationProvider
      this.translationTarget = request.settings.translationTargetLanguage
      this.initializeTranslationCoverage(transcript)
      this.events.onState({
        state: 'recording',
        transcriptId: transcript.id,
        startedAt: new Date(this.startedAt).toISOString(),
      })
      this.logger.info('TranscriptService', 'Recording session started.', {
        transcriptId: transcript.id,
        sources,
        transcriptionProvider: request.settings.transcriptionProvider,
        model: providerSettings.model,
        language: providerSettings.language,
        translationProvider: request.settings.translationProvider,
        translationTarget: request.settings.translationTargetLanguage,
      })
      this.schedulePendingTranslations(transcript.id, true)
      return { transcript, activeSources: sources }
    } catch (error) {
      await this.deepgram.stop()
      const cancelled = error instanceof SessionStartCancelledError || this.startCancelled
      this.resetSessionState()
      this.events.onState({ state: 'idle' })
      if (cancelled) {
        this.logger.info('TranscriptService', 'Recording session start was cancelled.')
      } else {
        this.logger.error('TranscriptService', 'Recording session failed to start.', error)
      }
      throw error
    }
  }

  /** Sends a source-specific PCM frame to Deepgram. */
  public sendAudio(source: AudioSource, samples: Uint8Array): void {
    if (this.currentTranscriptId) this.deepgram.send(source, samples)
  }

  /** Changes the target language and translates the selected transcript from its beginning. */
  public async translateTranscript(
    transcriptId: string,
    provider: TranslationProvider,
    targetLanguage: TranslationTargetLanguage,
  ): Promise<void> {
    if (this.currentTranscriptId === transcriptId) {
      this.translationProvider = provider
      this.translationTarget = targetLanguage
      if (targetLanguage !== 'none') this.schedulePendingTranslations(transcriptId, true)
      return
    }
    if (targetLanguage === 'none') return

    const transcript = await this.storage.getTranscript(transcriptId)
    this.initializeTranslationCoverage(transcript)
    this.scheduleTranslations(
      transcript.id,
      transcript.segments,
      transcript.language,
      provider,
      targetLanguage,
      true,
    )
  }

  /** Flushes streams, persists duration, and returns the completed transcript. */
  public async stop(): Promise<TranscriptDocument | null> {
    if (this.stopPromise) return this.stopPromise
    const transcriptId = this.currentTranscriptId
    if (!transcriptId && this.startPromise) {
      this.startCancelled = true
      this.events.onState({
        state: 'stopping',
        ...(this.startingTranscriptId ? { transcriptId: this.startingTranscriptId } : {}),
      })
      await this.deepgram.stop()
      await this.startPromise.catch(() => undefined)
      return null
    }
    if (!transcriptId) return null
    const stoppedAt = Date.now()
    this.events.onState({ state: 'stopping', transcriptId })
    this.stopPromise = this.finishStop(transcriptId, stoppedAt).finally(() => {
      this.stopPromise = null
    })
    return this.stopPromise
  }

  /** Completes the remote flush and persistence after the capture stop time is fixed. */
  private async finishStop(transcriptId: string, stoppedAt: number): Promise<TranscriptDocument> {
    try {
      await this.deepgram.stop()
      this.flushPendingSegments(transcriptId)
      this.schedulePendingTranslations(transcriptId, true)
      await Promise.all([this.persistenceQueue, ...this.translationQueues.values()])
      const transcript = await this.storage.finishTranscript(
        transcriptId,
        this.baseDurationMs + Math.max(0, stoppedAt - this.startedAt),
      )
      this.logger.info('TranscriptService', 'Recording session stopped.', {
        transcriptId,
        durationMs: transcript.durationMs,
      })
      return transcript
    } finally {
      this.resetSessionState()
      this.events.onState({ state: 'idle' })
    }
  }

  /** Interrupts a pending start before it can publish a recording state. */
  private throwIfStartCancelled(): void {
    if (this.startCancelled) throw new SessionStartCancelledError()
  }

  /** Clears all active and pending session fields after stop or failed start. */
  private resetSessionState(): void {
    this.currentTranscriptId = null
    this.startingTranscriptId = null
    this.baseDurationMs = 0
    this.startedAt = 0
    this.pendingSegments = []
    this.sessionSegments = []
    this.sessionLanguage = ''
    this.translationProvider = 'google'
    this.translationTarget = 'none'
    this.clearPersistenceTimer()
  }

  /** Resolves enabled audio sources and rejects an empty selection. */
  private resolveSources(request: StartSessionRequest): AudioSource[] {
    const sources: AudioSource[] = []
    if (request.settings.microphoneEnabled) sources.push('microphone')
    if (request.settings.speakerEnabled) sources.push('speaker')
    if (sources.length === 0) throw new Error('Enable at least one audio source.')
    return sources
  }

  /** Converts final gateway results into durable transcript segments. */
  private handleResult(event: TranscriptResultEvent): void {
    const transcriptId = this.currentTranscriptId
    if (!transcriptId || !event.isFinal) {
      this.events.onResult(event)
      return
    }
    const segment: TranscriptSegment = {
      id: randomUUID(),
      source: event.source,
      text: event.text,
      confidence: event.confidence,
      createdAt: new Date().toISOString(),
      offsetMs: this.baseDurationMs + Math.max(0, Date.now() - this.startedAt),
    }
    this.pendingSegments.push(segment)
    this.sessionSegments.push(segment)
    if (!this.persistenceTimer) {
      this.persistenceTimer = setTimeout(() => {
        this.persistenceTimer = null
        this.flushPendingSegments(transcriptId)
      }, PERSISTENCE_BATCH_MS)
    }
    this.events.onResult({ ...event, segment })
    this.schedulePendingTranslations(transcriptId, false)
  }

  /** Enqueues newly completed sentences once for the active language pair. */
  private schedulePendingTranslations(transcriptId: string, includeTrailing: boolean): void {
    if (this.translationTarget === 'none' || !this.sessionLanguage) return
    this.scheduleTranslations(
      transcriptId,
      this.sessionSegments,
      this.sessionLanguage,
      this.translationProvider,
      this.translationTarget,
      includeTrailing,
    )
  }

  /** Adds every untranslated sentence after the persisted coverage for one language pair. */
  private scheduleTranslations(
    transcriptId: string,
    segments: TranscriptSegment[],
    sourceLanguage: string,
    provider: TranslationProvider,
    targetLanguage: Exclude<TranslationTargetLanguage, 'none'>,
    includeTrailing: boolean,
  ): void {
    const pairKey = this.translationPairKey(transcriptId, provider, sourceLanguage, targetLanguage)
    const pending = findCompletedTranscriptSentences(segments, {
      startIndex: this.translationCoverage.get(pairKey) ?? 0,
      includeTrailing,
    })

    pending.forEach((sentence) => {
      const translationKey = `${pairKey}\u0000${sentence.endIndex}`
      if (this.queuedTranslationKeys.has(translationKey)) return
      this.queuedTranslationKeys.add(translationKey)
      this.translationCoverage.set(pairKey, sentence.endIndex)
      const queue = (this.translationQueues.get(pairKey) ?? Promise.resolve())
        .then(() =>
          this.translateSentence(transcriptId, sentence, provider, sourceLanguage, targetLanguage),
        )
        .finally(() => this.queuedTranslationKeys.delete(translationKey))
      this.translationQueues.set(pairKey, queue)
      void queue.then(() => {
        if (this.translationQueues.get(pairKey) === queue) this.translationQueues.delete(pairKey)
      })
    })
  }

  /** Seeds source coverage from every translation already stored in one document. */
  private initializeTranslationCoverage(transcript: TranscriptDocument): void {
    transcript.translations.forEach((translation) => {
      const pairKey = this.translationPairKey(
        transcript.id,
        translation.provider,
        translation.sourceLanguage,
        translation.targetLanguage,
      )
      this.translationCoverage.set(
        pairKey,
        Math.max(this.translationCoverage.get(pairKey) ?? 0, translation.sourceEndIndex),
      )
    })
  }

  /** Translates, persists, and publishes one source-mapped sentence without logging its text. */
  private async translateSentence(
    transcriptId: string,
    sentence: CompletedTranscriptSentence,
    provider: TranslationProvider,
    sourceLanguage: string,
    targetLanguage: Exclude<TranslationTargetLanguage, 'none'>,
  ): Promise<void> {
    try {
      const text = await this.translator.translate(
        provider,
        sentence.text,
        sourceLanguage,
        targetLanguage,
      )
      if (!text) return
      const translation: TranslationSegment = {
        id: randomUUID(),
        provider,
        sourceText: sentence.text,
        text,
        sourceLanguage,
        targetLanguage,
        sourceSegmentIds: sentence.sourceSegmentIds,
        sourceStartIndex: sentence.startIndex,
        sourceEndIndex: sentence.endIndex,
        createdAt: new Date().toISOString(),
      }
      await this.storage.appendTranslation(transcriptId, translation)
      this.events.onTranslation({ transcriptId, translation })
    } catch (error) {
      this.logger.warn('TranscriptService', 'A completed sentence could not be translated.', error)
      this.events.onError({
        context: 'translation',
        message: 'The latest completed sentence could not be translated.',
        recoverable: true,
      })
    }
  }

  /** Builds a stable transcript and language-pair key for translation coverage. */
  private translationPairKey(
    transcriptId: string,
    provider: TranslationProvider,
    sourceLanguage: string,
    targetLanguage: string,
  ): string {
    return `${transcriptId}\u0000${provider}\u0000${sourceLanguage}\u0000${targetLanguage}`
  }

  /** Moves pending final segments into one serialized AppData write. */
  private flushPendingSegments(transcriptId: string): void {
    this.clearPersistenceTimer()
    const segments = this.pendingSegments.splice(0)
    if (segments.length === 0) return
    this.persistenceQueue = this.persistenceQueue
      .then(() => this.storage.appendSegments(transcriptId, segments))
      .catch((error: unknown) => {
        this.logger.error('TranscriptService', 'Transcript segment persistence failed.', error)
        this.events.onError({
          message: `The transcript could not be saved: ${error instanceof Error ? error.message : 'Unknown error'}`,
          recoverable: true,
        })
      })
  }

  /** Cancels the active persistence debounce without discarding queued segments. */
  private clearPersistenceTimer(): void {
    if (this.persistenceTimer) clearTimeout(this.persistenceTimer)
    this.persistenceTimer = null
  }
}
