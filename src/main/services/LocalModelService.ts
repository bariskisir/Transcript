/**
 * Owns the local ASR catalog, verified downloads, cache discovery, and ONNX/C++ inference engines.
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { Worker } from 'node:worker_threads'
import handyModelCatalogJson from '@shared/handyModelCatalog.json'
import {
  LOCAL_TRANSCRIPTION_LANGUAGES,
  type LocalModelOrigin,
  type LocalEngineStateEvent,
  type LocalModelInfo,
  type LocalModelOperationEvent,
} from '@shared/localTranscription'
import type LoggerService from './LoggerService'
import { createLocalInferenceWorkerSource } from './LocalInferenceWorker'

interface LocalModelCatalogEntry {
  id: string
  name: string
  description: string
  sizeBytes: number
  license: string
  accuracyScore: number
  speedScore: number
  isRecommended: boolean
  languages: readonly string[]
  supportsLanguageDetection: boolean
  engine?: 'transformers' | 'transcribe-cpp'
  family?: string
  filename?: string
  revision?: string
  sha256?: string
  mirrors?: readonly string[]
}

interface HandyCatalogFile {
  filename: string
  quant: string
  size_bytes: number
  sha256: string
}

interface HandyCatalogModel {
  id: string
  revision: string
  name: string
  description: string
  architecture: string
  family: string
  license: string
  languages: string[]
  capabilities: { lang_detect: boolean }
  speed_score: number
  accuracy_score: number
  files: HandyCatalogFile[]
  default_quant: string
  recommended: boolean
}

interface HandyCatalog {
  mirrors: string[]
  models: HandyCatalogModel[]
}

interface LocalModelServiceEvents {
  onOperation: (event: LocalModelOperationEvent) => void
  onEngineState: (event: LocalEngineStateEvent) => void
  onModelsChanged: (models: LocalModelInfo[]) => void
}

interface WorkerLoadOptions {
  modelSource: string
  cacheDirectory: string
  localFilesOnly: boolean
  languageOptionsEnabled: boolean
  onProgress?: ((loaded: number, total: number, percentage: number) => void) | undefined
}

interface WorkerResponse {
  kind: 'loaded' | 'result' | 'disposed' | 'progress' | 'error'
  requestId: number
  text?: string
  loaded?: number
  total?: number
  percentage?: number
  message?: string
}

interface PendingWorkerRequest {
  resolve: (value: string) => void
  reject: (error: Error) => void
  onProgress?: ((loaded: number, total: number, percentage: number) => void) | undefined
}

interface DiscoveredModel {
  id: string
  path: string
  origin: Extract<LocalModelOrigin, 'models-directory' | 'huggingface'>
  engine: 'transformers' | 'transcribe-cpp'
  family: string
}

const ONNX_CATALOG: LocalModelCatalogEntry[] = [
  {
    id: 'Xenova/whisper-tiny',
    name: 'Whisper Tiny',
    description: 'En hızlı ve en düşük bellek kullanan çok dilli model.',
    sizeBytes: 43_622_127,
    license: 'MIT',
    accuracyScore: 2,
    speedScore: 5,
    isRecommended: false,
    languages: LOCAL_TRANSCRIPTION_LANGUAGES,
    supportsLanguageDetection: true,
  },
  {
    id: 'Xenova/whisper-tiny.en',
    name: 'Whisper Tiny English',
    description: 'Yalnızca İngilizce için en küçük ve en hızlı Whisper modeli.',
    sizeBytes: 42_985_755,
    license: 'MIT',
    accuracyScore: 2,
    speedScore: 5,
    isRecommended: false,
    languages: ['en'],
    supportsLanguageDetection: false,
  },
  {
    id: 'Xenova/whisper-base',
    name: 'Whisper Base',
    description: 'Hız ile doğruluk arasında hafif bir denge sunar.',
    sizeBytes: 79_677_901,
    license: 'MIT',
    accuracyScore: 3,
    speedScore: 4,
    isRecommended: false,
    languages: LOCAL_TRANSCRIPTION_LANGUAGES,
    supportsLanguageDetection: true,
  },
  {
    id: 'Xenova/whisper-base.en',
    name: 'Whisper Base English',
    description: 'İngilizce konuşmalar için hızlı ve hafif bir model.',
    sizeBytes: 79_041_253,
    license: 'MIT',
    accuracyScore: 3,
    speedScore: 4,
    isRecommended: false,
    languages: ['en'],
    supportsLanguageDetection: false,
  },
  {
    id: 'distil-whisper/distil-small.en',
    name: 'Distil Whisper Small English',
    description: 'İngilizce için düşük bellek kullanımlı ve hızlı damıtılmış model.',
    sizeBytes: 174_768_001,
    license: 'MIT',
    accuracyScore: 4,
    speedScore: 5,
    isRecommended: false,
    languages: ['en'],
    supportsLanguageDetection: false,
  },
  {
    id: 'Xenova/whisper-small',
    name: 'Whisper Small',
    description: 'Daha iyi doğruluk için daha fazla bellek ve işlem gücü kullanır.',
    sizeBytes: 251_875_316,
    license: 'MIT',
    accuracyScore: 4,
    speedScore: 3,
    isRecommended: false,
    languages: LOCAL_TRANSCRIPTION_LANGUAGES,
    supportsLanguageDetection: true,
  },
  {
    id: 'Xenova/whisper-small.en',
    name: 'Whisper Small English',
    description: 'İngilizcede daha iyi doğruluk sunan orta boy model.',
    sizeBytes: 251_238_776,
    license: 'MIT',
    accuracyScore: 4,
    speedScore: 3,
    isRecommended: false,
    languages: ['en'],
    supportsLanguageDetection: false,
  },
  {
    id: 'distil-whisper/distil-medium.en',
    name: 'Distil Whisper Medium English',
    description: 'İngilizce için yüksek doğruluk ve hızlı decoder sunan damıtılmış model.',
    sizeBytes: 405_006_331,
    license: 'MIT',
    accuracyScore: 5,
    speedScore: 4,
    isRecommended: false,
    languages: ['en'],
    supportsLanguageDetection: false,
  },
  {
    id: 'Xenova/whisper-medium',
    name: 'Whisper Medium',
    description: 'Yüksek doğruluk sağlayan, güçlü donanım gerektiren çok dilli model.',
    sizeBytes: 778_899_072,
    license: 'MIT',
    accuracyScore: 5,
    speedScore: 1,
    isRecommended: false,
    languages: LOCAL_TRANSCRIPTION_LANGUAGES,
    supportsLanguageDetection: true,
  },
  {
    id: 'Xenova/whisper-medium.en',
    name: 'Whisper Medium English',
    description: 'İngilizce için yüksek doğruluk sağlayan güçlü model.',
    sizeBytes: 778_262_518,
    license: 'MIT',
    accuracyScore: 5,
    speedScore: 2,
    isRecommended: false,
    languages: ['en'],
    supportsLanguageDetection: false,
  },
  {
    id: 'onnx-community/whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    description: 'Çok dilli kullanımda yüksek doğruluk ile optimize edilmiş hız dengesi.',
    sizeBytes: 1_087_527_940,
    license: 'MIT',
    accuracyScore: 5,
    speedScore: 3,
    isRecommended: false,
    languages: LOCAL_TRANSCRIPTION_LANGUAGES,
    supportsLanguageDetection: true,
  },
  {
    id: 'Xenova/whisper-large-v3',
    name: 'Whisper Large v3',
    description: 'En yüksek çok dilli doğruluk için yüksek bellek gerektiren model.',
    sizeBytes: 1_563_089_365,
    license: 'MIT',
    accuracyScore: 5,
    speedScore: 1,
    isRecommended: false,
    languages: LOCAL_TRANSCRIPTION_LANGUAGES,
    supportsLanguageDetection: true,
  },
]

const HANDY_CATALOG = handyModelCatalogJson as HandyCatalog
const TRANSCRIBE_CPP_CATALOG: LocalModelCatalogEntry[] = HANDY_CATALOG.models.map((model) => {
  const file =
    model.files.find((candidate) => candidate.quant === model.default_quant) ?? model.files[0]
  if (!file) throw new Error(`Handy catalog model ${model.id} has no downloadable file.`)
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    sizeBytes: file.size_bytes,
    license: model.license,
    accuracyScore: Math.max(0, Math.min(5, Math.round(model.accuracy_score / 20))),
    speedScore: Math.max(0, Math.min(5, Math.round(model.speed_score / 20))),
    isRecommended: model.name.toLocaleLowerCase('en-US').includes('qwen3'),
    languages: model.languages,
    supportsLanguageDetection: model.capabilities.lang_detect,
    engine: 'transcribe-cpp',
    family: model.family || model.architecture,
    filename: file.filename,
    revision: model.revision,
    sha256: file.sha256,
    mirrors: HANDY_CATALOG.mirrors,
  }
})

const CATALOG: LocalModelCatalogEntry[] = [...ONNX_CATALOG, ...TRANSCRIBE_CPP_CATALOG]

/** Reports whether the official native binding publishes artifacts for one Electron target. */
export const supportsTranscribeCppPlatform = (
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): boolean =>
  (platform === 'win32' && architecture === 'x64') ||
  (platform === 'linux' && (architecture === 'x64' || architecture === 'arm64')) ||
  (platform === 'darwin' && (architecture === 'x64' || architecture === 'arm64'))

