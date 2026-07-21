/**
 * Exposes a typed, capability-limited IPC API to the sandboxed renderer.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import type {
  AppErrorEvent,
  SessionStateEvent,
  TranscriptApi,
  TranscriptResultEvent,
  TranslationResultEvent,
  UpdateStateEvent,
} from '@shared/types'

/** Subscribes to one approved event and returns a cleanup callback. */
const subscribe = <T>(channel: IpcChannel, listener: (payload: T) => void): (() => void) => {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: TranscriptApi = {
  /** Loads settings, transcript history, credential status, and application metadata. */
  bootstrap: () => ipcRenderer.invoke(IpcChannel.AppBootstrap),
  /** Atomically merges validated application settings fields. */
  saveSettings: (patch) => ipcRenderer.invoke(IpcChannel.SettingsSave, patch),
  /** Validates, encrypts, and saves a Deepgram API key. */
  saveApiKey: (apiKey) => ipcRenderer.invoke(IpcChannel.CredentialsSave, apiKey),
  /** Retrieves the decrypted Deepgram API key only when requested by settings. */
  getApiKey: () => ipcRenderer.invoke(IpcChannel.CredentialsGet),
  /** Deletes the encrypted Deepgram API key. */
  deleteApiKey: () => ipcRenderer.invoke(IpcChannel.CredentialsDelete),
  /** Retrieves optional balance data for the encrypted Deepgram API key. */
  getApiBalance: () => ipcRenderer.invoke(IpcChannel.CredentialsBalance),
  /** Opens one Deepgram stream for every enabled audio source. */
  startSession: (request) => ipcRenderer.invoke(IpcChannel.SessionStart, request),
  /** Flushes and closes the active transcription session. */
  stopSession: () => ipcRenderer.invoke(IpcChannel.SessionStop),
  /** Sends one bounded source-specific PCM16 frame. */
  sendAudio: (source, samples) =>
    ipcRenderer.send(IpcChannel.AudioChunk, { source, samples: new Uint8Array(samples) }),
  /** Creates one empty local transcript. */
  createTranscript: (language) => ipcRenderer.invoke(IpcChannel.TranscriptCreate, language),
  /** Loads one complete local transcript. */
  getTranscript: (id) => ipcRenderer.invoke(IpcChannel.TranscriptGet, id),
  /** Renames one local transcript. */
  renameTranscript: (id, title) => ipcRenderer.invoke(IpcChannel.TranscriptRename, { id, title }),
  /** Deletes one local transcript. */
  deleteTranscript: (id) => ipcRenderer.invoke(IpcChannel.TranscriptDelete, id),
  /** Changes the provider/target and schedules existing transcript text for translation. */
  translateTranscript: (id, provider, targetLanguage) =>
    ipcRenderer.invoke(IpcChannel.TranscriptTranslate, id, provider, targetLanguage),
  /** Opens a native dialog and exports one transcript. */
  exportTranscript: (id, format, dialogTitle, provider, targetLanguage) =>
    ipcRenderer.invoke(
      IpcChannel.TranscriptExport,
      id,
      format,
      dialogTitle,
      provider,
      targetLanguage,
    ),
  /** Changes the native always-on-top window state. */
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke(IpcChannel.WindowAlwaysOnTop, enabled),
  /** Synchronizes native title-bar colors with the renderer theme. */
  setTheme: (theme) => ipcRenderer.invoke(IpcChannel.ThemeSet, theme),
  /** Opens one allow-listed HTTPS URL in the system browser. */
  openExternal: (url) => ipcRenderer.invoke(IpcChannel.ShellOpenExternal, url),
  /** Opens the AppData log directory in the operating-system file manager. */
  openLogsDirectory: () => ipcRenderer.invoke(IpcChannel.LogsOpenDirectory),
  /** Forwards one renderer diagnostic to the configured main logger. */
  writeLog: (entry) => ipcRenderer.send(IpcChannel.LogWrite, entry),
  /** Checks GitHub Releases for a newer application version. */
  checkForUpdates: () => ipcRenderer.invoke(IpcChannel.UpdatesCheck),
  /** Restarts and installs a downloaded update. */
  installUpdate: () => ipcRenderer.invoke(IpcChannel.UpdatesInstall),
  /** Subscribes to recording lifecycle events. */
  onSessionState: (listener) => subscribe<SessionStateEvent>(IpcChannel.SessionState, listener),
  /** Subscribes to interim and final transcript results. */
  onTranscriptResult: (listener) =>
    subscribe<TranscriptResultEvent>(IpcChannel.TranscriptResult, listener),
  /** Subscribes to persisted sentence translations. */
  onTranslationResult: (listener) =>
    subscribe<TranslationResultEvent>(IpcChannel.TranslationResult, listener),
  /** Subscribes to recoverable application errors. */
  onError: (listener) => subscribe<AppErrorEvent>(IpcChannel.AppError, listener),
  /** Subscribes to updater lifecycle progress. */
  onUpdateState: (listener) => subscribe<UpdateStateEvent>(IpcChannel.UpdateState, listener),
}

contextBridge.exposeInMainWorld('transcript', api)
