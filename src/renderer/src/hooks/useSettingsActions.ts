/**
 * Exposes renderer commands for persisted settings and Deepgram credentials.
 */

import { useCallback } from 'react'
import { App as AntdApp } from 'antd'
import { useTranslation } from 'react-i18next'
import type { AppSettingsPatch } from '@shared/types'
import i18n from '@renderer/i18n'
import { createLogger } from '@renderer/services/LoggerService'
import SettingsPersistenceQueue from '@renderer/services/SettingsPersistenceQueue'
import { useAppDispatch } from '@renderer/store'
import { setApiBalance, setHasApiKey, setSettings } from '@renderer/store/appSlice'

const logger = createLogger('SettingsActions')
const settingsPersistenceQueue = new SettingsPersistenceQueue()

/** Returns stable settings and credential commands backed by the preload API. */
export const useSettingsActions = () => {
  const dispatch = useAppDispatch()
  const { message } = AntdApp.useApp()
  const { t } = useTranslation()

  /** Serializes a partial settings update so rapid controls cannot overwrite each other. */
  const saveSettings = useCallback(
    async (patch: AppSettingsPatch): Promise<void> => {
      try {
        const saved = await settingsPersistenceQueue.enqueue(patch, window.transcript.saveSettings)
        dispatch(setSettings(saved))
        document.documentElement.lang = saved.uiLanguage
        await i18n.changeLanguage(saved.uiLanguage)
      } catch (error) {
        logger.error('Settings could not be saved.', error)
        void message.error(t('errors.generic'))
      }
    },
    [dispatch, message, t],
  )

  /** Verifies and saves a Deepgram API key. */
  const saveApiKey = useCallback(
    async (apiKey: string): Promise<boolean> => {
      try {
        const balance = await window.transcript.saveApiKey(apiKey)
        dispatch(setHasApiKey(true))
        dispatch(setApiBalance(balance))
        void message.success(t('notices.apiKeySaved'))
        return true
      } catch (error) {
        logger.error('Deepgram API key validation failed.', error)
        void message.error(t('errors.generic'))
        return false
      }
    },
    [dispatch, message, t],
  )

  /** Removes the encrypted Deepgram key and clears credential state. */
  const deleteApiKey = useCallback(async (): Promise<boolean> => {
    try {
      await window.transcript.deleteApiKey()
      dispatch(setHasApiKey(false))
      dispatch(setApiBalance([]))
      void message.success(t('notices.apiKeyRemoved'))
      return true
    } catch (error) {
      logger.error('Deepgram API key could not be removed.', error)
      void message.error(t('errors.generic'))
      return false
    }
  }, [dispatch, message, t])

  /** Refreshes optional account balance data without surfacing unsupported accounts. */
  const refreshApiBalance = useCallback(async (): Promise<void> => {
    try {
      dispatch(setApiBalance(await window.transcript.getApiBalance()))
    } catch (error) {
      logger.warn('Deepgram balance could not be refreshed.', error)
      dispatch(setApiBalance([]))
    }
  }, [dispatch])

  return { deleteApiKey, refreshApiBalance, saveApiKey, saveSettings }
}
