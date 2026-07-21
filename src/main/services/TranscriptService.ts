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
} from '@shared/types'
import type CredentialService from './CredentialService'
import type DeepgramService from './DeepgramService'
import type LoggerService from './LoggerService'
import type StorageService from './StorageService'

interface TranscriptEvents {
  onState: (event: SessionStateEvent) => void
  onResult: (event: TranscriptResultEvent) => void
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

  /** Creates a session coordinator with explicit service dependencies. */
  public constructor(
    private readonly storage: StorageService,
    private readonly credentials: CredentialService,
    private readonly deepgram: DeepgramService,
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
      const apiKey = await this.credentials.getApiKey()
      this.throwIfStartCancelled()
      if (!apiKey) throw new Error('Save a valid Deepgram API key before recording.')
      const transcript = request.transcriptId
        ? await this.storage.getTranscript(request.transcriptId)
        : await this.storage.createTranscript(request.settings.language, request.title)
      this.startingTranscriptId = transcript.id
      this.throwIfStartCancelled()
      this.events.onState({ state: 'connecting', transcriptId: transcript.id })
      await this.deepgram.start({
        sources,
        apiKey,
        settings: request.settings,
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
      this.events.onState({
        state: 'recording',
        transcriptId: transcript.id,
        startedAt: new Date(this.startedAt).toISOString(),
      })
      this.logger.info('TranscriptService', 'Recording session started.', {
        transcriptId: transcript.id,
        sources,
        model: request.settings.model,
        language: request.settings.language,
      })
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
      await this.persistenceQueue
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
    if (!this.persistenceTimer) {
      this.persistenceTimer = setTimeout(() => {
        this.persistenceTimer = null
        this.flushPendingSegments(transcriptId)
      }, PERSISTENCE_BATCH_MS)
    }
    this.events.onResult({ ...event, segment })
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
