/**
 * Enumerates every IPC channel exposed by the desktop application.
 */

export enum IpcChannel {
  AppBootstrap = 'app:bootstrap',
  SettingsSave = 'settings:save',
  CredentialsSave = 'credentials:save',
  CredentialsGet = 'credentials:get',
  CredentialsDelete = 'credentials:delete',
  CredentialsBalance = 'credentials:balance',
  SessionStart = 'session:start',
  SessionStop = 'session:stop',
  AudioChunk = 'audio:chunk',
  TranscriptCreate = 'transcript:create',
  TranscriptGet = 'transcript:get',
  TranscriptRename = 'transcript:rename',
  TranscriptDelete = 'transcript:delete',
  TranscriptExport = 'transcript:export',
  WindowAlwaysOnTop = 'window:always-on-top',
  ThemeSet = 'theme:set',
  ShellOpenExternal = 'shell:open-external',
  LogsOpenDirectory = 'logs:open-directory',
  LogWrite = 'logs:write',
  UpdatesCheck = 'updates:check',
  UpdatesInstall = 'updates:install',
  SessionState = 'event:session-state',
  TranscriptResult = 'event:transcript-result',
  AppError = 'event:error',
  UpdateState = 'event:update-state',
}