const COMPLETE_MARKER = '.transcript-model.json'

/** Resolves the self-contained model bundle stored inside one Transformers.js cache. */
export const resolveManagedModelBundle = (cacheDirectory: string, modelId: string): string =>
  join(cacheDirectory, ...modelId.split('/'))

/** Reports whether one ONNX model accepts Whisper task and language generation options. */
export const supportsOnnxLanguageOptions = (modelId: string): boolean => {
  const entry = ONNX_CATALOG.find((candidate) => candidate.id === modelId)
  return (
    !entry ||
    entry.supportsLanguageDetection ||
    entry.languages.some((language) => language !== 'en')
  )
}

/** Provides a typed request/response boundary around one Node inference worker. */
class LocalWorkerClient {
  private readonly worker = new Worker(createLocalInferenceWorkerSource(), { eval: true })
  private readonly pending = new Map<number, PendingWorkerRequest>()
  private requestId = 0
  private terminated = false

  /** Starts the worker and binds all replies before a command is issued. */
  public constructor() {
    this.worker.on('message', (message: unknown) => this.handleMessage(message))
    this.worker.on('error', (error: Error) => this.rejectAll(error))
    this.worker.on('exit', (code) => {
      if (!this.terminated && code !== 0) {
        this.rejectAll(new Error(`Local inference worker exited with code ${code}.`))
      }
    })
  }

