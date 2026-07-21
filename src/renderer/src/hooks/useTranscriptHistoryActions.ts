/**
 * Exposes renderer commands for transcript workspace history and exports.
 */

import { useCallback } from 'react'
import { App as AntdApp } from 'antd'
import { useTranslation } from 'react-i18next'
import type { TranscriptFormat } from '@shared/types'
import { createLogger } from '@renderer/services/LoggerService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  addHistorySummary,
  removeHistorySummary,
  replaceCurrentTranscript,
  replaceHistorySummary,
  setCurrentTranscript,
} from '@renderer/store/appSlice'
import { toTranscriptSummary } from '@renderer/utils/formatters'

const logger = createLogger('TranscriptHistoryActions')
let selectionRevision = 0

/** Returns stable local transcript management commands. */
export const useTranscriptHistoryActions = () => {
  const dispatch = useAppDispatch()
  const history = useAppSelector((state) => state.app.history)
  const currentTranscriptId = useAppSelector((state) => state.app.currentTranscript?.id ?? null)
  const speechLanguage = useAppSelector(
    (state) => state.app.settings.transcriptionProviderSettings.deepgram.language,
  )
  const translationProvider = useAppSelector((state) => state.app.settings.translationProvider)
  const translationEnabled = useAppSelector((state) => state.app.settings.translationEnabled)
  const translationTargetLanguage = useAppSelector(
    (state) => state.app.settings.translationTargetLanguage,
  )
  const { message } = AntdApp.useApp()
  const { t } = useTranslation()

  /** Loads a complete transcript from local history. */
  const openTranscript = useCallback(
    async (id: string): Promise<void> => {
      const revision = ++selectionRevision
      try {
        const transcript = await window.transcript.getTranscript(id)
        if (revision === selectionRevision) dispatch(setCurrentTranscript(transcript))
      } catch (error) {
        if (revision !== selectionRevision) return
        logger.error('Transcript could not be loaded.', error)
        void message.error(t('errors.generic'))
      }
    },
    [dispatch, message, t],
  )

  /** Creates and selects a new transcript workspace. */
  const createTranscript = useCallback(async (): Promise<void> => {
    const revision = ++selectionRevision
    try {
      const transcript = await window.transcript.createTranscript(speechLanguage)
      const summary = toTranscriptSummary(transcript)
      dispatch(addHistorySummary(summary))
      if (revision === selectionRevision) dispatch(setCurrentTranscript(transcript))
    } catch (error) {
      logger.error('Transcript workspace could not be created.', error)
      void message.error(t('errors.generic'))
    }
  }, [dispatch, message, speechLanguage, t])

  /** Renames a transcript and synchronizes the active document and history summary. */
  const renameTranscript = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      try {
        const transcript = await window.transcript.renameTranscript(id, title)
        const summary = toTranscriptSummary(transcript)
        dispatch(replaceCurrentTranscript(transcript))
        dispatch(replaceHistorySummary(summary))
        return true
      } catch (error) {
        logger.error('Transcript could not be renamed.', error)
        void message.error(t('errors.generic'))
        return false
      }
    },
    [dispatch, message, t],
  )

  /** Deletes one transcript while preserving and selecting a ready workspace. */
  const deleteTranscript = useCallback(
    async (id: string): Promise<void> => {
      const revision = ++selectionRevision
      try {
        const result = await window.transcript.deleteTranscript(id)
        if (!result.deleted) return
        dispatch(removeHistorySummary(id))
        const remaining = history.filter((item) => item.id !== id)
        if (result.replacement) dispatch(addHistorySummary(toTranscriptSummary(result.replacement)))

        if (currentTranscriptId !== id) return
        const nextTranscript =
          result.replacement ??
          (remaining[0] ? await window.transcript.getTranscript(remaining[0].id) : null)
        if (revision === selectionRevision) dispatch(setCurrentTranscript(nextTranscript))
      } catch (error) {
        logger.error('Transcript could not be deleted.', error)
        void message.error(t('errors.generic'))
      }
    },
    [currentTranscriptId, dispatch, history, message, t],
  )

  /** Exports a transcript through the operating-system save dialog. */
  const exportTranscript = useCallback(
    async (id: string, format: TranscriptFormat): Promise<void> => {
      try {
        if (
          await window.transcript.exportTranscript(
            id,
            format,
            t('transcript.export'),
            translationEnabled,
            translationProvider,
            translationTargetLanguage,
          )
        ) {
          void message.success(t('transcript.exported'))
        }
      } catch (error) {
        logger.error('Transcript could not be exported.', error)
        void message.error(t('errors.generic'))
      }
    },
    [message, t, translationEnabled, translationProvider, translationTargetLanguage],
  )

  return {
    createTranscript,
    deleteTranscript,
    exportTranscript,
    openTranscript,
    renameTranscript,
  }
}
