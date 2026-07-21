/**
 * Verifies transcript persistence invariants in isolated temporary directories.
 */

import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import StorageService from '../src/main/services/StorageService'

const temporaryRoots: string[] = []

/** Creates an initialized storage service with no shared runtime state. */
const createStorage = async (): Promise<StorageService> => {
  const root = await mkdtemp(join(tmpdir(), 'transcript-storage-'))
  temporaryRoots.push(root)
  const storage = new StorageService(root)
  await storage.initialize()
  return storage
}

/** Creates an initialized storage service and exposes its isolated root for file tests. */
const createStorageContext = async (): Promise<{ root: string; storage: StorageService }> => {
  const root = await mkdtemp(join(tmpdir(), 'transcript-storage-'))
  temporaryRoots.push(root)
  const storage = new StorageService(root)
  await storage.initialize()
  return { root, storage }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('StorageService transcript invariant', () => {
  it('atomically merges concurrent settings patches without losing fields', async () => {
    const storage = await createStorage()
    await storage.saveSettings(DEFAULT_SETTINGS)

    await Promise.all([
      storage.updateSettings({ theme: 'dark' }),
      storage.updateSettings({ logLevel: 'debug' }),
      storage.updateSettings({ autoUpdate: false }),
      storage.updateSettings({
        transcriptionProviderSettings: { deepgram: { endpointingMs: 250 } },
      }),
      storage.updateSettings({
        transcriptionProviderSettings: { deepgram: { vocabulary: ['Transcript'] } },
      }),
    ])

    await expect(storage.loadSettings()).resolves.toMatchObject({
      theme: 'dark',
      logLevel: 'debug',
      autoUpdate: false,
      transcriptionProviderSettings: {
        deepgram: { endpointingMs: 250, vocabulary: ['Transcript'] },
      },
    })
  })

  it('does not delete the only empty transcript', async () => {
    const storage = await createStorage()
    const transcript = await storage.createTranscript('en')

    await expect(storage.deleteTranscript(transcript.id)).resolves.toEqual({ deleted: false })
    await expect(storage.listTranscripts()).resolves.toHaveLength(1)
    expect(transcript.title).toBe('New Transcript')
    expect(transcript.isDefaultTitle).toBe(true)
  })

  it('replaces the only populated transcript before deleting it', async () => {
    const storage = await createStorage()
    const transcript = await storage.createTranscript('tr')
    await storage.appendSegment(transcript.id, {
      id: randomUUID(),
      source: 'microphone',
      text: 'Merhaba dünya.',
      confidence: 0.98,
      createdAt: new Date().toISOString(),
      offsetMs: 200,
    })

    const result = await storage.deleteTranscript(transcript.id)

    expect(result.deleted).toBe(true)
    expect(result.replacement).toMatchObject({ language: 'tr', segments: [] })
    const remaining = await storage.listTranscripts()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.id).toBe(result.replacement?.id)
  })

  it('serializes concurrent deletions so one ready transcript always remains', async () => {
    const storage = await createStorage()
    const first = await storage.createTranscript('en')
    const second = await storage.createTranscript('en')

    const results = await Promise.all([
      storage.deleteTranscript(first.id),
      storage.deleteTranscript(second.id),
    ])

    expect(results.filter((result) => result.deleted)).toHaveLength(1)
    await expect(storage.listTranscripts()).resolves.toHaveLength(1)
  })

  it('persists a segment batch in order with one aggregate update', async () => {
    const storage = await createStorage()
    const transcript = await storage.createTranscript('en')
    const createdAt = new Date().toISOString()

    await storage.appendSegments(transcript.id, [
      {
        id: randomUUID(),
        source: 'microphone',
        text: 'First.',
        confidence: 0.9,
        createdAt,
        offsetMs: 100,
      },
      {
        id: randomUUID(),
        source: 'speaker',
        text: 'Second.',
        confidence: 0.92,
        createdAt,
        offsetMs: 200,
      },
    ])

    const persisted = await storage.getTranscript(transcript.id)
    expect(persisted.segments.map((segment) => segment.text)).toEqual(['First.', 'Second.'])
  })

  it('persists a source-mapped translation beside its transcript segments', async () => {
    const storage = await createStorage()
    const transcript = await storage.createTranscript('en')
    const sourceId = randomUUID()
    await storage.appendSegment(transcript.id, {
      id: sourceId,
      source: 'microphone',
      text: 'Hello world.',
      confidence: 0.99,
      createdAt: new Date().toISOString(),
      offsetMs: 100,
    })

    await storage.appendTranslation(transcript.id, {
      id: randomUUID(),
      provider: 'google',
      sourceText: 'Hello world.',
      text: 'Merhaba dünya.',
      sourceLanguage: 'en',
      targetLanguage: 'tr',
      sourceSegmentIds: [sourceId],
      sourceStartIndex: 0,
      sourceEndIndex: 12,
      createdAt: new Date().toISOString(),
    })

    const persisted = await storage.getTranscript(transcript.id)
    expect(persisted.translations).toHaveLength(1)
    expect(persisted.translations[0]).toMatchObject({
      provider: 'google',
      sourceText: 'Hello world.',
      text: 'Merhaba dünya.',
      sourceSegmentIds: [sourceId],
    })
  })

  it('migrates translations saved before provider identities to Google', async () => {
    const { root, storage } = await createStorageContext()
    const transcript = await storage.createTranscript('en')
    const sourceId = randomUUID()
    const createdAt = new Date().toISOString()
    const legacyTranscript = {
      ...transcript,
      segments: [
        {
          id: sourceId,
          source: 'microphone',
          text: 'Hello world.',
          confidence: 0.99,
          createdAt,
          offsetMs: 100,
        },
      ],
      translations: [
        {
          id: randomUUID(),
          sourceText: 'Hello world.',
          text: 'Merhaba dünya.',
          sourceLanguage: 'en',
          targetLanguage: 'tr',
          sourceSegmentIds: [sourceId],
          sourceStartIndex: 0,
          sourceEndIndex: 12,
          createdAt,
        },
      ],
    }
    await writeFile(
      join(root, 'transcripts', `${transcript.id}.json`),
      JSON.stringify(legacyTranscript),
      'utf8',
    )

    const migrated = await storage.getTranscript(transcript.id)

    expect(migrated.translations[0]?.provider).toBe('google')
  })

  it('renames a transcript without changing its content', async () => {
    const storage = await createStorage()
    const transcript = await storage.createTranscript('en')

    const renamed = await storage.renameTranscript(transcript.id, '  Planning call  ')
    const persisted = await storage.getTranscript(transcript.id)

    expect(renamed.title).toBe('Planning call')
    expect(renamed.isDefaultTitle).toBe(false)
    expect(persisted).toMatchObject({ id: transcript.id, title: 'Planning call', segments: [] })
  })

  it('migrates legacy date-based default titles while keeping the timestamp metadata', async () => {
    const { root, storage } = await createStorageContext()
    const transcript = await storage.createTranscript('en')
    await writeFile(
      join(root, 'transcripts', `${transcript.id}.json`),
      JSON.stringify({ ...transcript, title: '2026-07-21 \u00b7 18:07' }),
      'utf8',
    )

    const migrated = await storage.getTranscript(transcript.id)

    expect(migrated.title).toBe('New Transcript')
    expect(migrated.isDefaultTitle).toBe(true)
    expect(migrated.createdAt).toBe(transcript.createdAt)
  })

  it('serializes concurrent transcript updates and reads without losing segments', async () => {
    const { root, storage } = await createStorageContext()
    const transcript = await storage.createTranscript('en')
    const updates = Array.from({ length: 20 }, (_, index) =>
      storage.appendSegment(transcript.id, {
        id: randomUUID(),
        source: 'microphone',
        text: `Sentence ${index + 1}.`,
        confidence: 0.95,
        createdAt: new Date().toISOString(),
        offsetMs: index * 100,
      }),
    )
    const reads = Array.from({ length: 20 }, () => storage.getTranscript(transcript.id))

    await Promise.all([...updates, ...reads])
    const persisted = await storage.getTranscript(transcript.id)

    expect(persisted.segments).toHaveLength(20)
    expect((await readdir(join(root, 'transcripts'))).some((name) => name.endsWith('.tmp'))).toBe(
      false,
    )
  })

  it('removes obsolete temporary files without changing transcript JSON files', async () => {
    const { root, storage } = await createStorageContext()
    const transcript = await storage.createTranscript('en')
    const temporaryPath = join(root, 'transcripts', 'obsolete-write.tmp')
    await writeFile(temporaryPath, 'obsolete', 'utf8')

    await storage.initialize()

    const files = await readdir(join(root, 'transcripts'))
    expect(files).toContain(`${transcript.id}.json`)
    expect(files.some((name) => name.endsWith('.tmp'))).toBe(false)
  })
})