  /** Downloads if needed and materializes one ASR pipeline. */
  public load(options: WorkerLoadOptions): Promise<void> {
    return this.request(
      {
        kind: 'load',
        modelSource: options.modelSource,
        cacheDirectory: options.cacheDirectory,
        localFilesOnly: options.localFilesOnly,
        languageOptionsEnabled: options.languageOptionsEnabled,
      },
      options.onProgress,
    ).then(() => undefined)
  }

  /** Runs one PCM16 snapshot through the loaded model. */
  public transcribe(pcm: Uint8Array, language: string): Promise<string> {
    const copy = Uint8Array.from(pcm)
    return this.request({ kind: 'transcribe', pcm: copy.buffer, language }, undefined, [
      copy.buffer,
    ])
  }

  /** Releases ONNX sessions and stops the worker. */
  public async dispose(): Promise<void> {
    if (this.terminated) return
    try {
      await this.request({ kind: 'dispose' })
    } finally {
      await this.terminate()
    }
  }

  /** Immediately interrupts a download or inference operation. */
  public async terminate(): Promise<void> {
    if (this.terminated) return
    this.terminated = true
    this.rejectAll(new Error('Local inference worker was cancelled.'))
    await this.worker.terminate()
  }

  /** Sends one uniquely identified worker command. */
  private request(
    command: Record<string, unknown>,
    onProgress?: ((loaded: number, total: number, percentage: number) => void) | undefined,
    transferList: ArrayBuffer[] = [],
  ): Promise<string> {
    if (this.terminated) return Promise.reject(new Error('Local inference worker is unavailable.'))
    const requestId = ++this.requestId
    return new Promise<string>((resolveRequest, rejectRequest) => {
      this.pending.set(requestId, {
        resolve: resolveRequest,
        reject: rejectRequest,
        ...(onProgress ? { onProgress } : {}),
      })
      this.worker.postMessage({ ...command, requestId }, transferList)
    })
  }

  /** Validates and dispatches an untrusted worker reply. */
  private handleMessage(value: unknown): void {
    if (!isWorkerResponse(value)) return
    const request = this.pending.get(value.requestId)
    if (!request) return
    if (value.kind === 'progress') {
      request.onProgress?.(value.loaded ?? 0, value.total ?? 0, value.percentage ?? 0)
      return
    }
    this.pending.delete(value.requestId)
    if (value.kind === 'error') {
      request.reject(new Error(value.message ?? 'Local inference failed.'))
      return
    }
    request.resolve(value.text ?? '')
  }

  /** Rejects every command still waiting on a failed worker. */
  private rejectAll(error: Error): void {
    this.pending.forEach((request) => {
      request.reject(error)
    })
    this.pending.clear()
  }
}

/** Manages every application-owned and externally discovered local transcription model. */
export default class LocalModelService {
  private readonly managedRoot: string
  private readonly downloads = new Map<string, LocalWorkerClient>()
  private readonly nativeDownloads = new Map<string, AbortController>()
  private readonly discovered = new Map<string, DiscoveredModel>()
  private activeWorker: LocalWorkerClient | null = null
  private activeNativeModel: import('transcribe-cpp').TranscribeModel | null = null
  private activeModelId: string | null = null
  private engineState: LocalEngineStateEvent = { state: 'unloaded' }
  private inferenceQueue = Promise.resolve('')

  /** Creates the local model manager rooted in durable application data. */
  public constructor(
    private readonly modelsRoot: string,
    private readonly events: LocalModelServiceEvents,
    private readonly logger: LoggerService,
  ) {
    this.managedRoot = join(modelsRoot, 'managed')
  }

  /** Creates required directories and discovers existing model copies. */
  public async initialize(): Promise<void> {
    await mkdir(this.managedRoot, { recursive: true })
    await this.scanModelLocations()
  }

  /** Returns renderer-safe catalog and discovered-model state. */
  public async getModels(): Promise<LocalModelInfo[]> {
    const visibleCatalog = CATALOG.filter(
      (entry) => entry.engine !== 'transcribe-cpp' || supportsTranscribeCppPlatform(),
    )
    const catalogModels = await Promise.all(
      visibleCatalog.map((entry) => this.toCatalogInfo(entry)),
    )
    const catalogIds = new Set(CATALOG.map((entry) => entry.id))
    const customModels = [...this.discovered.values()]
      .filter(
        (model) =>
          !catalogIds.has(model.id) &&
          (model.engine !== 'transcribe-cpp' || supportsTranscribeCppPlatform()),
      )
      .map((model) => this.toCustomInfo(model))
    return [...catalogModels, ...customModels].sort((left, right) => {
      const leftTier = left.isDownloaded ? 0 : left.isRecommended ? 1 : 2
      const rightTier = right.isDownloaded ? 0 : right.isRecommended ? 1 : 2
      return (
        leftTier - rightTier || left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
      )
    })
  }

  /** Returns current renderer-safe metadata for one known or discovered model. */
  public async getModel(modelId: string): Promise<LocalModelInfo | null> {
    return (await this.getModels()).find((model) => model.id === modelId) ?? null
  }

  /** Re-scans the application directory and read-only Hugging Face cache. */
  public async rescan(): Promise<LocalModelInfo[]> {
    await this.scanModelLocations()
    const models = await this.getModels()
    this.events.onModelsChanged(models)
    return models
  }

