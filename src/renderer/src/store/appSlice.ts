/**
 * Stores application settings, runtime recording state, history, and update progress.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type BootstrapPayload,
  type DeepgramBalance,
  type SessionStateEvent,
  type TranscriptDocument,
  type TranscriptResultEvent,
  type TranscriptSummary,
  type TranslationResultEvent,
  type UpdateStateEvent,
} from '@shared/types'

export type AppPage = 'home' | 'settings'
export type SettingsSection = 'general' | 'transcription' | 'translation' | 'updates' | 'about'

export interface AppState {
  initialized: boolean
  page: AppPage
  settingsSection: SettingsSection
  settings: AppSettings
  platform: BootstrapPayload['platform']
  version: string
  hasApiKey: boolean
  apiBalance: DeepgramBalance[]
  history: TranscriptSummary[]
  currentTranscript: TranscriptDocument | null
  session: SessionStateEvent
  interim: { microphone: string; speaker: string }
  levels: { microphone: number; speaker: number }
  update: UpdateStateEvent
  transcriptSidebarOpen: boolean
  compactMode: boolean
}

const initialState: AppState = {
  initialized: false,
  page: 'home',
  settingsSection: 'general',
  settings: DEFAULT_SETTINGS,
  platform: 'win32',
  version: '0.0.0',
  hasApiKey: false,
  apiBalance: [],
  history: [],
  currentTranscript: null,
  session: { state: 'idle' },
  interim: { microphone: '', speaker: '' },
  levels: { microphone: 0, speaker: 0 },
  update: { state: 'idle' },
  transcriptSidebarOpen: true,
  compactMode: false,
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    /** Hydrates the renderer with persisted main-process state. */
    hydrate(state, action: PayloadAction<BootstrapPayload>) {
      if (state.initialized) return
      state.initialized = true
      state.settings = action.payload.settings
      state.platform = action.payload.platform
      state.version = action.payload.version
      state.hasApiKey = action.payload.hasApiKey
      state.history = action.payload.transcripts
      state.currentTranscript = action.payload.currentTranscript
    },
    /** Opens a top-level application page. */
    setPage(state, action: PayloadAction<AppPage>) {
      state.page = action.payload
      if (action.payload !== 'home') state.compactMode = false
    },
    /** Selects the settings category shown when the settings page is opened. */
    setSettingsSection(state, action: PayloadAction<SettingsSection>) {
      state.settingsSection = action.payload
    },
    /** Replaces settings after successful persistence. */
    setSettings(state, action: PayloadAction<AppSettings>) {
      state.settings = action.payload
    },
    /** Updates whether a Deepgram credential is available. */
    setHasApiKey(state, action: PayloadAction<boolean>) {
      state.hasApiKey = action.payload
    },
    /** Replaces optional Deepgram project balance data. */
    setApiBalance(state, action: PayloadAction<DeepgramBalance[]>) {
      state.apiBalance = action.payload
    },
    /** Replaces transcript history from local storage. */
    setHistory(state, action: PayloadAction<TranscriptSummary[]>) {
      state.history = action.payload
    },
    /** Inserts a newly created summary at the front without duplicating its identifier. */
    addHistorySummary(state, action: PayloadAction<TranscriptSummary>) {
      state.history = [
        action.payload,
        ...state.history.filter((item) => item.id !== action.payload.id),
      ]
    },
    /** Replaces a known summary in place, or inserts it when history was not yet synchronized. */
    replaceHistorySummary(state, action: PayloadAction<TranscriptSummary>) {
      const index = state.history.findIndex((item) => item.id === action.payload.id)
      if (index === -1) state.history.unshift(action.payload)
      else state.history[index] = action.payload
    },
    /** Removes one transcript summary by its durable identifier. */
    removeHistorySummary(state, action: PayloadAction<string>) {
      state.history = state.history.filter((item) => item.id !== action.payload)
    },
    /** Sets the transcript displayed in the main reading surface. */
    setCurrentTranscript(state, action: PayloadAction<TranscriptDocument | null>) {
      state.currentTranscript = action.payload
      state.interim = { microphone: '', speaker: '' }
    },
    /** Refreshes a document only when it is still the active transcript. */
    replaceCurrentTranscript(state, action: PayloadAction<TranscriptDocument>) {
      if (state.currentTranscript?.id === action.payload.id) {
        state.currentTranscript = action.payload
        state.interim = { microphone: '', speaker: '' }
      }
    },
    /** Applies a recording lifecycle event. */
    setSessionState(state, action: PayloadAction<SessionStateEvent>) {
      state.session = action.payload
      if (action.payload.state === 'idle') {
        state.levels = { microphone: 0, speaker: 0 }
        state.interim = { microphone: '', speaker: '' }
      }
    },
    /** Applies one interim or final transcription result. */
    receiveTranscriptResult(state, action: PayloadAction<TranscriptResultEvent>) {
      const event = action.payload
      if (event.isFinal) {
        state.interim[event.source] = ''
        if (event.segment && state.currentTranscript) {
          state.currentTranscript.segments.push(event.segment)
        }
      } else if (!event.isFinal) {
        state.interim[event.source] = event.text
      }
    },
    /** Appends one live translation only to its currently displayed transcript. */
    receiveTranslationResult(state, action: PayloadAction<TranslationResultEvent>) {
      if (state.currentTranscript?.id !== action.payload.transcriptId) return
      const translation = action.payload.translation
      if (
        !state.currentTranscript.translations.some((candidate) => candidate.id === translation.id)
      ) {
        state.currentTranscript.translations.push(translation)
      }
    },
    /** Updates the live meter for one source. */
    setAudioLevel(
      state,
      action: PayloadAction<{ source: 'microphone' | 'speaker'; level: number }>,
    ) {
      state.levels[action.payload.source] = action.payload.level
    },
    /** Applies desktop updater progress. */
    setUpdateState(state, action: PayloadAction<UpdateStateEvent>) {
      state.update = action.payload
    },
    /** Shows or hides the transcript management sidebar for the current app session. */
    setTranscriptSidebarOpen(state, action: PayloadAction<boolean>) {
      state.transcriptSidebarOpen = action.payload
    },
    /** Toggles the distraction-free workspace with title-bar recording controls. */
    setCompactMode(state, action: PayloadAction<boolean>) {
      state.compactMode = action.payload
    },
  },
})

export const {
  addHistorySummary,
  hydrate,
  receiveTranscriptResult,
  receiveTranslationResult,
  removeHistorySummary,
  replaceCurrentTranscript,
  replaceHistorySummary,
  setApiBalance,
  setAudioLevel,
  setCurrentTranscript,
  setHasApiKey,
  setHistory,
  setPage,
  setSessionState,
  setSettings,
  setSettingsSection,
  setCompactMode,
  setTranscriptSidebarOpen,
  setUpdateState,
} = appSlice.actions

export default appSlice.reducer
