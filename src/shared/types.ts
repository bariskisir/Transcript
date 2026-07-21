/**
 * Defines serializable domain models and cross-process application contracts.
 */

import type { DeepgramDiarization, DeepgramModel, DeepgramRedaction } from './deepgram'

export const AUDIO_SOURCES = ['microphone', 'speaker'] as const
export const APP_LOCALES = ['en', 'tr', 'de', 'fr', 'pt', 'zh', 'es'] as const
export const THEME_MODES = ['system', 'light', 'dark'] as const
export const TIME_FORMATS = ['24-hour', '12-hour'] as const
export const TRANSCRIPT_FORMATS = ['txt', 'json'] as const
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose'] as const

export type AudioSource = (typeof AUDIO_SOURCES)[number]
export type AppLocale = (typeof APP_LOCALES)[number]
export type ThemeMode = (typeof THEME_MODES)[number]
export type TimeFormat = (typeof TIME_FORMATS)[number]
export type TranscriptFormat = (typeof TRANSCRIPT_FORMATS)[number]
export type LogLevel = (typeof LOG_LEVELS)[number]
export type DesktopPlatform = 'win32' | 'darwin' | 'linux'

export interface AppSettings {
  settingsRevision: 3
  uiLanguage: AppLocale
  theme: ThemeMode
  timeFormat: TimeFormat
  language: string
  model: DeepgramModel
  modelVersion: string
  microphoneDeviceId: string
  microphoneEnabled: boolean
  speakerDeviceId: string
  speakerEnabled: boolean
  punctuate: boolean
  smartFormat: boolean
  numerals: boolean
  profanityFilter: boolean
  diarization: DeepgramDiarization
  redaction: DeepgramRedaction
  endpointingMs: number
  utteranceEndEnabled: boolean
  utteranceEndMs: number
  vocabulary: string[]
  mipOptOut: boolean
  alwaysOnTop: boolean
  autoUpdate: boolean
  logLevel: LogLevel
}

export type AppSettingsPatch = {
  [Key in keyof Omit<AppSettings, 'settingsRevision'>]?: AppSettings[Key] | undefined
}

export const DEFAULT_SETTINGS: AppSettings = {
  settingsRevision: 3,
  uiLanguage: 'en',
  theme: 'system',
  timeFormat: '24-hour',
  language: 'en',
  model: 'nova-3',
  modelVersion: 'latest',
  microphoneDeviceId: 'default',
  microphoneEnabled: true,
  speakerDeviceId: 'default',
  speakerEnabled: true,
  punctuate: true,
  smartFormat: true,
  numerals: true,
  profanityFilter: false,
  diarization: 'off',
  redaction: 'none',
  endpointingMs: 10,
  utteranceEndEnabled: true,
  utteranceEndMs: 1_000,
  vocabulary: [],
  mipOptOut: false,
  alwaysOnTop: false,
  autoUpdate: true,
  logLevel: 'info',
}

export interface TranscriptSegment {
  id: string
  source: AudioSource
  text: string
  confidence: number
  createdAt: string
  offsetMs: number
}

export interface TranscriptDocument {
  id: string
  title: string
  isDefaultTitle: boolean
  language: string
  createdAt: string
  updatedAt: string
  durationMs: number
  segments: TranscriptSegment[]
}

export interface TranscriptSummary {
  id: string
  title: string
  isDefaultTitle: boolean
  language: string
  createdAt: string
  updatedAt: string
  durationMs: number
  segmentCount: number
  preview: string
}

export interface BootstrapPayload {
  settings: AppSettings
  transcripts: TranscriptSummary[]
  currentTranscript: TranscriptDocument
  hasApiKey: boolean
  platform: DesktopPlatform
  version: string
}

export interface StartSessionRequest {
  settings: AppSettings
  transcriptId?: string
  title?: string
}

export interface StartSessionResult {
  transcript: TranscriptDocument
  activeSources: AudioSource[]
}

