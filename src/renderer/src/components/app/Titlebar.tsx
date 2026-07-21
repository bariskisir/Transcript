/**
 * Renders the draggable desktop title bar and its top-left workspace controls.
 */

import { Button, Tooltip } from 'antd'
import { PanelLeftClose, PanelRightClose } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import logoUrl from '../../../../../build/icon.svg'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setPage, setTranscriptSidebarOpen } from '@renderer/store/appSlice'
import styles from './Titlebar.module.scss'

/** Places primary navigation and transcript-sidebar control beside each other at the top-left. */
const Titlebar = (): React.JSX.Element => {
  const dispatch = useAppDispatch()
  const page = useAppSelector((state) => state.app.page)
  const sidebarOpen = useAppSelector((state) => state.app.transcriptSidebarOpen)
  const { t } = useTranslation()

  return (
    <header className={`${styles.container} drag-region`}>
      <div className={`${styles.topActions} no-drag`}>
        <Tooltip placement="bottom" title={t('nav.transcript')}>
          <Button
            className={styles.titleButton ?? ''}
            type="text"
            icon={<img className={styles.titleLogo} src={logoUrl} alt="" />}
            onClick={() => dispatch(setPage('home'))}
          />
        </Tooltip>
        {page === 'home' && (
          <Tooltip
            placement="bottom"
            title={t(sidebarOpen ? 'transcript.hideSidebar' : 'transcript.showSidebar')}
          >
            <Button
              className={styles.titleButton ?? ''}
              type="text"
              icon={sidebarOpen ? <PanelLeftClose size={18} /> : <PanelRightClose size={18} />}
              onClick={() => dispatch(setTranscriptSidebarOpen(!sidebarOpen))}
            />
          </Tooltip>
        )}
      </div>
    </header>
  )
}

export default Titlebar
