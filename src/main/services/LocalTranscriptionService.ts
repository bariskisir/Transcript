/**
 * Adapts local ONNX and transcribe.cpp engines to source-separated pseudo-streaming events.
 */

import type { LocalTranscriptionSettings } from '@shared/transcription'
import type { AudioSource, TranscriptResultEvent } from '@shared/types'
import type LocalModelService from './LocalModelService'
import type LoggerService from './LoggerService'
import RestTranscriptionStream from './RestTranscriptionStream'

interface StartOptions {
  sources: AudioSource[]
  settings: LocalTranscriptionSettings
  onResult: (event: TranscriptResultEvent) => void
  onError: (source: AudioSource, message: string) => void
}

/** Supplies on-device ASR inference to the reusable request-response transcript engine. */
export default class LocalTranscriptionService {
  private readonly streams = new Map<AudioSource, RestTranscriptionStream>()

  /** Creates a local transcription adapter around the shared model manager. */
  public constructor(
    private readonly models: LocalModelService,
    private readonly logger: LoggerService,
  ) {}

  /** Ensures the selected model is loaded and creates one stream per enabled source. */
  public async start(options: StartOptions): Promise<void> {
    if (this.streams.size > 0) throw new Error('Local transcription is already running.')
    if (!options.settings.modelId) throw new Error('Select a downloaded Local model first.')
    await this.models.select(options.settings.modelId)
    options.sources.forEach((source) => {
      this.streams.set(
        source,
        new RestTranscriptionStream({
          source,
          language: options.settings.language === 'auto' ? '' : options.settings.language,
          speed: 'medium',
          transcribe: (pcm) => this.models.transcribe(pcm, options.settings.language),
          onResult: options.onResult,
          onError: (error) => {
            const message = error instanceof Error ? error.message : 'Local transcription failed.'
            this.logger.error(
              'LocalTranscription',
              'An audio snapshot could not be transcribed.',
              error,
            )
            options.onError(source, message)
          },
        }),
      )
    })
  }

  /** Routes a PCM frame exclusively to its matching source stream. */
  public send(source: AudioSource, samples: Uint8Array): void {
    this.streams.get(source)?.send(samples)
  }

  /** Finalizes all utterances while keeping the selected model loaded for reuse. */
  public async stop(): Promise<void> {
    const streams = [...this.streams.values()]
    this.streams.clear()
    await Promise.all(streams.map((stream) => stream.close()))
  }
}
