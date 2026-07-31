/**
 * Bootstraps renderer state and binds all main-to-renderer lifecycle events.
 */

import { useEffect, useRef } from 'react'
import { App as AntdApp } from 'antd'
import i18n from '@renderer/i18n'
import { createLogger } from '@renderer/services/LoggerService'
import {
  hydrate,
  receiveTranscriptResult,
  receiveTranslationResult,
  setPage,
  setLocalEngineState,
  setLocalModelOperation,
  setLocalModels,
  setSessionState,
  setUpdateState,
} from '@renderer/store/appSlice'
import { useAppDispatch } from '@renderer/store'

const logger = createLogger('AppInit')

/** Loads persisted state and maintains typed IPC subscriptions for the app lifetime. */
export const useAppInit = (): void => {
  const dispatch = useAppDispatch()
  const { message } = AntdApp.useApp()
  const messageRef = useRef(message)

  useEffect(() => {
    messageRef.current = message
  }, [message])

  useEffect(() => {
    let active = true
    const pendingLocalOperations = new Map<string, Parameters<typeof setLocalModelOperation>[0]>()
    let localOperationTimer: number | null = null

    /** Coalesces native download bursts outside Electron's synchronous IPC callback. */
    const publishLocalOperation = (event: Parameters<typeof setLocalModelOperation>[0]): void => {
      pendingLocalOperations.set(event.modelId, event)
      if (localOperationTimer !== null) return
      localOperationTimer = window.setTimeout(() => {
        localOperationTimer = null
        const operations = [...pendingLocalOperations.values()]
        pendingLocalOperations.clear()
        operations.forEach((operation) => {
          dispatch(setLocalModelOperation(operation))
        })
      }, 16)
    }

    const cleanup = [
      window.app.onSessionState((event) => dispatch(setSessionState(event))),
      window.app.onTranscriptResult((event) => dispatch(receiveTranscriptResult(event))),
      window.app.onTranslationResult((event) => dispatch(receiveTranslationResult(event))),
      window.app.onUpdateState((event) => dispatch(setUpdateState(event))),
      window.app.onLocalModelOperation(publishLocalOperation),
      window.app.onLocalEngineState((event) => dispatch(setLocalEngineState(event))),
      window.app.onLocalModelsChanged((models) => dispatch(setLocalModels(models))),
      window.app.onSettingsOpenRequested(() => dispatch(setPage('settings'))),
      window.app.onError((event) => {
        logger.error('Main process reported an application error.', event.message)
        void messageRef.current.error(
          i18n.t(
            event.context === 'translation' ? 'errors.translationDetails' : 'errors.runtimeDetails',
            { details: event.message },
          ),
          8,
        )
      }),
    ]

    void window.app
      .bootstrap()
      .then(async (payload) => {
        if (!active) return
        dispatch(hydrate(payload))
        document.documentElement.lang = payload.settings.uiLanguage
        await i18n.changeLanguage(payload.settings.uiLanguage)
      })
      .catch((error) => {
        logger.error('Renderer bootstrap failed.', error)
        void messageRef.current.error(i18n.t('errors.generic'))
      })

    return () => {
      active = false
      if (localOperationTimer !== null) window.clearTimeout(localOperationTimer)
      pendingLocalOperations.clear()
      cleanup.forEach((unsubscribe) => {
        unsubscribe()
      })
    }
  }, [dispatch])
}
