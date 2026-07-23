/**
 * Defines the validated IPC boundary between the renderer and main-process services.
 */

import { writeFile } from 'node:fs/promises'
import { app, dialog, ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import { APP_AUTHOR_URL } from '@shared/appInfo'
import { TRANSLATION_PROVIDERS, TRANSLATION_TARGET_LANGUAGES } from '@shared/translation'
import {
  AUDIO_SOURCES,
  LOG_LEVELS,
  TRANSCRIPT_FORMATS,
  type StartSessionRequest,
  type UpdateStateEvent,
} from '@shared/types'
import { z } from 'zod'
import { settingsPatchSchema, settingsSchema } from './settingsSchema'
import type AppUpdater from './services/AppUpdater'
import type CredentialService from './services/CredentialService'
import type DeepgramAccountService from './services/DeepgramAccountService'
import { renderTranscript } from './services/ExportService'
import type LoggerService from './services/LoggerService'
import type StorageService from './services/StorageService'
import type TranscriptService from './services/TranscriptService'

const startSchema = z.object({
  settings: settingsSchema,
  transcriptId: z.uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
})
const audioSchema = z.object({
  source: z.enum(AUDIO_SOURCES),
  samples: z.instanceof(Uint8Array).refine((value) => value.byteLength <= 256_000),
})
const transcriptIdSchema = z.uuid()
const transcriptLanguageSchema = z.string().trim().min(1).max(24)
const transcriptRenameSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
})
const formatSchema = z.enum(TRANSCRIPT_FORMATS)
const dialogTitleSchema = z.string().trim().min(1).max(120)
const translationProviderSchema = z.enum(TRANSLATION_PROVIDERS)
const translationTargetSchema = z.enum(TRANSLATION_TARGET_LANGUAGES)
const apiKeySchema = z.string().trim().min(20).max(512)
const rendererLogSchema = z.object({
  level: z.enum(LOG_LEVELS),
  module: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1_000),
  details: z.string().max(8_000).optional(),
})

const TRUSTED_EXTERNAL_ORIGINS = new Set([
  'https://deepgram.com',
  'https://console.deepgram.com',
  'https://developers.deepgram.com',
  'https://github.com',
  APP_AUTHOR_URL,
])

interface IpcServices {
  storage: StorageService
  credentials: CredentialService
  deepgramAccount: DeepgramAccountService
  transcript: TranscriptService
  updater: AppUpdater
  logger: LoggerService
}

/** Removes previous handlers before a replacement window is attached. */
export const removeIpcHandlers = (): void => {
  Object.values(IpcChannel).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })
  ipcMain.removeAllListeners(IpcChannel.AudioChunk)
  ipcMain.removeAllListeners(IpcChannel.LogWrite)
}

