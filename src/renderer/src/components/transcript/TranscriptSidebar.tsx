/**
 * Manages saved transcripts in the collapsible secondary workspace sidebar.
 */

import { useState } from 'react'
import { Button, Dropdown, Empty, Input, Modal, Tooltip, type MenuProps } from 'antd'
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@renderer/context/ThemeProvider'
import type { TranscriptSummary } from '@shared/types'
import { useTranscriptHistoryActions } from '@renderer/hooks/useTranscriptHistoryActions'
import { useAppSelector } from '@renderer/store'
import { formatDate, formatDuration } from '@renderer/utils/formatters'
import styles from './TranscriptSidebar.module.scss'

/** Renders new, open, delete, and collapse actions for locally persisted transcripts. */
const TranscriptSidebar = (): React.JSX.Element => {
  const history = useAppSelector((state) => state.app.history)
  const currentTranscript = useAppSelector((state) => state.app.currentTranscript)
  const session = useAppSelector((state) => state.app.session.state)
  const timeFormat = useAppSelector((state) => state.app.settings.timeFormat)
  const sidebarOpen = useAppSelector((state) => state.app.transcriptSidebarOpen)
  const actions = useTranscriptHistoryActions()
  const { t } = useTranslation()
  const { theme } = useTheme()
  const light = theme === 'light'
  const recordingActive = session !== 'idle'
  const [renameTarget, setRenameTarget] = useState<TranscriptSummary | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)

  /** Resolves a generated title from the active interface locale while preserving custom names. */
  const displayTitle = (transcript: TranscriptSummary): string =>
    transcript.isDefaultTitle ? t('transcript.newTranscript') : transcript.title

  /** Opens the rename dialog with the selected transcript's current title. */
  const beginRename = (transcript: TranscriptSummary): void => {
    setRenameTarget(transcript)
    setRenameValue(displayTitle(transcript))
  }

  /** Persists the edited title and closes the dialog after a successful update. */
  const commitRename = async (): Promise<void> => {
    if (!renameTarget || !renameValue.trim()) return
    setRenaming(true)
    const renamed = await actions.renameTranscript(renameTarget.id, renameValue.trim())
    setRenaming(false)
    if (renamed) setRenameTarget(null)
  }

  /** Builds the context-menu actions for one transcript summary. */
  const transcriptMenu = (transcript: TranscriptSummary): MenuProps => ({
    items: [
      {
        key: 'rename',
        icon: <Pencil size={14} />,
        label: t('common.rename'),
      },
      { type: 'divider' },
      {
        key: 'delete',
        danger: true,
        icon: <Trash2 size={14} />,
        label: t('common.delete'),
        disabled: history.length === 1 && transcript.segmentCount === 0,
      },
    ],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation()
      if (key === 'rename') beginRename(transcript)
      if (key === 'delete') void actions.deleteTranscript(transcript.id)
    },
  })

  return (
    <>
      <aside
        className={`${styles.container} ${sidebarOpen ? '' : styles.collapsed}`}
        aria-hidden={!sidebarOpen}
      >
        {sidebarOpen && (
          <>
            <header className={styles.header}>
              <span>{t('nav.transcript')}</span>
              <div className={styles.headerActions}>
                <Tooltip title={t('transcript.newTranscript')}>
                  <Button
                    className={styles.addButton ?? ''}
                    type="text"
                    size="small"
                    disabled={recordingActive}
                    icon={<Plus size={16} />}
                    onClick={() => void actions.createTranscript()}
                  />
                </Tooltip>
              </div>
            </header>

            <div className={styles.scrollArea}>
              {history.length === 0 ? (
                <div className={styles.emptyWrap}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t('history.emptyTitle')}
                  />
                </div>
              ) : (
                <div className={styles.list}>
                  {history.map((item) => (
                    <Dropdown
                      key={item.id}
                      menu={transcriptMenu(item)}
                      trigger={['contextMenu']}
                      disabled={recordingActive}
                    >
                      <div
                        className={`${styles.item} ${currentTranscript?.id === item.id ? styles.active : ''}`}
                      >
                        <button
                          type="button"
                          className={styles.openButton}
                          disabled={recordingActive}
                          onClick={() => void actions.openTranscript(item.id)}
                        >
                          <span className={styles.fileIcon}>
                            <FileText size={14} />
                          </span>
                          <span className={styles.itemBody}>
                            <span className={styles.itemTitle}>{displayTitle(item)}</span>
                            <span className={styles.itemMeta}>
                              {formatDate(item.createdAt, timeFormat)} ·{' '}
                              {formatDuration(item.durationMs)}
                            </span>
                          </span>
                        </button>
                        <Tooltip title={t('common.delete')}>
                          <Button
                            className={styles.deleteButton ?? ''}
                            type="text"
                            danger
                            size="small"
                            disabled={
                              recordingActive || (history.length === 1 && item.segmentCount === 0)
                            }
                            icon={<Trash2 size={13} />}
                            onClick={() => void actions.deleteTranscript(item.id)}
                          />
                        </Tooltip>
                      </div>
                    </Dropdown>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
      <Modal
        title={t('transcript.renameTranscript')}
        open={renameTarget !== null}
        okText={t('common.rename')}
        cancelText={t('common.cancel')}
        confirmLoading={renaming}
        okButtonProps={{
          disabled: !renameValue.trim(),
          ...(light ? { ghost: true as const } : {}),
        }}
        onOk={() => void commitRename()}
        onCancel={() => setRenameTarget(null)}
        destroyOnHidden
      >
        <Input
          className={styles.renameInput}
          value={renameValue}
          maxLength={200}
          autoFocus
          placeholder={t('transcript.renameTranscript')}
          onChange={(event) => setRenameValue(event.target.value)}
          onPressEnter={() => void commitRename()}
        />
      </Modal>
    </>
  )
}

export default TranscriptSidebar