  /** Reports the currently loaded worker model. */
  public getEngineState(): LocalEngineStateEvent {
    return this.engineState
  }

  /** Returns the application-owned directory exposed through the native file manager. */
  public getModelsDirectory(): string {
    return this.modelsRoot
  }

  /** Downloads and verifies one catalog model without selecting it. */
  public async download(modelId: string): Promise<void> {
    const entry = this.requireCatalogEntry(modelId)
    if (entry.engine === 'transcribe-cpp') {
      await this.downloadNativeModel(entry)
      return
    }
    await this.downloadOnnxModel(entry)
  }

  /** Downloads and verifies one Transformers.js model bundle. */
  private async downloadOnnxModel(entry: LocalModelCatalogEntry): Promise<void> {
    const modelId = entry.id
    if (this.downloads.has(modelId)) throw new Error('This model is already downloading.')
    if (await this.hasManagedMarker(modelId)) return
    const worker = new LocalWorkerClient()
    this.downloads.set(modelId, worker)
    const startedAt = Date.now()
    const modelDirectory = this.getManagedDirectory(modelId)
    await mkdir(modelDirectory, { recursive: true })
    await removeTemporaryCacheFiles(modelDirectory)
    this.events.onOperation({ modelId, phase: 'downloading', downloadedBytes: 0 })
    try {
      await worker.load({
        modelSource: modelId,
        cacheDirectory: modelDirectory,
        localFilesOnly: false,
        languageOptionsEnabled: supportsOnnxLanguageOptions(modelId),
        onProgress: (loaded, total, percentage) => {
          const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1_000)
          this.events.onOperation({
            modelId,
            phase: 'downloading',
            downloadedBytes: loaded,
            totalBytes: total || entry.sizeBytes,
            percentage,
            bytesPerSecond: loaded / elapsedSeconds,
          })
        },
      })
      if (this.downloads.get(modelId) !== worker) return
      this.events.onOperation({ modelId, phase: 'verifying' })
      await worker.dispose()
      if (this.downloads.get(modelId) !== worker) return
      await writeFile(
        join(modelDirectory, COMPLETE_MARKER),
        JSON.stringify({ modelId, completedAt: new Date().toISOString() }),
        'utf8',
      )
      this.downloads.delete(modelId)
      this.events.onOperation({ modelId, phase: 'ready', percentage: 100 })
      this.events.onModelsChanged(await this.getModels())
    } catch (error) {
      if (!this.downloads.has(modelId)) {
        this.events.onOperation({ modelId, phase: 'cancelled' })
        return
      }
      const message = error instanceof Error ? error.message : 'Model download failed.'
      this.logger.error('LocalModel', 'A local model could not be downloaded.', error)
      this.events.onOperation({ modelId, phase: 'error', message })
      throw error
    } finally {
      this.downloads.delete(modelId)
      await worker.terminate()
      await removeTemporaryCacheFiles(modelDirectory)
    }
  }

  /** Downloads one pinned GGUF file with resume support and verifies its catalog hash. */
  private async downloadNativeModel(entry: LocalModelCatalogEntry): Promise<void> {
    const { id: modelId, filename, revision, sha256 } = entry
    if (!filename || !revision || !sha256) throw new Error('Incomplete native model catalog entry.')
    if (this.nativeDownloads.has(modelId) || this.downloads.has(modelId)) {
      throw new Error('This model is already downloading.')
    }
    if (await this.hasManagedMarker(modelId)) return

    const controller = new AbortController()
    this.nativeDownloads.set(modelId, controller)
    const startedAt = Date.now()
    const modelDirectory = this.getManagedDirectory(modelId)
    const partialPath = join(modelDirectory, `${filename}.partial`)
    const modelPath = join(modelDirectory, filename)
    await mkdir(modelDirectory, { recursive: true })
    this.events.onOperation({ modelId, phase: 'downloading', downloadedBytes: 0 })

    try {
      const repositoryPath = modelId
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/')
      const sources = [
        `https://huggingface.co/${repositoryPath}/resolve/${encodeURIComponent(revision)}/${encodeURIComponent(filename)}?download=true`,
        ...(entry.mirrors ?? []).map(
          (mirror) =>
            `${mirror.replace(/\/$/, '')}/${repositoryPath}/${encodeURIComponent(revision)}/${encodeURIComponent(filename)}`,
        ),
      ]
      let lastError: Error | null = null
      for (const source of sources) {
        try {
          await downloadResumableFile(
            source,
            partialPath,
            entry.sizeBytes,
            controller.signal,
            (downloadedBytes, totalBytes) => {
              const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1_000)
              this.events.onOperation({
                modelId,
                phase: 'downloading',
                downloadedBytes,
                totalBytes,
                percentage: totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0,
                bytesPerSecond: downloadedBytes / elapsedSeconds,
              })
            },
          )
          lastError = null
          break
        } catch (error) {
          if (controller.signal.aborted) throw error
          lastError = error instanceof Error ? error : new Error(String(error))
          this.logger.error('LocalModel', `Native model source failed: ${source}`, error)
        }
      }
      if (lastError) throw lastError
      if (controller.signal.aborted) throw new Error('Model download cancelled.')

      this.events.onOperation({ modelId, phase: 'verifying', percentage: 100 })
      const downloadedHash = await sha256File(partialPath)
      if (downloadedHash !== sha256.toLowerCase()) {
        await rm(partialPath, { force: true })
        throw new Error('Downloaded model failed SHA-256 verification.')
      }
      await rename(partialPath, modelPath)
      await writeFile(
        join(modelDirectory, COMPLETE_MARKER),
        JSON.stringify({ modelId, filename, sha256, completedAt: new Date().toISOString() }),
        'utf8',
      )
      this.nativeDownloads.delete(modelId)
      this.events.onOperation({ modelId, phase: 'ready', percentage: 100 })
      this.events.onModelsChanged(await this.getModels())
    } catch (error) {
      if (controller.signal.aborted || !this.nativeDownloads.has(modelId)) {
        this.events.onOperation({ modelId, phase: 'cancelled' })
        return
      }
      const message = error instanceof Error ? error.message : 'Model download failed.'
      this.logger.error('LocalModel', 'A native local model could not be downloaded.', error)
      this.events.onOperation({ modelId, phase: 'error', message })
      throw error
    } finally {
      this.nativeDownloads.delete(modelId)
    }
  }

  /** Cancels one active download and leaves only non-loadable partial cache files. */
  public async cancelDownload(modelId: string): Promise<void> {
    const worker = this.downloads.get(modelId)
    const controller = this.nativeDownloads.get(modelId)
    if (!worker && !controller) return
    if (worker) {
      this.downloads.delete(modelId)
      await worker.terminate()
    }
    if (controller) {
      this.nativeDownloads.delete(modelId)
      controller.abort()
    }
    this.events.onOperation({ modelId, phase: 'cancelled' })
    this.events.onModelsChanged(await this.getModels())
  }

  /** Loads one complete managed or shared-cache model into its matching inference engine. */
  public async select(modelId: string): Promise<void> {
    const source = await this.resolveModelSource(modelId)
    if (!source) throw new Error('Download or scan this model before selecting it.')
    if (this.activeModelId === modelId && this.engineState.state === 'ready') return
    await this.unload()
    if (source.engine === 'transcribe-cpp') {
      this.setEngineState({ state: 'loading', modelId })
      try {
        await configurePackagedTranscribeCppLibrary()
        const { TranscribeModel, setLogHandler } = await import('transcribe-cpp')
        setLogHandler((_level, message) => {
          if (message.trim()) this.logger.info('TranscribeCpp', message.trim())
        })
        const model = await TranscribeModel.load(source.modelSource, { backend: 'cpu' })
        this.activeNativeModel = model
        this.activeModelId = modelId
        this.setEngineState({ state: 'ready', modelId })
      } catch (error) {
        this.activeNativeModel = null
        this.activeModelId = null
        const message = error instanceof Error ? error.message : 'Native model loading failed.'
        this.logger.error(
          'LocalModel',
          `Native model could not be loaded: ${modelId} (${source.modelSource})`,
          error,
        )
        this.setEngineState({ state: 'error', modelId, message })
        throw error
      }
      return
    }

    const worker = new LocalWorkerClient()
    this.activeWorker = worker
    this.setEngineState({ state: 'loading', modelId })
    try {
      await worker.load({
        modelSource: source.modelSource,
        cacheDirectory: source.cacheDirectory,
        localFilesOnly: true,
        languageOptionsEnabled: supportsOnnxLanguageOptions(modelId),
      })
      this.activeModelId = modelId
      this.setEngineState({ state: 'ready', modelId })
    } catch (error) {
      await worker.terminate()
      this.activeWorker = null
      this.activeModelId = null
      const message = error instanceof Error ? error.message : 'Model loading failed.'
      this.setEngineState({ state: 'error', modelId, message })
      throw error
    }
  }

  /** Serializes local inference across microphone and speaker sources. */
  public transcribe(pcm: Uint8Array, language: string): Promise<string> {
    const run = this.inferenceQueue.then(async () => {
      const nativeModel = this.activeNativeModel
      if (nativeModel && this.engineState.state === 'ready') {
        const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
        const audio = new Float32Array(samples.length)
        for (let index = 0; index < samples.length; index += 1) {
          audio[index] = (samples[index] ?? 0) / 32_768
        }
        const result = await nativeModel.transcribe(audio, {
          timestamps: 'none',
          ...(language === 'auto' ? {} : { language }),
        })
        return result.text.trim()
      }
      const worker = this.activeWorker
      if (!worker || this.engineState.state !== 'ready') {
        throw new Error('Select and load a Local model before recording.')
      }
      return worker.transcribe(pcm, language)
    })
    this.inferenceQueue = run.catch(() => '')
    return run
  }

  /** Releases the selected pipeline and returns the engine to its unloaded state. */
  public async unload(): Promise<void> {
    const worker = this.activeWorker
    const nativeModel = this.activeNativeModel
    this.activeWorker = null
    this.activeNativeModel = null
    this.activeModelId = null
    if (worker) await worker.dispose()
    nativeModel?.dispose()
    this.setEngineState({ state: 'unloaded' })
  }

  /** Deletes one managed or explicitly discovered model while containing the target path. */
  public async delete(modelId: string): Promise<void> {
    if (this.downloads.has(modelId) || this.nativeDownloads.has(modelId)) {
      await this.cancelDownload(modelId)
    }
    if (this.activeModelId === modelId) await this.unload()

    const managed = await this.hasManagedMarker(modelId)
    const discovered = this.discovered.get(modelId)
    const partial =
      !managed && !discovered && (await directorySize(this.getManagedDirectory(modelId))) > 0
    if (!managed && !discovered && !partial) {
      throw new Error('The Local model is not installed or partially downloaded.')
    }

    const target =
      managed || partial
        ? requireContainedPath(this.managedRoot, this.getManagedDirectory(modelId))
        : resolveDiscoveredDeletionTarget(discovered as DiscoveredModel, this.modelsRoot)
    await rm(target, { recursive: true, force: true })
    await this.scanModelLocations()
    this.events.onModelsChanged(await this.getModels())
  }

  /** Converts one static catalog entry into current filesystem state. */
  private async toCatalogInfo(entry: LocalModelCatalogEntry): Promise<LocalModelInfo> {
    const managed = await this.hasManagedMarker(entry.id)
    const shared = this.discovered.get(entry.id)
    const partialBytes = managed ? 0 : await directorySize(this.getManagedDirectory(entry.id))
    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      family: entry.family ?? 'whisper',
      filename: entry.filename ?? `${entry.id} · q8 ONNX`,
      sizeBytes: entry.sizeBytes,
      license: entry.license,
      languages: [...entry.languages],
      supportsLanguageDetection: entry.supportsLanguageDetection,
      accuracyScore: entry.accuracyScore,
      speedScore: entry.speedScore,
      isRecommended: entry.isRecommended,
      isDownloaded: managed || Boolean(shared),
      isDownloading: this.downloads.has(entry.id) || this.nativeDownloads.has(entry.id),
      partialBytes,
      origin: managed ? 'managed' : (shared?.origin ?? 'catalog'),
      canDelete: managed || Boolean(shared) || partialBytes > 0,
      isCustom: false,
    }
  }

  /** Creates generic renderer metadata for a compatible shared-cache ASR model. */
  private toCustomInfo(model: DiscoveredModel): LocalModelInfo {
    return {
      id: model.id,
      name: model.id.split('/').at(-1) ?? model.id,
      description:
        model.origin === 'huggingface'
          ? 'Hugging Face önbelleğinde bulunan yerel ASR modeli.'
          : 'Models klasöründe bulunan yerel ASR modeli.',
      family: model.family,
      filename: basename(model.path),
      sizeBytes: 0,
      license: 'Model card',
      languages: [...LOCAL_TRANSCRIPTION_LANGUAGES],
      supportsLanguageDetection: true,
      accuracyScore: 0,
      speedScore: 0,
      isRecommended: false,
      isDownloaded: true,
      isDownloading: false,
      partialBytes: 0,
      origin: model.origin,
      canDelete: true,
      isCustom: true,
    }
  }

  /** Resolves an installed model to either its managed cache or external snapshot directory. */
  private async resolveModelSource(modelId: string): Promise<{
    modelSource: string
    cacheDirectory: string
    engine: 'transformers' | 'transcribe-cpp'
  } | null> {
    if (await this.hasManagedMarker(modelId)) {
      const cacheDirectory = this.getManagedDirectory(modelId)
      const entry = this.requireCatalogEntry(modelId)
      if (entry.engine === 'transcribe-cpp') {
        if (!entry.filename) throw new Error('Native model filename is missing.')
        return {
          modelSource: join(cacheDirectory, entry.filename),
          cacheDirectory,
          engine: 'transcribe-cpp',
        }
      }
      return {
        modelSource: resolveManagedModelBundle(cacheDirectory, modelId),
        cacheDirectory,
        engine: 'transformers',
      }
    }
    const shared = this.discovered.get(modelId)
    return shared
      ? {
          modelSource: shared.path,
          cacheDirectory: dirname(shared.path),
          engine: shared.engine,
        }
      : null
  }

  /** Refreshes compatible bundles in application and shared Hugging Face locations. */
  private async scanModelLocations(): Promise<void> {
    this.discovered.clear()
    await this.scanApplicationModels()
    await this.scanSharedCache()
  }

  /** Discovers manually copied ONNX snapshots and GGUF files under the Models directory. */
  private async scanApplicationModels(): Promise<void> {
    for (const filename of await safeReadFiles(this.modelsRoot)) {
      this.addDiscoveredNativeFile(join(this.modelsRoot, filename), filename, 'models-directory')
    }
    const directories = (await safeReadDirectories(this.modelsRoot)).filter(
      (directory) => directory !== basename(this.managedRoot),
    )
    for (const directory of directories) {
      const directPath = join(this.modelsRoot, directory)
      const directId = await readWhisperSnapshotId(directPath, `local/${directory}`)
      if (directId) {
        this.discovered.set(directId, {
          id: directId,
          path: directPath,
          origin: 'models-directory',
          engine: 'transformers',
          family: 'whisper',
        })
      }
      for (const filename of await safeReadFiles(directPath)) {
        this.addDiscoveredNativeFile(join(directPath, filename), filename, 'models-directory')
      }
      for (const child of await safeReadDirectories(directPath)) {
        const childPath = join(directPath, child)
        const childId = await readWhisperSnapshotId(childPath, `${directory}/${child}`)
        if (childId) {
          this.discovered.set(childId, {
            id: childId,
            path: childPath,
            origin: 'models-directory',
            engine: 'transformers',
            family: 'whisper',
          })
        }
        for (const filename of await safeReadFiles(childPath)) {
          this.addDiscoveredNativeFile(join(childPath, filename), filename, 'models-directory')
        }
      }
    }
  }

  /** Refreshes compatible snapshots in the user's standard Hugging Face hub cache. */
  private async scanSharedCache(): Promise<void> {
    const cacheRoot = resolveSharedHubCache()
    const repositories = await safeReadDirectories(cacheRoot)
    for (const repository of repositories) {
      if (!repository.startsWith('models--')) continue
      const encoded = repository.slice('models--'.length)
      const separatorIndex = encoded.indexOf('--')
      if (separatorIndex < 1) continue
      const modelId = `${encoded.slice(0, separatorIndex)}/${encoded.slice(separatorIndex + 2)}`
      const snapshotsRoot = join(cacheRoot, repository, 'snapshots')
      const snapshots = await safeReadDirectories(snapshotsRoot)
      for (const snapshot of snapshots.toReversed()) {
        const snapshotPath = join(snapshotsRoot, snapshot)
        const files = await safeReadFiles(snapshotPath)
        const catalogEntry = TRANSCRIBE_CPP_CATALOG.find((entry) => entry.id === modelId)
        const nativeFilename = catalogEntry?.filename
          ? files.find((filename) => filename === catalogEntry.filename)
          : files.find(isNativeModelFilename)
        if (nativeFilename) {
          this.discovered.set(catalogEntry?.id ?? `${modelId}/${nativeFilename}`, {
            id: catalogEntry?.id ?? `${modelId}/${nativeFilename}`,
            path: join(snapshotPath, nativeFilename),
            origin: 'huggingface',
            engine: 'transcribe-cpp',
            family: catalogEntry?.family ?? 'transcribe.cpp',
          })
          break
        }
        if (await readWhisperSnapshotId(snapshotPath, modelId)) {
          if (!this.discovered.has(modelId)) {
            this.discovered.set(modelId, {
              id: modelId,
              path: snapshotPath,
              origin: 'huggingface',
              engine: 'transformers',
              family: 'whisper',
            })
          }
          break
        }
      }
    }
  }

  /** Adds one compatible GGUF/GGML file while deduplicating known catalog filenames. */
  private addDiscoveredNativeFile(
    path: string,
    filename: string,
    origin: DiscoveredModel['origin'],
  ): void {
    if (!isNativeModelFilename(filename)) return
    const catalogEntry = TRANSCRIBE_CPP_CATALOG.find((entry) => entry.filename === filename)
    const id = catalogEntry?.id ?? `local/${filename}`
    this.discovered.set(id, {
      id,
      path,
      origin,
      engine: 'transcribe-cpp',
      family: catalogEntry?.family ?? 'transcribe.cpp',
    })
  }

  /** Returns the isolated managed cache directory for one catalog identifier. */
  private getManagedDirectory(modelId: string): string {
    return join(this.managedRoot, Buffer.from(modelId).toString('base64url'))
  }

  /** Checks the post-verification marker instead of trusting partial cache contents. */
  private async hasManagedMarker(modelId: string): Promise<boolean> {
    try {
      await stat(join(this.getManagedDirectory(modelId), COMPLETE_MARKER))
      return true
    } catch {
      return false
    }
  }

  /** Rejects download and delete requests for arbitrary paths or unknown IDs. */
  private requireCatalogEntry(modelId: string): LocalModelCatalogEntry {
    const entry = CATALOG.find((candidate) => candidate.id === modelId)
    if (!entry) throw new Error('Unknown Local model.')
    if (entry.engine === 'transcribe-cpp' && !supportsTranscribeCppPlatform()) {
      throw new Error('transcribe.cpp is not available for this platform architecture.')
    }
    return entry
  }

  /** Publishes and retains the latest local engine lifecycle state. */
  private setEngineState(state: LocalEngineStateEvent): void {
    this.engineState = state
    this.events.onEngineState(state)
  }
}

