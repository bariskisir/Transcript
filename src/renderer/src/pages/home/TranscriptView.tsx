/**
 * Renders the full-space continuous live transcript with export controls.
 */

import { useEffect, useMemo, useRef } from 'react'
import { Button, Dropdown, type MenuProps } from 'antd'
import { AudioLines, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TRANSCRIPT_FORMATS, type TranscriptFormat } from '@shared/types'
import { useAppSelector } from '@renderer/store'
import styles from './TranscriptView.module.scss'

interface TranscriptViewProps {
  onExport: (id: string, format: TranscriptFormat) => Promise<void>
}

/** Displays final text plus in-place interim hypotheses as one flowing document. */
const TranscriptView = ({ onExport }: TranscriptViewProps): React.JSX.Element => {
  const transcript = useAppSelector((state) => state.app.currentTranscript)
  const interim = useAppSelector((state) => state.app.interim)
  const session = useAppSelector((state) => state.app.session.state)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const finalText = useMemo(
    () =>
      transcript?.segments
        .map((segment) => segment.text.trim())
        .filter(Boolean)
        .join(' ') ?? '',
    [transcript?.segments],
  )
  const liveText = [finalText, interim.microphone, interim.speaker].filter(Boolean).join(' ')

  /** Keeps the latest corrected hypothesis visible as the continuous document grows. */
  useEffect(() => {
    if (liveText && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [liveText])

  const exportItems: MenuProps['items'] = TRANSCRIPT_FORMATS.map((format) => ({
    key: format,
    label: t('transcript.exportAs', { format: format.toUpperCase() }),
  }))
  const hasContent = Boolean(liveText)

  return (
    <section className={styles.container}>
      <div ref={scrollRef} className={`${styles.scrollArea} selectable`}>
        {!hasContent ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <AudioLines size={25} />
            </div>
            <h2>{t('transcript.emptyTitle')}</h2>
            <p>{t('transcript.emptyDescription')}</p>
          </div>
        ) : (
          <div className={styles.transcriptBody}>
            <p className={styles.continuousText}>
              {finalText}
              {finalText && (interim.microphone || interim.speaker) ? ' ' : ''}
              {(['microphone', 'speaker'] as const).map((source) =>
                interim[source] ? (
                  <span className={styles.interimText} key={source}>
                    {interim[source].trim()}{' '}
                  </span>
                ) : null,
              )}
            </p>
          </div>
        )}
      </div>
      <footer className={styles.footer}>
        <span className={`${styles.status} ${session === 'recording' ? styles.active : ''}`}>
          <span className={styles.statusDot} />
          {t(`status.${session}`)}
        </span>
        <span>{t('transcript.segments', { count: transcript?.segments.length ?? 0 })}</span>
        <span className={styles.footerSpacer} />
        {transcript && transcript.segments.length > 0 && (
          <Dropdown
            menu={{
              items: exportItems,
              onClick: ({ key }) => void onExport(transcript.id, key as TranscriptFormat),
            }}
            trigger={['click']}
          >
            <Button type="text" size="small" icon={<Download size={14} />}>
              {t('transcript.export')}
            </Button>
          </Dropdown>
        )}
      </footer>
    </section>
  )
}

export default TranscriptView
