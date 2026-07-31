/**
 * Defines serializable local-model catalog, download, and engine lifecycle contracts.
 */

export const LOCAL_MODEL_ORIGINS = [
  'catalog',
  'managed',
  'models-directory',
  'huggingface',
] as const
export const LOCAL_MODEL_OPERATION_PHASES = [
  'downloading',
  'verifying',
  'ready',
  'cancelled',
  'error',
] as const
export const LOCAL_ENGINE_STATES = ['unloaded', 'loading', 'ready', 'error'] as const

/** Whisper language identifiers ordered with the most common choices first. */
export const LOCAL_TRANSCRIPTION_LANGUAGES = [
  'en',
  'tr',
  'es',
  'zh',
  'hi',
  'ar',
  'pt',
  'fr',
  'de',
  'ru',
  'ja',
  'ko',
  'id',
  'it',
  'nl',
  'pl',
  'uk',
  'vi',
  'th',
  'fa',
  'ca',
  'sv',
  'he',
  'fi',
  'el',
  'ms',
  'cs',
  'ro',
  'da',
  'hu',
  'ta',
  'no',
  'ur',
  'hr',
  'bg',
  'lt',
  'la',
  'mi',
  'ml',
  'cy',
  'sk',
  'te',
  'lv',
  'bn',
  'sr',
  'az',
  'sl',
  'kn',
  'et',
  'mk',
  'br',
  'eu',
  'is',
  'hy',
  'ne',
  'mn',
  'bs',
  'kk',
  'sq',
  'sw',
  'gl',
  'mr',
  'pa',
  'si',
  'km',
  'sn',
  'yo',
  'so',
  'af',
  'oc',
  'ka',
  'be',
  'tg',
  'sd',
  'gu',
  'am',
  'yi',
  'lo',
  'uz',
  'fo',
  'ht',
  'ps',
  'tk',
  'nn',
  'mt',
  'sa',
  'lb',
  'my',
  'bo',
  'tl',
  'mg',
  'as',
  'tt',
  'haw',
  'ln',
  'ha',
  'ba',
  'jw',
  'su',
  'yue',
] as const

/** Describes where the currently usable copy of a local model resides. */
export type LocalModelOrigin = (typeof LOCAL_MODEL_ORIGINS)[number]
/** Describes one model download or verification transition. */
export type LocalModelOperationPhase = (typeof LOCAL_MODEL_OPERATION_PHASES)[number]
/** Describes the worker-hosted local transcription engine lifecycle. */
export type LocalEngineState = (typeof LOCAL_ENGINE_STATES)[number]

/** Renderer-safe metadata for one catalog or locally discovered ASR model bundle. */
export interface LocalModelInfo {
  id: string
  name: string
  description: string
  family: string
  filename: string
  sizeBytes: number
  license: string
  languages: string[]
  supportsLanguageDetection: boolean
  accuracyScore: number
  speedScore: number
  isRecommended: boolean
  isDownloaded: boolean
  isDownloading: boolean
  partialBytes: number
  origin: LocalModelOrigin
  canDelete: boolean
  isCustom: boolean
}

/** Incremental status for a managed local-model download. */
export interface LocalModelOperationEvent {
  modelId: string
  phase: LocalModelOperationPhase
  downloadedBytes?: number
  totalBytes?: number
  percentage?: number
  bytesPerSecond?: number
  message?: string
}

/** Native model loading status shared by settings and recording flows. */
export interface LocalEngineStateEvent {
  state: LocalEngineState
  modelId?: string
  message?: string
}
