/**
 * Renders the draggable desktop title bar and its top-left workspace controls.
 */

import { useEffect, useState } from 'react'
import { Button, Slider, Tooltip } from 'antd'
import {
  PanelLeftClose,
  PanelRightClose,
  PanelTopClose,
  PanelTopOpen,
  Radio,
  Square,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import logoUrl from '../../../../../build/icon.svg'
import { useRecordingActions } from '@renderer/hooks/useRecordingActions'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { useTheme } from '@renderer/context/ThemeProvider'
import type { AppSettingsPatch } from '@shared/types'
import { WINDOW_OPACITY_LIMITS } from '@shared/types'
import { setCompactMode, setPage, setSessionsSidebarOpen } from '@renderer/store/appSlice'
import AppNavigationActions from './AppNavigationActions'
import WindowControls from './WindowControls'
import styles from './Titlebar.module.scss'

interface TitlebarProps {
  onSettingsChange: (patch: AppSettingsPatch) => Promise<void>
}

/** Places primary navigation and transcript-sidebar control beside each other at the top-left. */
const Titlebar = ({ onSettingsChange }: TitlebarProps): React.JSX.Element => {
  const dispatch = useAppDispatch()
  const page = useAppSelector((state) => state.app.page)
  const sidebarOpen = useAppSelector((state) => state.app.sessionsSidebarOpen)
  const compactMode = useAppSelector((state) => state.app.compactMode)
  const navbarPosition = useAppSelector((state) => state.app.settings.navbarPosition)
  const platform = useAppSelector((state) => state.app.platform)
  const session = useAppSelector((state) => state.app.session.state)
  const { t } = useTranslation()
  const { theme } = useTheme()
  const light = theme === 'light'
  const recordingActions = useRecordingActions()
  const settingsActions = useSettingsActions()
  const persistedOpacity = useAppSelector((state) => state.app.settings.windowOpacity)
  const [opacityPercent, setOpacityPercent] = useState(() => Math.round(persistedOpacity * 100))
  const stopping = session === 'stopping'
  const recording = session === 'recording'
  const canStop = session === 'connecting' || recording

  /** Keeps the slider in sync when opacity is persisted elsewhere. */
  useEffect(() => {
    setOpacityPercent(Math.round(persistedOpacity * 100))
  }, [persistedOpacity])

  /** Previews opacity live while dragging without writing settings on every step. */
  const previewOpacity = (percent: number): void => {
    setOpacityPercent(percent)
    void window.app.setWindowOpacity(percent / 100).catch(() => undefined)
  }

  /** Persists the dragged opacity once the slider is released. */
  const commitOpacity = (percent: number): void => {
    const windowOpacity =
      Math.round(percent / 100 / WINDOW_OPACITY_LIMITS.step) * WINDOW_OPACITY_LIMITS.step
    void settingsActions.saveSettings({ windowOpacity })
  }

  return (
    <header
      className={`${styles.container} ${platform === 'darwin' ? styles.nativeWindowControls : ''} drag-region`}
    >
      <div className={`${styles.topActions} no-drag`}>
        <Tooltip placement="bottom" title={t('nav.sessions')}>
          <Button
            className={styles.titleButton ?? ''}
            type="text"
            icon={<img className={styles.titleLogo} src={logoUrl} alt="" />}
            onClick={() => dispatch(setPage('home'))}
          />
        </Tooltip>
        {page === 'home' && (
          <>
            <Tooltip
              placement="bottom"
              title={t(sidebarOpen ? 'sidebar.hideSidebar' : 'sidebar.showSidebar')}
            >
              <Button
                className={styles.titleButton ?? ''}
                type="text"
                disabled={compactMode}
                icon={sidebarOpen ? <PanelLeftClose size={18} /> : <PanelRightClose size={18} />}
                onClick={() => dispatch(setSessionsSidebarOpen(!sidebarOpen))}
              />
            </Tooltip>
            <Tooltip
              placement="bottom"
              title={t(compactMode ? 'controls.fullView' : 'controls.compactView')}
            >
              <Button
                className={styles.titleButton ?? ''}
                type="text"
                icon={compactMode ? <PanelTopOpen size={18} /> : <PanelTopClose size={18} />}
                onClick={() => dispatch(setCompactMode(!compactMode))}
              />
            </Tooltip>
          </>
        )}
        {compactMode && (
          <>
            <Button
              className={styles.miniAction ?? ''}
              {...(light && canStop
                ? { danger: true as const }
                : {
                    type: 'primary' as const,
                    danger: canStop,
                    ...(light ? { ghost: true as const } : {}),
                  })}
              size="small"
              loading={stopping}
              disabled={stopping}
              icon={canStop ? <Square size={12} fill="currentColor" /> : <Radio size={14} />}
              onClick={() =>
                void (canStop
                  ? recordingActions.stopRecording()
                  : recordingActions.startRecording())
              }
            >
              {canStop ? t('controls.stop') : t('controls.start')}
            </Button>
            <Tooltip
              placement="bottom"
              title={`${t('settings.windowOpacity')}: ${opacityPercent}%`}
            >
              <Slider
                className={styles.opacitySlider ?? ''}
                min={Math.round(WINDOW_OPACITY_LIMITS.min * 100)}
                max={Math.round(WINDOW_OPACITY_LIMITS.max * 100)}
                step={Math.round(WINDOW_OPACITY_LIMITS.step * 100)}
                value={opacityPercent}
                onChange={previewOpacity}
                onChangeComplete={commitOpacity}
              />
            </Tooltip>
          </>
        )}
      </div>
      <div className={styles.rightActions}>
        {navbarPosition === 'top' && !compactMode && (
          <AppNavigationActions placement="top" onSettingsChange={onSettingsChange} />
        )}
        <WindowControls />
      </div>
    </header>
  )
}

export default Titlebar
