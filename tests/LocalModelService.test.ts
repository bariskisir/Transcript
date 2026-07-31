/**
 * Verifies local model catalog state and read-only Hugging Face cache discovery.
 */

import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LocalModelService, {
  resolveManagedModelBundle,
  supportsOnnxLanguageOptions,
  supportsTranscribeCppPlatform,
} from '../src/main/services/LocalModelService'
import type LoggerService from '../src/main/services/LoggerService'

describe('LocalModelService', () => {
  let temporaryRoot = ''
  let previousHubCache: string | undefined

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'transcript-local-models-'))
    previousHubCache = process.env.HF_HUB_CACHE
    process.env.HF_HUB_CACHE = join(temporaryRoot, 'hub')
  })

  afterEach(async () => {
    if (previousHubCache === undefined) delete process.env.HF_HUB_CACHE
    else process.env.HF_HUB_CACHE = previousHubCache
    await rm(temporaryRoot, { recursive: true, force: true })
  })

  /** Creates a service with inert event and logging dependencies. */
  const createService = (): LocalModelService =>
    new LocalModelService(
      join(temporaryRoot, 'models'),
      {
        onOperation: vi.fn(),
        onEngineState: vi.fn(),
        onModelsChanged: vi.fn(),
      },
      { error: vi.fn() } as unknown as LoggerService,
    )

  it('lists the complete Handy catalog alongside backward-compatible ONNX models', async () => {
    const service = createService()
    await service.initialize()
    const models = await service.getModels()

    expect(models.map((model) => model.id)).toContain('Xenova/whisper-base')
    expect(models.filter((model) => model.id.startsWith('handy-computer/'))).toHaveLength(67)
    expect(models.map((model) => model.id)).toContain('handy-computer/Qwen3-ASR-0.6B-gguf')
    expect(models.map((model) => model.id)).toContain('handy-computer/Qwen3-ASR-1.7B-gguf')
    expect(models.length).toBeGreaterThan(4)
    expect(models.find((model) => model.id === 'Xenova/whisper-base')?.languages).toContain('tr')
    expect(models.find((model) => model.id === 'Xenova/whisper-base.en')?.languages).toEqual(['en'])
    expect(models.every((model) => !model.isDownloaded)).toBe(true)
    expect(models.every((model) => model.origin === 'catalog')).toBe(true)
    const recommended = models.filter((model) => model.isRecommended)
    expect(recommended.length).toBeGreaterThan(0)
    expect(
      recommended.every((model) => model.name.toLocaleLowerCase('en-US').includes('qwen3')),
    ).toBe(true)
    expect(models.slice(0, recommended.length).every((model) => model.isRecommended)).toBe(true)
    expect(models[recommended.length]?.isRecommended).toBe(false)
    expect(recommended.map((model) => model.name)).toEqual(
      recommended
        .map((model) => model.name)
        .toSorted((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' })),
    )
  })

  it('resolves a managed cache to the concrete bundle used by worker-local loading', () => {
    expect(resolveManagedModelBundle('C:\\Models\\managed\\base', 'Xenova/whisper-base')).toBe(
      join('C:\\Models\\managed\\base', 'Xenova', 'whisper-base'),
    )
  })

  it('omits unsupported generation options for English-only Whisper models', () => {
    expect(supportsOnnxLanguageOptions('Xenova/whisper-base.en')).toBe(false)
    expect(supportsOnnxLanguageOptions('distil-whisper/distil-small.en')).toBe(false)
    expect(supportsOnnxLanguageOptions('Xenova/whisper-base')).toBe(true)
  })

  it('exposes native catalog support on Windows x64 and both Linux release targets', () => {
    expect(supportsTranscribeCppPlatform('win32', 'x64')).toBe(true)
    expect(supportsTranscribeCppPlatform('win32', 'arm64')).toBe(false)
    expect(supportsTranscribeCppPlatform('linux', 'x64')).toBe(true)
    expect(supportsTranscribeCppPlatform('linux', 'arm64')).toBe(true)
  })

  it('lists shared-cache models first and deletes only their model repository', async () => {
    const repository = join(process.env.HF_HUB_CACHE ?? '', 'models--acme--whisper-test')
    const snapshot = join(repository, 'snapshots', 'revision')
    await mkdir(join(snapshot, 'onnx'), { recursive: true })
    await writeFile(join(snapshot, 'config.json'), JSON.stringify({ model_type: 'whisper' }))
    await writeFile(join(snapshot, 'onnx', 'encoder_model_quantized.onnx'), '')

    const service = createService()
    await service.initialize()
    const model = (await service.getModels()).find(
      (candidate) => candidate.id === 'acme/whisper-test',
    )

    expect(model).toMatchObject({
      isDownloaded: true,
      origin: 'huggingface',
      canDelete: true,
      isCustom: true,
    })
    expect((await service.getModels())[0]?.id).toBe('acme/whisper-test')

    await service.delete('acme/whisper-test')

    await expect(stat(repository)).rejects.toThrow()
    expect(
      (await service.getModels()).some((candidate) => candidate.id === 'acme/whisper-test'),
    ).toBe(false)
  })

  it('scans manually copied Whisper bundles in the application Models directory', async () => {
    const snapshot = join(temporaryRoot, 'models', 'my-whisper')
    await mkdir(join(snapshot, 'onnx'), { recursive: true })
    await writeFile(
      join(snapshot, 'config.json'),
      JSON.stringify({ model_type: 'whisper', _name_or_path: 'local/my-whisper' }),
    )
    await writeFile(join(snapshot, 'onnx', 'decoder_model_quantized.onnx'), '')

    const service = createService()
    await service.initialize()
    const model = (await service.getModels()).find(
      (candidate) => candidate.id === 'local/my-whisper',
    )

    expect(model).toMatchObject({
      origin: 'models-directory',
      isDownloaded: true,
      canDelete: true,
    })
  })

  it('scans manually copied GGUF models for the native TypeScript binding', async () => {
    const modelPath = join(temporaryRoot, 'models', 'custom-asr.gguf')
    await mkdir(join(temporaryRoot, 'models'), { recursive: true })
    await writeFile(modelPath, 'GGUF')

    const service = createService()
    await service.initialize()
    const model = (await service.getModels()).find(
      (candidate) => candidate.id === 'local/custom-asr.gguf',
    )

    expect(model).toMatchObject({
      family: 'transcribe.cpp',
      origin: 'models-directory',
      isDownloaded: true,
      canDelete: true,
    })
  })
})