/** Recognizes the small worker response envelope before field access. */
const isWorkerResponse = (value: unknown): value is WorkerResponse => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.kind === 'string' && typeof candidate.requestId === 'number'
}

/** Resolves the standard Python Hugging Face hub cache without writing to it. */
const resolveSharedHubCache = (): string => {
  if (process.env.HF_HUB_CACHE) return process.env.HF_HUB_CACHE
  if (process.env.HF_HOME) return join(process.env.HF_HOME, 'hub')
  return join(homedir(), '.cache', 'huggingface', 'hub')
}

/** Rejects root, sibling, and absolute-relative escapes before destructive filesystem work. */
const requireContainedPath = (root: string, target: string): string => {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)
  const pathFromRoot = relative(resolvedRoot, resolvedTarget)
  if (
    !pathFromRoot ||
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error('Invalid model deletion path.')
  }
  return resolvedTarget
}

/** Maps one discovered file or bundle to the smallest complete model-owned deletion target. */
const resolveDiscoveredDeletionTarget = (model: DiscoveredModel, modelsRoot: string): string => {
  if (model.origin === 'models-directory') {
    return requireContainedPath(modelsRoot, model.path)
  }

  const cacheRoot = resolveSharedHubCache()
  const discoveredPath = requireContainedPath(cacheRoot, model.path)
  const repository = relative(resolve(cacheRoot), discoveredPath).split(/[\\/]/)[0]
  if (!repository?.startsWith('models--')) throw new Error('Invalid shared-cache model path.')
  return requireContainedPath(cacheRoot, join(cacheRoot, repository))
}

