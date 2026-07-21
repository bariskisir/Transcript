/**
 * Verifies recording-session lifecycle races independently from Electron and the network.
 */

import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type TranscriptDocument } from '../src/shared/types'
import type CredentialService from '../src/main/services/CredentialService'
import type DeepgramService from '../src/main/services/DeepgramService'
import type LoggerService from '../src/main/services/LoggerService'
import type StorageService from '../src/main/services/StorageService'
import TranscriptService from '../src/main/services/TranscriptService'

const transcript: TranscriptDocument = {
  id: '60816155-248f-4896-a010-bd6b1b0f80a0',
  title: 'New Transcript',
  isDefaultTitle: true,
  language: 'en',
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
  durationMs: 0,
  segments: [],
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
    const service = new TranscriptService(
      storage,
      credentials,
      deepgram,
      {
        onState: (event) => states.push(event.state),
        onResult: vi.fn(),
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
})
