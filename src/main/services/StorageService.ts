/**
 * Stores validated settings and transcripts through serialized direct JSON file access.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AUDIO_SOURCES,
  type AppSettings,
  type AppSettingsPatch,
  type DeleteTranscriptResult,
  type TranscriptDocument,
  type TranscriptSegment,
  type TranscriptSummary,
  type TranslationSegment,
} from '@shared/types'
import { TRANSLATION_PROVIDERS, TRANSLATION_TARGET_LANGUAGES } from '@shared/translation'
import { z } from 'zod'
import { parsePersistedSettings, settingsSchema } from '../settingsSchema'

const segmentSchema = z.object({
  id: z.uuid(),
  source: z.enum(AUDIO_SOURCES),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  createdAt: z.iso.datetime(),
  offsetMs: z.number().nonnegative(),
})

const translationSchema = z
  .object({
    id: z.uuid(),
    provider: z.enum(TRANSLATION_PROVIDERS),
    sourceText: z.string().trim().min(1).max(20_000),
    text: z.string().trim().min(1).max(20_000),
    sourceLanguage: z.string().trim().min(1).max(24),
    targetLanguage: z.enum(TRANSLATION_TARGET_LANGUAGES),
    sourceSegmentIds: z.array(z.uuid()).min(1).max(200),
    sourceStartIndex: z.number().int().nonnegative(),
    sourceEndIndex: z.number().int().positive(),
    createdAt: z.iso.datetime(),
  })
  .refine((translation) => translation.sourceEndIndex > translation.sourceStartIndex, {
    path: ['sourceEndIndex'],
    message: 'Translation source range must have a positive length.',
  })

const transcriptSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  isDefaultTitle: z.boolean(),
  language: z.string().min(1).max(24),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
  segments: z.array(segmentSchema),
  translations: z.array(translationSchema),
})

const DEFAULT_TRANSCRIPT_TITLE = 'New Transcript'
const LEGACY_DEFAULT_TITLE_PATTERN = /^\d{4}-\d{2}-\d{2}\s*(?:\u00b7|\.|T)\s*\d{2}:\d{2}$/

/** Rewrites source names from the first Electron schema before domain validation. */
const migrateTranscript = (input: unknown): unknown => {
  if (!input || typeof input !== 'object') return input
  const transcript = input as Record<string, unknown>
  if (!Array.isArray(transcript.segments)) return input
  const segments = transcript.segments as unknown[]
  const hasLegacyDefaultTitle =
    typeof transcript.title === 'string' &&
    (transcript.title === DEFAULT_TRANSCRIPT_TITLE ||
      LEGACY_DEFAULT_TITLE_PATTERN.test(transcript.title))
  const isDefaultTitle =
    typeof transcript.isDefaultTitle === 'boolean'
      ? transcript.isDefaultTitle
      : hasLegacyDefaultTitle
  return {
    ...transcript,
    title:
      isDefaultTitle &&
      typeof transcript.title === 'string' &&
      LEGACY_DEFAULT_TITLE_PATTERN.test(transcript.title)
        ? DEFAULT_TRANSCRIPT_TITLE
        : transcript.title,
    isDefaultTitle,
    translations: Array.isArray(transcript.translations)
      ? transcript.translations.map((translation): unknown => {
          if (!translation || typeof translation !== 'object') return translation
          const value = translation as Record<string, unknown>
          return { provider: 'google', ...value }
        })
      : [],
    segments: segments.map((segment): unknown => {
      if (!segment || typeof segment !== 'object') return segment
      const value = segment as Record<string, unknown>
      return value.source === 'system' ? { ...value, source: 'speaker' } : value
    }),
  }
}

/** Rejects identifiers that could escape the transcript directory. */
const assertTranscriptId = (id: string): void => {
  if (!z.uuid().safeParse(id).success) throw new Error('Invalid transcript identifier.')
}

export default class StorageService {
  private readonly settingsPath: string
  private readonly transcriptsPath: string
  private readonly fileOperationTails = new Map<string, Promise<void>>()

  /** Creates a storage service rooted in the private application data directory. */
  public constructor(private readonly rootPath: string) {
    this.settingsPath = join(rootPath, 'settings.json')
    this.transcriptsPath = join(rootPath, 'transcripts')
  }

  /** Creates required directories and removes obsolete temporary files from previous versions. */
  public async initialize(): Promise<void> {
    await mkdir(this.rootPath, { recursive: true })
    await mkdir(this.transcriptsPath, { recursive: true })
    await Promise.all([
      this.removeObsoleteTemporaryFiles(this.rootPath),
      this.removeObsoleteTemporaryFiles(this.transcriptsPath),
    ])
  }

