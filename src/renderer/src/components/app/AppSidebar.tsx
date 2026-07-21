/**
 * Renders the persistent Transcript sidebar and global window controls.
 */

import { Button, Tooltip } from 'antd'
import { Monitor, Moon, Pin, Settings, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppSettingsPatch, ThemeMode } from '@shared/types'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setPage } from '@renderer/store/appSlice'
import styles from './AppSidebar.module.scss'

interface AppSidebarProps {
  onSettingsChange: (patch: AppSettingsPatch) => Promise<void>
}

const NEXT_THEME: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

/** Displays primary navigation, theme switching, pinning, and settings access. */
const AppSidebar = ({ onSettingsChange }: AppSidebarProps): React.JSX.Element => {
  const dispatch = useAppDispatch()
  const page = useAppSelector((state) => state.app.page)
  const settings = useAppSelector((state) => state.app.settings)
  const { t } = useTranslation()

  /** Persists a global setting from the sidebar. */
  const update = async (patch: AppSettingsPatch): Promise<void> => {
    await onSettingsChange(patch)
  }

  /** Returns the icon matching the configured theme mode. */
  const themeIcon = (): React.JSX.Element => {
    if (settings.theme === 'light') return <Sun size={18} />
    if (settings.theme === 'dark') return <Moon size={18} />
    return <Monitor size={18} />
  }

  return (
    <aside className={`${styles.container} no-drag`}>
      <div className={styles.bottomActions}>
        <Tooltip placement="right" title={t('settings.alwaysOnTop')}>
          <Button
            className={styles.sidebarButton ?? ''}
            type={settings.alwaysOnTop ? 'primary' : 'text'}
            icon={<Pin size={18} />}
            onClick={() => void update({ alwaysOnTop: !settings.alwaysOnTop })}
          />
        </Tooltip>
        <Tooltip placement="right" title={t(`themes.${settings.theme}`)}>
          <Button
            className={styles.sidebarButton ?? ''}
            type="text"
            icon={themeIcon()}
            onClick={() => void update({ theme: NEXT_THEME[settings.theme] })}
          />
        </Tooltip>
        <Tooltip placement="right" title={t('nav.settings')}>
          <Button
            className={styles.sidebarButton ?? ''}
            type={page === 'settings' ? 'primary' : 'text'}
            icon={<Settings size={18} />}
            onClick={() => dispatch(setPage('settings'))}
          />
        </Tooltip>
      </div>
    </aside>
  )
}

export default AppSidebar
