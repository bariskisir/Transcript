/**
 * Renders application identity, author, repository, license, and support links.
 */

import { Button, Tag } from 'antd'
import { ExternalLink, FileClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import logoUrl from '../../../../../../build/icon.svg'
import { useDesktopActions } from '@renderer/hooks/useDesktopActions'
import { useAppSelector } from '@renderer/store'
import SettingLabel from '../components/SettingLabel'
import styles from '../SettingsPage.module.scss'

/** Displays reusable application metadata and Transcript-specific links. */
const AboutSettingsSection = (): React.JSX.Element => {
  const version = useAppSelector((state) => state.app.version)
  const desktopActions = useDesktopActions()
  const { t } = useTranslation()

  return (
    <div className={styles.settingContainer}>
      <h1 className={styles.settingPageTitle}>{t('settings.about')}</h1>
      <div className={styles.aboutHero}>
        <img src={logoUrl} alt="" />
        <h2>{t('app.name')}</h2>
        <p>{t('app.tagline')}</p>
        <Tag>{t('settings.version', { version })}</Tag>
      </div>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <div className={styles.settingLabel}>
            <strong>{t('settings.author')}</strong>
            <button
              type="button"
              className={styles.authorLink}
              onClick={() => void desktopActions.openExternal('https://www.bariskisir.com')}
            >
              Barış Kısır
            </button>
          </div>
        </div>
        <div className={styles.settingRow}>
          <SettingLabel title={t('settings.repository')} description="bariskisir/transcript" />
          <Button
            type="text"
            icon={<ExternalLink size={14} />}
            onClick={() =>
              void desktopActions.openExternal('https://github.com/bariskisir/transcript')
            }
          />
        </div>
        <div className={styles.settingRow}>
          <SettingLabel title={t('settings.license')} description={t('settings.privacy')} />
        </div>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.deepgramDocumentation')}
            description={t('settings.deepgramDocumentationDescription')}
          />
          <Button
            type="text"
            icon={<ExternalLink size={14} />}
            onClick={() =>
              void desktopActions.openExternal(
                'https://developers.deepgram.com/docs/models-languages-overview',
              )
            }
          />
        </div>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.logFiles')}
            description={t('settings.logFilesDescription')}
          />
          <Button
            type="text"
            icon={<FileClock size={14} />}
            onClick={() => void desktopActions.openLogsDirectory()}
          />
        </div>
      </section>
    </div>
  )
}

export default AboutSettingsSection