  /** Loads validated settings or safe defaults for missing or malformed data. */
  public async loadSettings(): Promise<AppSettings> {
    return this.withFileLock(this.settingsPath, () => this.readSettingsUnlocked())
  }

  /** Reads settings while its caller owns the settings-file operation lock. */
  private async readSettingsUnlocked(): Promise<AppSettings> {
    try {
      const value: unknown = JSON.parse(await readFile(this.settingsPath, 'utf8'))
      return parsePersistedSettings(value)
    } catch {
      return parsePersistedSettings(null)
    }
  }

  /** Validates and writes application settings directly to their JSON file. */
  public async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const validated = settingsSchema.parse(settings)
    await this.writeJsonFile(this.settingsPath, validated)
    return validated
  }

  /** Atomically merges changed fields into the latest validated settings document. */
  public async updateSettings(patch: AppSettingsPatch): Promise<AppSettings> {
    return this.withFileLock(this.settingsPath, async () => {
      const current = await this.readSettingsUnlocked()
      const deepgramPatch = patch.transcriptionProviderSettings?.deepgram
      const validated = settingsSchema.parse({
        ...current,
        ...patch,
        transcriptionProviderSettings: deepgramPatch
          ? {
              ...current.transcriptionProviderSettings,
              deepgram: {
                ...current.transcriptionProviderSettings.deepgram,
                ...deepgramPatch,
              },
            }
          : current.transcriptionProviderSettings,
      })
      await this.writeJsonFileUnlocked(this.settingsPath, validated)
      return validated
    })
  }

  /** Creates a new empty transcript. */
  public async createTranscript(language: string, title?: string): Promise<TranscriptDocument> {
    const now = new Date()
    const normalizedTitle = title?.trim().slice(0, 200)
    const transcript: TranscriptDocument = {
      id: randomUUID(),
      title: normalizedTitle || DEFAULT_TRANSCRIPT_TITLE,
      isDefaultTitle: !normalizedTitle,
      language,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      durationMs: 0,
      segments: [],
      translations: [],
    }
    await this.writeTranscript(transcript)
    return transcript
  }

  /** Adds one final source-attributed segment to a transcript. */
  public async appendSegment(id: string, segment: TranscriptSegment): Promise<void> {
    await this.appendSegments(id, [segment])
  }

  /** Adds a batch of final segments within one serialized read-modify-write operation. */
  public async appendSegments(id: string, segments: TranscriptSegment[]): Promise<void> {
    if (segments.length === 0) return
    const validatedSegments = segments.map((segment) => segmentSchema.parse(segment))
    await this.updateTranscript(id, (transcript) => {
      transcript.segments.push(...validatedSegments)
      transcript.updatedAt = new Date().toISOString()
    })
  }

  /** Adds one validated sentence translation without duplicating its source-language pair. */
  public async appendTranslation(id: string, translation: TranslationSegment): Promise<void> {
    const validatedTranslation = translationSchema.parse(translation)
    await this.updateTranscript(id, (transcript) => {
      const duplicate = transcript.translations.some(
        (candidate) =>
          candidate.sourceEndIndex === validatedTranslation.sourceEndIndex &&
          candidate.provider === validatedTranslation.provider &&
          candidate.sourceLanguage === validatedTranslation.sourceLanguage &&
          candidate.targetLanguage === validatedTranslation.targetLanguage,
      )
      if (duplicate) return
      transcript.translations.push(validatedTranslation)
      transcript.updatedAt = new Date().toISOString()
    })
  }

  /** Finalizes a transcript with its total recording duration. */
  public async finishTranscript(id: string, durationMs: number): Promise<TranscriptDocument> {
    return this.updateTranscript(id, (transcript) => {
      transcript.durationMs = Math.max(0, Math.round(durationMs))
      transcript.updatedAt = new Date().toISOString()
    })
  }

  /** Loads and validates one complete transcript. */
  public async getTranscript(id: string): Promise<TranscriptDocument> {
    assertTranscriptId(id)
    const filePath = this.transcriptPath(id)
    return this.withFileLock(filePath, () => this.readTranscriptUnlocked(filePath))
  }

  /** Lists compact transcript summaries in reverse chronological order. */
  public async listTranscripts(): Promise<TranscriptSummary[]> {
    const entries = await readdir(this.transcriptsPath, { withFileTypes: true })
    const documents = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => this.tryReadTranscript(join(this.transcriptsPath, entry.name))),
    )

    return documents
      .filter((document): document is TranscriptDocument => document !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((document) => ({
        id: document.id,
        title: document.title,
        isDefaultTitle: document.isDefaultTitle,
        language: document.language,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        durationMs: document.durationMs,
        segmentCount: document.segments.length,
        preview: document.segments
          .map((segment) => segment.text)
          .join(' ')
          .slice(0, 140),
      }))
  }

  /** Renames a transcript within the same serialized file operation used by live writes. */
  public async renameTranscript(id: string, title: string): Promise<TranscriptDocument> {
    const normalizedTitle = title.trim().slice(0, 200)
    if (!normalizedTitle) throw new Error('Transcript title cannot be empty.')
    return this.updateTranscript(id, (transcript) => {
      transcript.title = normalizedTitle
      transcript.isDefaultTitle = false
      transcript.updatedAt = new Date().toISOString()
    })
  }

  /** Deletes a transcript while preserving one non-deletable empty workspace. */
  public async deleteTranscript(id: string): Promise<DeleteTranscriptResult> {
    assertTranscriptId(id)
    return this.withFileLock(this.transcriptsPath, () => this.deleteTranscriptUnlocked(id))
  }

  /** Performs one deletion while holding the workspace-wide history lock. */
  private async deleteTranscriptUnlocked(id: string): Promise<DeleteTranscriptResult> {
    const transcripts = await this.listTranscripts()
    const target = transcripts.find((transcript) => transcript.id === id)
    if (!target) return { deleted: false }
    if (transcripts.length === 1 && target.segmentCount === 0) return { deleted: false }

    const replacement =
      transcripts.length === 1 ? await this.createTranscript(target.language) : undefined
    const filePath = this.transcriptPath(id)
    try {
      await this.withFileLock(filePath, () => unlink(filePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (replacement) await unlink(this.transcriptPath(replacement.id)).catch(() => undefined)
        throw error
      }
    }
    return replacement ? { deleted: true, replacement } : { deleted: true }
  }

  /** Reads one transcript while tolerating malformed history entries. */
  private async tryReadTranscript(filePath: string): Promise<TranscriptDocument | null> {
    try {
      return await this.withFileLock(filePath, () => this.readTranscriptUnlocked(filePath))
    } catch {
      return null
    }
  }

  /** Applies one transcript mutation without allowing another operation to interleave. */
  private async updateTranscript(
    id: string,
    update: (transcript: TranscriptDocument) => void,
  ): Promise<TranscriptDocument> {
    assertTranscriptId(id)
    const filePath = this.transcriptPath(id)
    return this.withFileLock(filePath, async () => {
      const transcript = await this.readTranscriptUnlocked(filePath)
      update(transcript)
      const validated = transcriptSchema.parse(transcript)
      await this.writeJsonFileUnlocked(filePath, validated)
      return validated
    })
  }

  /** Validates and writes a complete transcript document. */
  private async writeTranscript(transcript: TranscriptDocument): Promise<void> {
    const validated = transcriptSchema.parse(transcript)
    await this.writeJsonFile(this.transcriptPath(validated.id), validated)
  }

  /** Reads a transcript while its caller owns the file-operation lock. */
  private async readTranscriptUnlocked(filePath: string): Promise<TranscriptDocument> {
    const value: unknown = JSON.parse(await readFile(filePath, 'utf8'))
    return transcriptSchema.parse(migrateTranscript(value))
  }

  /** Resolves a validated transcript identifier to its JSON file. */
  private transcriptPath(id: string): string {
    return join(this.transcriptsPath, `${id}.json`)
  }

  /** Serializes and writes one JSON value directly to its destination file. */
  private async writeJsonFile(filePath: string, value: unknown): Promise<void> {
    await this.withFileLock(filePath, () => this.writeJsonFileUnlocked(filePath, value))
  }

  /** Writes one complete JSON payload while its caller owns the file-operation lock. */
  private async writeJsonFileUnlocked(filePath: string, value: unknown): Promise<void> {
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  }

  /** Runs one operation after every earlier operation targeting the same file. */
  private async withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.fileOperationTails.get(filePath) ?? Promise.resolve()
    let release = (): void => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.catch(() => undefined).then(() => gate)
    this.fileOperationTails.set(filePath, tail)
    await previous.catch(() => undefined)
    try {
      return await operation()
    } finally {
      release()
      if (this.fileOperationTails.get(filePath) === tail) this.fileOperationTails.delete(filePath)
    }
  }

  /** Removes only obsolete temporary files created by pre-v3 direct-write builds. */
  private async removeObsoleteTemporaryFiles(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true })
    await Promise.allSettled(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.tmp'))
        .map((entry) => unlink(join(directoryPath, entry.name))),
    )
  }
}