export interface DeleteTranscriptResult {
  deleted: boolean
  replacement?: TranscriptDocument
}

export interface DeepgramBalance {
  amount: number
  units: string
}

export interface SessionStateEvent {
  state: 'idle' | 'connecting' | 'recording' | 'stopping'
  transcriptId?: string
  startedAt?: string
}

export interface TranscriptResultEvent {
  source: AudioSource
  text: string
  isFinal: boolean
  speechFinal: boolean
  confidence: number
  segment?: TranscriptSegment
}

export interface AppErrorEvent {
  source?: AudioSource
  message: string
  recoverable: boolean
}

export interface RendererLogEntry {
  level: LogLevel
  module: string
  message: string
  details?: string
}

export interface UpdateStateEvent {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  version?: string
  percent?: number
  releaseNotes?: string
  message?: string
}

export interface TranscriptApi {
  /** Loads persisted settings, history, and application metadata. */
  bootstrap(): Promise<BootstrapPayload>
  /** Atomically merges and persists validated application settings fields. */
  saveSettings(patch: AppSettingsPatch): Promise<AppSettings>
  /** Validates, encrypts, and persists a Deepgram key, returning supported balance data. */
  saveApiKey(apiKey: string): Promise<DeepgramBalance[]>
  /** Decrypts the saved Deepgram key for the explicit settings credential field. */
  getApiKey(): Promise<string | null>
  /** Removes the encrypted Deepgram key. */
  deleteApiKey(): Promise<void>
  /** Retrieves optional Deepgram balance data for the encrypted key. */
  getApiBalance(): Promise<DeepgramBalance[]>
  /** Starts a new source-separated transcription session. */
  startSession(request: StartSessionRequest): Promise<StartSessionResult>
  /** Flushes and stops the active transcription session. */
  stopSession(): Promise<TranscriptDocument | null>
  /** Sends one source-specific PCM16 audio frame. */
  sendAudio(source: AudioSource, samples: ArrayBuffer): void
  /** Creates and persists one empty transcript workspace. */
  createTranscript(language: string): Promise<TranscriptDocument>
  /** Loads one complete transcript. */
  getTranscript(id: string): Promise<TranscriptDocument>
  /** Renames one transcript and returns the updated document. */
  renameTranscript(id: string, title: string): Promise<TranscriptDocument>
  /** Deletes one transcript while preserving the last-workspace invariant. */
  deleteTranscript(id: string): Promise<DeleteTranscriptResult>
  /** Exports a transcript through a native save dialog. */
  exportTranscript(id: string, format: TranscriptFormat, dialogTitle: string): Promise<boolean>
  /** Changes the native always-on-top state. */
  setAlwaysOnTop(enabled: boolean): Promise<void>
  /** Synchronizes native window chrome with the resolved renderer theme. */
  setTheme(theme: Exclude<ThemeMode, 'system'>): Promise<void>
  /** Opens an allow-listed URL in the system browser. */
  openExternal(url: string): Promise<void>
  /** Opens the application log directory in the operating-system file manager. */
  openLogsDirectory(): Promise<void>
  /** Persists one validated renderer diagnostic through the main logger. */
  writeLog(entry: RendererLogEntry): void
  /** Checks GitHub Releases for an application update. */
  checkForUpdates(): Promise<void>
  /** Restarts and installs a downloaded update. */
  installUpdate(): Promise<void>
  /** Subscribes to recording lifecycle events. */
  onSessionState(listener: (event: SessionStateEvent) => void): () => void
  /** Subscribes to interim and final transcription results. */
  onTranscriptResult(listener: (event: TranscriptResultEvent) => void): () => void
  /** Subscribes to recoverable application errors. */
  onError(listener: (event: AppErrorEvent) => void): () => void
  /** Subscribes to updater lifecycle events. */
  onUpdateState(listener: (event: UpdateStateEvent) => void): () => void
}
