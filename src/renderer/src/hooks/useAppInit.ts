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
    const cleanup = [
      window.transcript.onSessionState((event) => dispatch(setSessionState(event))),
      window.transcript.onTranscriptResult((event) => dispatch(receiveTranscriptResult(event))),
      window.transcript.onTranslationResult((event) => dispatch(receiveTranslationResult(event))),
      window.transcript.onUpdateState((event) => dispatch(setUpdateState(event))),
      window.transcript.onError((event) => {
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

    void window.transcript
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
      cleanup.forEach((unsubscribe) => {
        unsubscribe()
      })
    }
  }, [dispatch])
}