/** Registers all renderer commands against explicit main-process services. */
export const registerIpc = (window: BrowserWindow, services: IpcServices): void => {
  removeIpcHandlers()

  /** Rejects any IPC call not originating from the main renderer. */
  const assertSender = (sender: WebContents): void => {
    if (sender.id !== window.webContents.id) throw new Error('Untrusted IPC sender.')
  }

  /** Sends a typed event only while the window is alive. */
  const send = <T>(channel: IpcChannel, payload: T): void => {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }

  services.updater.initialize((event: UpdateStateEvent) => send(IpcChannel.UpdateState, event))

  ipcMain.handle(IpcChannel.AppBootstrap, async (event) => {
    assertSender(event.sender)
    const [settings, initialTranscripts, hasApiKey] = await Promise.all([
      services.storage.loadSettings(),
      services.storage.listTranscripts(),
      services.credentials.hasApiKey(),
    ])
    if (initialTranscripts.length === 0) {
      await services.storage.createTranscript(
        settings.transcriptionProviderSettings.deepgram.language,
      )
    }
    const transcripts =
      initialTranscripts.length === 0
        ? await services.storage.listTranscripts()
        : initialTranscripts
    const firstTranscript = transcripts[0]
    if (!firstTranscript) throw new Error('Transcript workspace could not be initialized.')
    const currentTranscript = await services.storage.getTranscript(firstTranscript.id)
    return {
      settings,
      transcripts,
      currentTranscript,
      hasApiKey,
      platform: process.platform,
      version: app.getVersion(),
    }
  })
  ipcMain.handle(IpcChannel.SettingsSave, async (event, input: unknown) => {
    assertSender(event.sender)
    const patch = settingsPatchSchema.parse(input)
    const savedSettings = await services.storage.updateSettings(patch)
    window.setAlwaysOnTop(savedSettings.alwaysOnTop)
    services.logger.setLevel(savedSettings.logLevel)
    return savedSettings
  })
  ipcMain.handle(IpcChannel.CredentialsSave, async (event, input: unknown) => {
    assertSender(event.sender)
    const apiKey = apiKeySchema.parse(input)
    const balance = await services.deepgramAccount.verifyAndGetBalance(apiKey)
    await services.credentials.saveApiKey(apiKey)
    return balance
  })
  ipcMain.handle(IpcChannel.CredentialsGet, async (event) => {
    assertSender(event.sender)
    return services.credentials.getApiKey()
  })
  ipcMain.handle(IpcChannel.CredentialsDelete, async (event) => {
    assertSender(event.sender)
    await services.credentials.deleteApiKey()
  })
  ipcMain.handle(IpcChannel.CredentialsBalance, async (event) => {
    assertSender(event.sender)
    const apiKey = await services.credentials.getApiKey()
    return apiKey ? services.deepgramAccount.getBalance(apiKey) : []
  })
  ipcMain.handle(IpcChannel.SessionStart, async (event, input: unknown) => {
    assertSender(event.sender)
    const parsed = startSchema.parse(input)
    const request: StartSessionRequest = {
      settings: parsed.settings,
      ...(parsed.transcriptId ? { transcriptId: parsed.transcriptId } : {}),
      ...(parsed.title ? { title: parsed.title } : {}),
    }
    if (request.settings.speakerEnabled && process.platform !== 'win32') {
      throw new Error('Speaker loopback capture is currently available on Windows only.')
    }
    return services.transcript.start(request)
  })
  ipcMain.handle(IpcChannel.SessionStop, async (event) => {
    assertSender(event.sender)
    return services.transcript.stop()
  })
  ipcMain.on(IpcChannel.AudioChunk, (event, input: unknown) => {
    assertSender(event.sender)
    const parsed = audioSchema.safeParse(input)
    if (parsed.success && parsed.data.samples.byteLength > 0) {
      services.transcript.sendAudio(parsed.data.source, parsed.data.samples)
    }
  })
  ipcMain.handle(IpcChannel.TranscriptCreate, async (event, input: unknown) => {
    assertSender(event.sender)
    return services.storage.createTranscript(transcriptLanguageSchema.parse(input))
  })
  ipcMain.handle(IpcChannel.TranscriptGet, async (event, input: unknown) => {
    assertSender(event.sender)
    return services.storage.getTranscript(transcriptIdSchema.parse(input))
  })
  ipcMain.handle(IpcChannel.TranscriptRename, async (event, input: unknown) => {
    assertSender(event.sender)
    const { id, title } = transcriptRenameSchema.parse(input)
    return services.storage.renameTranscript(id, title)
  })
  ipcMain.handle(IpcChannel.TranscriptDelete, async (event, input: unknown) => {
    assertSender(event.sender)
    return services.storage.deleteTranscript(transcriptIdSchema.parse(input))
  })
  ipcMain.handle(
    IpcChannel.TranscriptTranslate,
    async (
      event,
      idInput: unknown,
      enabledInput: unknown,
      providerInput: unknown,
      targetInput: unknown,
    ) => {
      assertSender(event.sender)
      await services.transcript.translateTranscript(
        transcriptIdSchema.parse(idInput),
        z.boolean().parse(enabledInput),
        translationProviderSchema.parse(providerInput),
        translationTargetSchema.parse(targetInput),
      )
    },
  )
  ipcMain.handle(
    IpcChannel.TranscriptExport,
    async (
      event,
      idInput: unknown,
      formatInput: unknown,
      dialogTitleInput: unknown,
      includeTranslationInput: unknown,
      providerInput: unknown,
      targetInput: unknown,
    ) => {
      assertSender(event.sender)
      const format = formatSchema.parse(formatInput)
      const dialogTitle = dialogTitleSchema.parse(dialogTitleInput)
      const includeTranslation = z.boolean().parse(includeTranslationInput)
      const provider = translationProviderSchema.parse(providerInput)
      const targetLanguage = translationTargetSchema.parse(targetInput)
      const transcript = await services.storage.getTranscript(transcriptIdSchema.parse(idInput))
      const result = await dialog.showSaveDialog(window, {
        title: dialogTitle,
        defaultPath: `${transcript.title.replace(/[<>:"/\\|?*]/g, '-')}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      })
      if (result.canceled || !result.filePath) return false
      await writeFile(
        result.filePath,
        renderTranscript(transcript, format, includeTranslation, provider, targetLanguage),
        'utf8',
      )
      return true
    },
  )
  ipcMain.handle(IpcChannel.WindowAlwaysOnTop, (event, enabled: unknown) => {
    assertSender(event.sender)
    if (typeof enabled !== 'boolean') throw new Error('Invalid window preference.')
    window.setAlwaysOnTop(enabled)
  })
  ipcMain.handle(IpcChannel.ThemeSet, (event, theme: unknown) => {
    assertSender(event.sender)
    if (theme !== 'light' && theme !== 'dark') throw new Error('Invalid theme.')
    window.setTitleBarOverlay({
      color: theme === 'dark' ? '#1f1f1f' : '#f4f4f4',
      symbolColor: theme === 'dark' ? '#ffffff99' : '#00000099',
      height: 42,
    })
  })
  ipcMain.handle(IpcChannel.ShellOpenExternal, async (event, input: unknown) => {
    assertSender(event.sender)
    if (typeof input !== 'string') throw new Error('Invalid external URL.')
    const url = new URL(input)
    if (!TRUSTED_EXTERNAL_ORIGINS.has(url.origin)) throw new Error('This URL is not allowed.')
    await shell.openExternal(url.toString())
  })
  ipcMain.handle(IpcChannel.LogsOpenDirectory, async (event) => {
    assertSender(event.sender)
    const error = await shell.openPath(services.logger.getLogsDirectory())
    if (error) throw new Error(error)
  })
  ipcMain.on(IpcChannel.LogWrite, (event, input: unknown) => {
    assertSender(event.sender)
    const parsed = rendererLogSchema.safeParse(input)
    if (parsed.success) {
      services.logger.writeRenderer({
        level: parsed.data.level,
        module: parsed.data.module,
        message: parsed.data.message,
        ...(parsed.data.details === undefined ? {} : { details: parsed.data.details }),
      })
    }
  })
  ipcMain.handle(IpcChannel.UpdatesCheck, async (event) => {
    assertSender(event.sender)
    await services.updater.checkForUpdates()
  })
  ipcMain.handle(IpcChannel.UpdatesInstall, async (event) => {
    assertSender(event.sender)
    await services.transcript.stop()
    await services.updater.quitAndInstall()
  })
}
