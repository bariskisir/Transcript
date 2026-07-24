/**
 * Renders Deepgram credentials, recognition, formatting, segmentation, and privacy controls.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button, Input, InputNumber, Select, Space, Switch, Tag } from 'antd'
import { CircleCheck, ExternalLink, KeyRound, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DEEPGRAM_DIARIZATION_MODES,
  DEEPGRAM_MODELS,
  DEEPGRAM_REDACTION_MODES,
  getDeepgramModel,
  type DeepgramModel,
} from '@shared/deepgram'
import {
  TRANSCRIPTION_PROVIDERS,
  type DeepgramTranscriptionSettingsPatch,
  type TranscriptionProvider,
} from '@shared/transcription'
import { useDesktopActions } from '@renderer/hooks/useDesktopActions'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppSelector } from '@renderer/store'
import { useTheme } from '@renderer/context/ThemeProvider'
import SettingLabel from '../components/SettingLabel'
import styles from '../SettingsPage.module.scss'

/** Displays Deepgram credentials and its independently typed transcription configuration. */
const DeepgramSettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const deepgramSettings = settings.transcriptionProviderSettings.deepgram
  const hasApiKey = useAppSelector((state) => state.app.hasApiKey)
  const apiBalance = useAppSelector((state) => state.app.apiBalance)
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const settingsActions = useSettingsActions()
  const desktopActions = useDesktopActions()
  const refreshApiBalance = settingsActions.refreshApiBalance
  const { t } = useTranslation()
  const selectedModel = getDeepgramModel(deepgramSettings.model)
  const { theme } = useTheme()
  const light = theme === 'light'
  const languageNames = useMemo(
    () => new Intl.DisplayNames([settings.uiLanguage, 'en'], { type: 'language' }),
    [settings.uiLanguage],
  )
  const balanceText = useMemo(
    () =>
      apiBalance
        .map(({ amount, units }) => {
          try {
            return new Intl.NumberFormat(settings.uiLanguage, {
              style: 'currency',
              currency: units,
            }).format(amount)
          } catch {
            return `${amount.toLocaleString(settings.uiLanguage)} ${units}`
          }
        })
        .join(', '),
    [apiBalance, settings.uiLanguage],
  )

  useEffect(() => {
    if (!hasApiKey) return undefined
    let active = true

    void refreshApiBalance()
    void window.app
      .getApiKey()
      .then((savedApiKey) => {
        if (active) setApiKey(savedApiKey ?? '')
      })
      .catch(() => {
        if (active) setApiKey('')
      })

    return () => {
      active = false
    }
  }, [hasApiKey, refreshApiBalance])

  /** Persists a partial provider setting through the serialized settings queue. */
  const updateSettings = async (patch: DeepgramTranscriptionSettingsPatch): Promise<void> => {
    await settingsActions.saveSettings({ transcriptionProviderSettings: { deepgram: patch } })
  }

  /** Validates and saves the currently entered API key. */
  const handleSaveKey = async (): Promise<void> => {
    if (!apiKey.trim()) return
    setSavingKey(true)
    try {
      await settingsActions.saveApiKey(apiKey.trim())
    } finally {
      setSavingKey(false)
    }
  }

  /** Deletes the saved credential and clears its local field after success. */
  const handleDeleteKey = async (): Promise<void> => {
    if (await settingsActions.deleteApiKey()) setApiKey('')
  }

  /** Selects a model and falls back to its first compatible language when required. */
  const handleModelChange = async (model: DeepgramModel): Promise<void> => {
    const catalog = getDeepgramModel(model)
    const language = catalog.languages.some((candidate) => candidate === deepgramSettings.language)
      ? deepgramSettings.language
      : (catalog.languages[0] ?? 'en')
    await updateSettings({
      model,
      language,
      ...(language.startsWith('en') ? {} : { redaction: 'none' }),
    })
  }

  /** Selects a compatible language and disables English-only redaction when necessary. */
  const handleLanguageChange = async (language: string): Promise<void> => {
    await updateSettings({
      language,
      ...(language.startsWith('en') ? {} : { redaction: 'none' }),
    })
  }

  /** Normalizes and persists the editable Deepgram model version. */
  const handleModelVersionCommit = async (value: string): Promise<void> => {
    const modelVersion = value.trim() || 'latest'
    if (modelVersion !== deepgramSettings.modelVersion) await updateSettings({ modelVersion })
  }

  /** Formats one supported BCP-47 language code for the current interface locale. */
  const formatLanguage = (code: string): string => `${languageNames.of(code) ?? code} (${code})`

  return (
    <>
      <h2 className={styles.groupTitle}>{t('settings.connection')}</h2>
      <section className={styles.settingGroup}>
        <div className={styles.apiCreditNotice}>
          <KeyRound size={15} />
          <span>{t('settings.apiKeyCreditNotice')}</span>
          <Button
            className={styles.apiCreditLink ?? ''}
            type="link"
            size="small"
            icon={<ExternalLink size={13} />}
            onClick={() => void desktopActions.openExternal('https://console.deepgram.com')}
          >
            {t('settings.getApiKey')}
          </Button>
        </div>
        <div className={`${styles.settingRow} ${styles.credentialRow}`}>
          <SettingLabel
            title={t('settings.apiKey')}
            description={t('settings.apiKeyDescription')}
          />
          <div className={styles.statusTag}>
            <Tag
              color={hasApiKey ? 'green' : 'warning'}
              icon={hasApiKey ? <CircleCheck size={12} /> : <KeyRound size={12} />}
            >
              {t(hasApiKey ? 'settings.apiKeyConnected' : 'settings.apiKeyMissing')}
            </Tag>
          </div>
          <Input.Password
            className={styles.flexControl}
            value={apiKey}
            visibilityToggle
            placeholder={t('settings.apiKeyPlaceholder')}
            onChange={(event) => setApiKey(event.target.value)}
            onPressEnter={() => void handleSaveKey()}
          />
          <div className={styles.settingControl}>
            {hasApiKey && (
              <Button
                danger
                {...(!light ? { type: 'primary' as const } : {})}
                icon={<Trash2 size={14} />}
                onClick={() => void handleDeleteKey()}
              >
                {t('common.delete')}
              </Button>
            )}
            <Button
              type="primary"
              {...(light ? { ghost: true } : {})}
              loading={savingKey}
              disabled={!apiKey.trim()}
              icon={<Save size={14} />}
              onClick={() => void handleSaveKey()}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
        {balanceText && (
          <div className={styles.settingRow}>
            <SettingLabel
              title={t('settings.apiBalance')}
              description={t('settings.apiBalanceDescription')}
            />
            <strong className={styles.balanceValue}>{balanceText}</strong>
          </div>
        )}
      </section>

      <h2 className={styles.groupTitle}>{t('settings.recognition')}</h2>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <SettingLabel title={t('settings.model')} description={t('settings.modelDescription')} />
          <div className={styles.settingControl}>
            <Select
              className={styles.wideControl ?? ''}
              value={deepgramSettings.model}
              options={DEEPGRAM_MODELS.map((model) => ({
                value: model.value,
                label: model.label,
              }))}
              onChange={(model: DeepgramModel) => void handleModelChange(model)}
            />
          </div>
        </div>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.speechLanguage')}
            description={t('settings.speechLanguageDescription')}
          />
          <div className={styles.settingControl}>
            <Select
              className={styles.wideControl ?? ''}
              value={deepgramSettings.language}
              showSearch
              optionFilterProp="label"
              options={selectedModel.languages.map((language) => ({
                value: language,
                label: formatLanguage(language),
              }))}
              onChange={(language) => void handleLanguageChange(language)}
            />
          </div>
        </div>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.modelVersion')}
            description={t('settings.modelVersionDescription')}
          />
          <div className={styles.settingControl}>
            <Input
              className={styles.compactControl}
              key={deepgramSettings.modelVersion}
              defaultValue={deepgramSettings.modelVersion}
              onPressEnter={(event) => void handleModelVersionCommit(event.currentTarget.value)}
              onBlur={(event) => void handleModelVersionCommit(event.currentTarget.value)}
            />
          </div>
        </div>
        <div className={`${styles.settingRow} ${styles.stackedRow}`}>
          <SettingLabel
            title={t('settings.vocabulary')}
            description={t('settings.vocabularyDescription', {
              parameter: selectedModel.vocabularyParameter,
            })}
          />
          <Select
            className={styles.fullControl ?? ''}
            mode="tags"
            value={deepgramSettings.vocabulary}
            tokenSeparators={[',']}
            placeholder={t('settings.vocabularyPlaceholder')}
            options={[]}
            onChange={(vocabulary: string[]) => void updateSettings({ vocabulary })}
          />
        </div>
      </section>

      <h2 className={styles.groupTitle}>{t('settings.formatting')}</h2>
      <section className={styles.settingGroup}>
        {[
          ['punctuate', 'punctuation'] as const,
          ['smartFormat', 'smartFormat'] as const,
          ['numerals', 'numerals'] as const,
          ['profanityFilter', 'profanityFilter'] as const,
        ].map(([setting, translation]) => (
          <div className={styles.settingRow} key={setting}>
            <SettingLabel
              title={t(`settings.${translation}`)}
              description={t(`settings.${translation}Description`)}
            />
            <div className={styles.settingControl}>
              <Switch
                checked={deepgramSettings[setting]}
                onChange={(checked) => void updateSettings({ [setting]: checked })}
              />
            </div>
          </div>
        ))}
      </section>

      <h2 className={styles.groupTitle}>{t('settings.segmentation')}</h2>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.endpointing')}
            description={t('settings.endpointingDescription')}
          />
          <div className={styles.settingControl}>
            <Space.Compact className={styles.durationControl}>
              <InputNumber
                className={styles.durationInput ?? ''}
                min={10}
                max={5000}
                value={deepgramSettings.endpointingMs}
                onChange={(value) =>
                  value !== null && void updateSettings({ endpointingMs: value })
                }
              />
              <Input
                className={styles.durationUnit ?? ''}
                value="ms"
                readOnly
                tabIndex={-1}
                aria-label="milliseconds"
              />
            </Space.Compact>
          </div>
        </div>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.utteranceEnd')}
            description={t('settings.utteranceEndDescription')}
          />
          <div className={styles.settingControl}>
            <Switch
              checked={deepgramSettings.utteranceEndEnabled}
              onChange={(utteranceEndEnabled) => void updateSettings({ utteranceEndEnabled })}
            />
            <Space.Compact className={styles.durationControl}>
              <InputNumber
                className={styles.durationInput ?? ''}
                min={1000}
                max={5000}
                disabled={!deepgramSettings.utteranceEndEnabled}
                value={deepgramSettings.utteranceEndMs}
                onChange={(value) =>
                  value !== null && void updateSettings({ utteranceEndMs: value })
                }
              />
              <Input
                className={styles.durationUnit ?? ''}
                value="ms"
                disabled={!deepgramSettings.utteranceEndEnabled}
                readOnly
                tabIndex={-1}
                aria-label="milliseconds"
              />
            </Space.Compact>
          </div>
        </div>
      </section>

      <h2 className={styles.groupTitle}>{t('settings.analysisPrivacy')}</h2>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.diarization')}
            description={t('settings.diarizationDescription')}
          />
          <div className={styles.settingControl}>
            <Select
              className={styles.compactControl ?? ''}
              value={deepgramSettings.diarization}
              options={DEEPGRAM_DIARIZATION_MODES.map((mode) => ({
                value: mode,
                label: t(`settings.diarizationModes.${mode}`),
              }))}
              onChange={(diarization) => void updateSettings({ diarization })}
            />
          </div>
        </div>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.redaction')}
            description={t('settings.redactionDescription')}
          />
          <div className={styles.settingControl}>
            <Select
              className={styles.compactControl ?? ''}
              value={deepgramSettings.redaction}
              disabled={!deepgramSettings.language.startsWith('en')}
              options={DEEPGRAM_REDACTION_MODES.map((mode) => ({
                value: mode,
                label: t(`settings.redactionModes.${mode}`),
              }))}
              onChange={(redaction) => void updateSettings({ redaction })}
            />
          </div>
        </div>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.mipOptOut')}
            description={t('settings.mipOptOutDescription')}
          />
          <div className={styles.settingControl}>
            <Switch
              checked={deepgramSettings.mipOptOut}
              onChange={(mipOptOut) => void updateSettings({ mipOptOut })}
            />
          </div>
        </div>
      </section>
    </>
  )
}

/** Displays provider selection and renders only the selected provider's independent settings. */
const TranscriptionSettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const session = useAppSelector((state) => state.app.session.state)
  const settingsActions = useSettingsActions()
  const { t } = useTranslation()

  return (
    <div className={styles.settingContainer}>
      <h1 className={styles.settingPageTitle}>{t('settings.transcription')}</h1>

      <h2 className={styles.groupTitle}>{t('settings.transcriptionService')}</h2>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.transcriptionProvider')}
            description={t('settings.transcriptionProviderDescription')}
          />
          <div className={styles.settingControl}>
            <Select<TranscriptionProvider>
              className={styles.wideControl ?? ''}
              value={settings.transcriptionProvider}
              disabled={session !== 'idle'}
              virtual={false}
              options={TRANSCRIPTION_PROVIDERS.map((provider) => ({
                value: provider,
                label: t(`settings.transcriptionProviders.${provider}`),
              }))}
              onChange={(transcriptionProvider) =>
                void settingsActions.saveSettings({ transcriptionProvider })
              }
            />
          </div>
        </div>
      </section>

      {settings.transcriptionProvider === 'deepgram' && <DeepgramSettingsSection />}
    </div>
  )
}

export default TranscriptionSettingsSection
