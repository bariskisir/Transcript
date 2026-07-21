/**
 * Renders compact source, device, language, and recording controls.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button, Select, Switch, Tooltip } from 'antd'
import { Languages, Mic2, MonitorSpeaker, Radio, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getDeepgramModel } from '@shared/deepgram'
import {
  ACTIVE_TRANSLATION_TARGET_LANGUAGES,
  type TranslationTargetLanguage,
} from '@shared/translation'
import type { AppSettingsPatch } from '@shared/types'
import type AudioCaptureService from '@renderer/audio/AudioCaptureService'
import type { AudioDevice } from '@renderer/audio/AudioCaptureService'
import { useAppSelector } from '@renderer/store'
import styles from './ControlBar.module.scss'

interface ControlBarProps {
  captureService: AudioCaptureService
  onSettingsChange: (patch: AppSettingsPatch) => Promise<void>
  onStart: () => Promise<void>
  onStop: () => Promise<void>
}

/** Displays all controls required to start a source-separated recording. */
const ControlBar = ({
  captureService,
  onSettingsChange,
  onStart,
  onStop,
}: ControlBarProps): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const platform = useAppSelector((state) => state.app.platform)
  const session = useAppSelector((state) => state.app.session.state)
  const levels = useAppSelector((state) => state.app.levels)
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const { t } = useTranslation()
  const busy = session !== 'idle'
  const stopping = session === 'stopping'
  const recording = session === 'recording'
  const canStop = session === 'connecting' || recording
  const deepgramSettings = settings.transcriptionProviderSettings.deepgram

  useEffect(() => {
    const refresh = (): void => {
      void captureService
        .listDevices()
        .then(setDevices)
        .catch(() => setDevices([]))
    }
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
  }, [captureService])

  const microphones = devices.filter((device) => device.kind === 'microphone')
  const speakers = devices.filter((device) => device.kind === 'speaker')
  const microphoneDeviceId = microphones.some((device) => device.id === settings.microphoneDeviceId)
    ? settings.microphoneDeviceId
    : 'default'
  const speakerDeviceId = speakers.some((device) => device.id === settings.speakerDeviceId)
    ? settings.speakerDeviceId
    : 'default'
  const speechLanguages = getDeepgramModel(deepgramSettings.model).languages
  const languageNames = useMemo(
    () => new Intl.DisplayNames([settings.uiLanguage, 'en'], { type: 'language' }),
    [settings.uiLanguage],
  )

  /** Formats one Deepgram BCP-47 language code for the active interface locale. */
  const formatLanguage = (code: string): string => `${languageNames.of(code) ?? code} (${code})`

  /** Formats one target language in the active interface locale without a technical suffix. */
  const formatTranslationLanguage = (code: string): string => languageNames.of(code) ?? code

  /** Persists one partial control setting. */
  const update = async (patch: AppSettingsPatch): Promise<void> => {
    await onSettingsChange(patch)
  }

  return (
    <section className={styles.container}>
      <div className={`${styles.sourceBlock} ${settings.microphoneEnabled ? styles.enabled : ''}`}>
        <div className={styles.sourceHeader}>
          <span className={`${styles.sourceIcon} ${styles.microphoneTone}`}>
            <Mic2 size={16} />
          </span>
          <span className={styles.sourceName}>{t('controls.microphone')}</span>
          <progress className={styles.meter} value={levels.microphone} max={1} />
          <Switch
            size="small"
            checked={settings.microphoneEnabled}
            disabled={recording || busy}
            onChange={(checked) => void update({ microphoneEnabled: checked })}
          />
        </div>
        <Select
          size="small"
          value={microphoneDeviceId}
          disabled={!settings.microphoneEnabled || recording || busy}
          onChange={(value) => void update({ microphoneDeviceId: value })}
          options={[
            { value: 'default', label: t('controls.defaultDevice') },
            ...microphones
              .filter((device) => device.id && device.id !== 'default')
              .map((device, index) => ({
                value: device.id,
                label: device.label || `${t('controls.microphone')} ${index + 1}`,
              })),
          ]}
        />
      </div>

      <div
        className={`${styles.sourceBlock} ${settings.speakerEnabled && platform === 'win32' ? styles.enabled : ''}`}
      >
        <div className={styles.sourceHeader}>
          <span className={`${styles.sourceIcon} ${styles.speakerTone}`}>
            <MonitorSpeaker size={16} />
          </span>
          <span className={styles.sourceName}>{t('controls.speaker')}</span>
          <progress className={styles.meter} value={levels.speaker} max={1} />
          <Tooltip title={platform !== 'win32' ? t('controls.unavailable') : undefined}>
            <Switch
              size="small"
              checked={settings.speakerEnabled && platform === 'win32'}
              disabled={platform !== 'win32' || recording || busy}
              onChange={(checked) => void update({ speakerEnabled: checked })}
            />
          </Tooltip>
        </div>
        <Select
          size="small"
          value={speakerDeviceId}
          disabled={!settings.speakerEnabled || platform !== 'win32' || recording || busy}
          onChange={(value) => void update({ speakerDeviceId: value })}
          options={[
            { value: 'default', label: t('controls.defaultSpeaker') },
            ...speakers
              .filter((device) => device.id && device.id !== 'default')
              .map((device, index) => ({
                value: device.id,
                label: device.label || `${t('controls.speaker')} ${index + 1}`,
              })),
          ]}
        />
      </div>

      <div className={`${styles.sourceBlock} ${styles.enabled}`}>
        <div className={styles.sourceHeader}>
          <span className={`${styles.sourceIcon} ${styles.languageTone}`}>
            <Languages size={16} />
          </span>
          <span className={styles.sourceName}>{t('controls.speechLanguage')}</span>
        </div>
        <Select
          size="small"
          value={deepgramSettings.language}
          disabled={recording || busy}
          onChange={(language) =>
            void update({ transcriptionProviderSettings: { deepgram: { language } } })
          }
          showSearch
          optionFilterProp="label"
          options={speechLanguages.map((language) => ({
            value: language,
            label: formatLanguage(language),
          }))}
        />
      </div>

      <div className={`${styles.sourceBlock} ${styles.enabled}`}>
        <div className={styles.sourceHeader}>
          <span className={`${styles.sourceIcon} ${styles.languageTone}`}>
            <Languages size={16} />
          </span>
          <span className={styles.sourceName}>{t('controls.translateTo')}</span>
        </div>
        <Select<TranslationTargetLanguage>
          size="small"
          value={settings.translationTargetLanguage}
          disabled={session === 'connecting' || session === 'stopping'}
          onChange={(translationTargetLanguage) => void update({ translationTargetLanguage })}
          showSearch
          optionFilterProp="label"
          options={[
            { value: 'none', label: t('controls.translationNone') },
            ...ACTIVE_TRANSLATION_TARGET_LANGUAGES.map((language) => ({
              value: language,
              label: formatTranslationLanguage(language),
            })),
          ]}
        />
      </div>

      <Button
        className={styles.recordButton ?? ''}
        type="primary"
        danger={recording}
        loading={stopping}
        icon={canStop ? <Square size={14} fill="currentColor" /> : <Radio size={17} />}
        onClick={() => void (canStop ? onStop() : onStart())}
      >
        {canStop ? t('controls.stop') : t('controls.start')}
      </Button>
    </section>
  )
}

export default ControlBar