/** Reads directory names while treating an absent optional cache as empty. */
const safeReadDirectories = async (directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

/** Reads file names while treating an absent optional cache as empty. */
const safeReadFiles = async (directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  } catch {
    return []
  }
}

/** Restricts manual native discovery to formats accepted by transcribe.cpp. */
const isNativeModelFilename = (filename: string): boolean => {
  const normalized = filename.toLowerCase()
  return normalized.endsWith('.gguf') || normalized.endsWith('.bin')
}

/** Streams a large model file to disk and resumes only when the server honors Range. */
const downloadResumableFile = async (
  url: string,
  destination: string,
  expectedBytes: number,
  signal: AbortSignal,
  onProgress: (downloadedBytes: number, totalBytes: number) => void,
): Promise<void> => {
  const cachedBytes = await fileSize(destination)
  const existingBytes = expectedBytes > 0 && cachedBytes > expectedBytes ? 0 : cachedBytes
  const headers: Record<string, string> = {}
  if (existingBytes > 0) headers.Range = `bytes=${existingBytes}-`
  const response = await fetch(url, { headers, signal, redirect: 'follow' })
  if (response.status === 416 && existingBytes === expectedBytes) {
    onProgress(existingBytes, expectedBytes)
    return
  }
  if (!response.ok) throw new Error(`Model download failed with HTTP ${response.status}.`)
  if (!response.body) throw new Error('Model download returned an empty response body.')

  const resumed = existingBytes > 0 && response.status === 206
  let downloadedBytes = resumed ? existingBytes : 0
  const totalBytes = expectedBytes || Number(response.headers.get('content-length') ?? 0)
  const handle = await open(destination, resumed ? 'a' : 'w')
  const reader = response.body.getReader()
  try {
    while (true) {
      if (signal.aborted) throw new Error('Model download cancelled.')
      const chunk = await reader.read()
      if (chunk.done) break
      await handle.write(chunk.value)
      downloadedBytes += chunk.value.byteLength
      onProgress(downloadedBytes, totalBytes)
    }
  } finally {
    await handle.close()
    reader.releaseLock()
  }
}

/** Returns a lowercase SHA-256 digest without buffering a multi-gigabyte model. */
const sha256File = async (path: string): Promise<string> => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Returns a file size or zero when a resumable partial does not exist. */
const fileSize = async (path: string): Promise<number> => {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

/** Points the native loader at Electron's real ASAR-unpacked library directory. */
const configurePackagedTranscribeCppLibrary = async (): Promise<void> => {
  if (process.env.TRANSCRIBE_LIBRARY) return
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (!resourcesPath) return
  const tuple = transcribeCppPackageTuple(process.platform, process.arch)
  if (!tuple) return
  const libraryName =
    process.platform === 'win32'
      ? 'transcribe.dll'
      : process.platform === 'darwin'
        ? 'libtranscribe.dylib'
        : 'libtranscribe.so'
  const candidate = join(
    resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@transcribe-cpp',
    tuple,
    libraryName,
  )
  try {
    await stat(candidate)
    process.env.TRANSCRIBE_LIBRARY = candidate
  } catch {
    // Electron exposes resourcesPath during development too. In that case the binding resolves
    // its native package from node_modules without an explicit library override.
    return
  }
}

/** Maps supported Electron targets to the official native npm package tuple. */
const transcribeCppPackageTuple = (
  platform: NodeJS.Platform,
  architecture: string,
): string | null => {
  if (platform === 'win32' && architecture === 'x64') return 'win32-x64-cpu-vulkan'
  if (platform === 'linux' && architecture === 'x64') return 'linux-x64-cpu-vulkan'
  if (platform === 'linux' && architecture === 'arm64') return 'linux-arm64-cpu-vulkan'
  if (platform === 'darwin' && architecture === 'arm64') return 'darwin-arm64-metal'
  if (platform === 'darwin' && architecture === 'x64') return 'darwin-x64-cpu'
  return null
}

/** Reads a stable identifier only from complete Whisper snapshots with a q8 ONNX graph. */
const readWhisperSnapshotId = async (
  directory: string,
  fallbackId: string,
): Promise<string | null> => {
  try {
    const config = JSON.parse(await readFile(join(directory, 'config.json'), 'utf8')) as unknown
    if (!config || typeof config !== 'object') return null
    const record = config as Record<string, unknown>
    if (record.model_type !== 'whisper') return null
    const onnxFiles = await readdir(join(directory, 'onnx'))
    if (!onnxFiles.some((filename) => filename.endsWith('_quantized.onnx'))) return null
    const configuredId = record._name_or_path
    return typeof configuredId === 'string' && configuredId.includes('/')
      ? configuredId
      : fallbackId
  } catch {
    return null
  }
}

/** Measures cached bytes recursively for partial-download feedback. */
const directorySize = async (directory: string): Promise<number> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return directorySize(path)
        if (!entry.isFile()) return 0
        return (await stat(path)).size
      }),
    )
    return sizes.reduce((total, size) => total + size, 0)
  } catch {
    return 0
  }
}

/** Removes interrupted atomic cache writes while retaining every completed model file. */
const removeTemporaryCacheFiles = async (directory: string): Promise<void> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          await removeTemporaryCacheFiles(path)
        } else if (entry.isFile() && entry.name.includes('.tmp.')) {
          await rm(path, { force: true })
        }
      }),
    )
  } catch {
    // An absent partial directory requires no cleanup.
  }
}
