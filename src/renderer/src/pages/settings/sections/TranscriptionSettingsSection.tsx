/**
 * Renders Deepgram credentials, recognition, formatting, segmentation, and privacy controls.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  App as AntdApp,
  Button,
  Empty,
  Input,
  InputNumber,
  Progress,
  Select,
  Space,
  Switch,
  Tag,
} from 'antd'
import {
  CircleCheck,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  KeyRound,
  RefreshCw,
  Save,
  Trash2,
  Unplug,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DEEPGRAM_DIARIZATION_MODES,
  DEEPGRAM_REDACTION_MODES,
  getDeepgramVocabularyParameter,
} from '@shared/deepgram'
import {
  REST_TRANSCRIPTION_SPEEDS,
  TRANSCRIPTION_PROVIDERS,
  type DeepgramTranscriptionSettingsPatch,
  type OpenRouterTranscriptionSettingsPatch,
  type LocalTranscriptionSettingsPatch,
  type RestTranscriptionSpeed,
  type TranscriptionProvider,
} from '@shared/transcription'
import { OPENROUTER_KEYS_URL, ORDERED_OPENROUTER_TRANSCRIPTION_LANGUAGES } from '@shared/openrouter'
import { LOCAL_TRANSCRIPTION_LANGUAGES } from '@shared/localTranscription'
import { useDesktopActions } from '@renderer/hooks/useDesktopActions'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setSettings } from '@renderer/store/appSlice'
import { useTheme } from '@renderer/context/ThemeProvider'
import SettingLabel from '../components/SettingLabel'
import styles from '../SettingsPage.module.scss'

/** Displays Deepgram credentials and its independently typed transcription configuration. */
const DeepgramSettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const deepgramSettings = settings.transcriptionProviderSettings.deepgram
  const models = useAppSelector((state) => state.app.deepgramModels)
  const hasApiKey = useAppSelector((state) => state.app.hasApiKeys.deepgram)
  const apiBalance = useAppSelector((state) => state.app.apiBalances.deepgram)
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const settingsActions = useSettingsActions()
  const desktopActions = useDesktopActions()
  const refreshApiBalance = settingsActions.refreshApiBalance
  const { t } = useTranslation()
  const selectedModel = models.find((model) => model.id === deepgramSettings.model)
  const vocabularyParameter =
    selectedModel?.vocabularyParameter ?? getDeepgramVocabularyParameter(deepgramSettings.model)
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
  const modelOptions = useMemo(
    () =>
      models.map((model) => ({
        value: model.id,
        searchText: `${model.name} ${model.id}`,
        label: (
          <span className={styles.modelOption}>
            <span className={styles.modelOptionName}>{model.name}</span>
            <span className={styles.modelOptionPrice}>
              {model.hourlyPriceUsd === null
                ? t('settings.priceUnavailable')
                : `${new Intl.NumberFormat(settings.uiLanguage, {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 3,
                  }).format(model.hourlyPriceUsd)}/${t('settings.hour')}`}
            </span>
          </span>
        ),
      })),
    [models, settings.uiLanguage, t],
  )

  useEffect(() => {
    if (!hasApiKey) return undefined
    let active = true

    void refreshApiBalance('deepgram')
    void window.app
      .getApiKey('deepgram')
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
      await settingsActions.saveApiKey('deepgram', apiKey.trim())
    } finally {
      setSavingKey(false)
    }
  }

  /** Deletes the saved credential and clears its local field after success. */
  const handleDeleteKey = async (): Promise<void> => {
    if (await settingsActions.deleteApiKey('deepgram')) setApiKey('')
  }

  /** Selects a model and falls back to its first compatible language when required. */
  const handleModelChange = async (model: string): Promise<void> => {
    const catalog = models.find((candidate) => candidate.id === model)
    const languages = catalog?.languages ?? []
    const language = languages.some((candidate) => candidate === deepgramSettings.language)
      ? deepgramSettings.language
      : languages.includes('en')
        ? 'en'
        : (languages[0] ?? deepgramSettings.language)
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
  const formatLanguage = (code: string): string => {
    try {
      return `${languageNames.of(code) ?? code} (${code})`
    } catch {
      return code
    }
  }

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
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.transcriptionMethod')}
            description={t('settings.websocketMethodDescription')}
          />
          <strong className={styles.balanceValue}>WebSocket</strong>
        </div>
      </section>

      <h2 className={styles.groupTitle}>{t('settings.recognition')}</h2>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <SettingLabel title={t('settings.model')} description={t('settings.modelDescription')} />
          <div className={styles.settingControl}>
            <Select
              className={`${styles.wideControl ?? ''} ${styles.modelSelect ?? ''}`}
              value={deepgramSettings.model}
              loading={models.length === 0}
              showSearch
              optionFilterProp="searchText"
              options={modelOptions}
              onChange={(model: string) => void handleModelChange(model)}
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
              options={(selectedModel?.languages ?? [deepgramSettings.language]).map(
                (language) => ({
                  value: language,
                  label: formatLanguage(language),
                }),
              )}
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
              className={styles.compactControl ?? ''}
              key={deepgramSettings.modelVersion}
              defaultValue={deepgramSettings.modelVersion}
              onPressEnter={(event) => void handleModelVersionCommit(event.currentTarget.value)}
              onBlur={(event) => void handleModelVersionCommit(event.currentTarget.value)}
            />
          </div>
        </div>
        {vocabularyParameter && (
          <div className={`${styles.settingRow} ${styles.stackedRow}`}>
            <SettingLabel
              title={t('settings.vocabulary')}
              description={t('settings.vocabularyDescription', {
                parameter: vocabularyParameter,
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
        )}
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

/** Displays OpenRouter credentials and the request parameters supported by its STT endpoint. */
const OpenRouterSettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const openRouterSettings = settings.transcriptionProviderSettings.openrouter
  const models = useAppSelector((state) => state.app.openRouterModels)
  const hasApiKey = useAppSelector((state) => state.app.hasApiKeys.openrouter)
  const apiBalance = useAppSelector((state) => state.app.apiBalances.openrouter)
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const settingsActions = useSettingsActions()
  const desktopActions = useDesktopActions()
  const refreshApiBalance = settingsActions.refreshApiBalance
  const { t } = useTranslation()
  const { theme } = useTheme()
  const light = theme === 'light'
  const languageNames = useMemo(
    () => new Intl.DisplayNames([settings.uiLanguage, 'en'], { type: 'language' }),
    [settings.uiLanguage],
  )
  const balanceText = useMemo(
    () =>
      apiBalance
        .map(({ amount, units }) =>
          new Intl.NumberFormat(settings.uiLanguage, {
            style: 'currency',
            currency: units,
          }).format(amount),
        )
        .join(', '),
    [apiBalance, settings.uiLanguage],
  )
  const modelOptions = useMemo(
    () =>
      models.map((model) => ({
        value: model.id,
        searchText: `${model.name} ${model.id}`,
        label: (
          <span className={styles.modelOption}>
            <span className={styles.modelOptionName}>{model.name}</span>
            <span className={styles.modelOptionPrice}>
              {new Intl.NumberFormat(settings.uiLanguage, {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 6,
              }).format(model.hourlyPriceUsd)}
              /{t('settings.hour')}
            </span>
          </span>
        ),
      })),
    [models, settings.uiLanguage, t],
  )
  const languageOptions = useMemo(() => {
    return [
      {
        value: '',
        searchText: t('settings.automaticLanguage'),
        label: t('settings.automaticLanguage'),
      },
      ...ORDERED_OPENROUTER_TRANSCRIPTION_LANGUAGES.map((language) => {
        const name = languageNames.of(language) ?? language
        return {
          value: language,
          searchText: `${name} ${language}`,
          label: `${name} (${language})`,
        }
      }),
    ]
  }, [languageNames, t])

  useEffect(() => {
    if (!hasApiKey) return undefined
    let active = true
    void refreshApiBalance('openrouter')
    void window.app
      .getApiKey('openrouter')
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

  useEffect(() => {
    const cheapest = models[0]
    if (!cheapest || models.some((model) => model.id === openRouterSettings.model)) return
    void settingsActions.saveSettings({
      transcriptionProviderSettings: { openrouter: { model: cheapest.id } },
    })
  }, [models, openRouterSettings.model, settingsActions])

  /** Persists a partial OpenRouter request setting through the serialized queue. */
  const updateSettings = async (patch: OpenRouterTranscriptionSettingsPatch): Promise<void> => {
    await settingsActions.saveSettings({ transcriptionProviderSettings: { openrouter: patch } })
  }

  /** Validates and saves the currently entered OpenRouter key. */
  const handleSaveKey = async (): Promise<void> => {
    if (!apiKey.trim()) return
    setSavingKey(true)
    try {
      await settingsActions.saveApiKey('openrouter', apiKey.trim())
    } finally {
      setSavingKey(false)
    }
  }

  /** Deletes the saved OpenRouter credential after a successful main-process write. */
  const handleDeleteKey = async (): Promise<void> => {
    if (await settingsActions.deleteApiKey('openrouter')) setApiKey('')
  }

  return (
    <>
      <h2 className={styles.groupTitle}>{t('settings.connection')}</h2>
      <section className={styles.settingGroup}>
        <div className={styles.apiCreditNotice}>
          <KeyRound size={15} />
          <span>{t('settings.openRouterApiKeyCreditNotice')}</span>
          <Button
            className={styles.apiCreditLink ?? ''}
            type="link"
            size="small"
            icon={<ExternalLink size={13} />}
            onClick={() => void desktopActions.openExternal(OPENROUTER_KEYS_URL)}
          >
            {t('settings.getApiKey')}
          </Button>
        </div>
        <div className={`${styles.settingRow} ${styles.credentialRow}`}>
          <SettingLabel
            title={t('settings.openRouterApiKey')}
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
              title={t('settings.openRouterApiBalance')}
              description={t('settings.openRouterApiBalanceDescription')}
            />
            <strong className={styles.balanceValue}>{balanceText}</strong>
          </div>
        )}
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.transcriptionMethod')}
            description={t('settings.restMethodDescription')}
          />
          <strong className={styles.balanceValue}>REST</strong>
        </div>
      </section>

      <h2 className={styles.groupTitle}>{t('settings.recognition')}</h2>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.model')}
            description={t('settings.openRouterModelDescription')}
          />
          <div className={styles.settingControl}>
            <Select
              className={`${styles.wideControl ?? ''} ${styles.modelSelect ?? ''}`}
              value={openRouterSettings.model}
              loading={models.length === 0}
              showSearch
              optionFilterProp="searchText"
              options={modelOptions}
              onChange={(model: string) => void updateSettings({ model })}
            />
          </div>
        </div>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.speechLanguage')}
            description={t('settings.openRouterLanguageDescription')}
          />
          <div className={styles.settingControl}>
            <Select
              className={styles.wideControl ?? ''}
              value={openRouterSettings.language}
              showSearch
              optionFilterProp="searchText"
              options={languageOptions}
              onChange={(language: string) => void updateSettings({ language })}
            />
          </div>
        </div>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.transcriptSpeed')}
            description={t('settings.transcriptSpeedDescription')}
          />
          <div className={styles.settingControl}>
            <Select<RestTranscriptionSpeed>
              className={styles.wideControl ?? ''}
              value={openRouterSettings.speed}
              options={REST_TRANSCRIPTION_SPEEDS.map((speed) => ({
                value: speed,
                label: t(`settings.transcriptionSpeeds.${speed}`),
              }))}
              onChange={(speed) => void updateSettings({ speed })}
            />
          </div>
        </div>
      </section>
    </>
  )
}

/** Displays local Whisper model management, load state, and language selection. */
const LocalSettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const localSettings = settings.transcriptionProviderSettings.local
  const models = useAppSelector((state) => state.app.localModels)
  const operations = useAppSelector((state) => state.app.localModelOperations)
  const engine = useAppSelector((state) => state.app.localEngineState)
  const session = useAppSelector((state) => state.app.session.state)
  const dispatch = useAppDispatch()
  const settingsActions = useSettingsActions()
  const { message, modal } = AntdApp.useApp()
  const { t } = useTranslation()
  const [modelSearch, setModelSearch] = useState('')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [ejectingModel, setEjectingModel] = useState(false)
  const languageNames = useMemo(
    () => new Intl.DisplayNames([settings.uiLanguage, 'en'], { type: 'language' }),
    [settings.uiLanguage],
  )
  const downloadedModels = useMemo(() => models.filter((model) => model.isDownloaded), [models])
  const selectedModel = models.find((model) => model.id === localSettings.modelId)
  const loadingSelected = engine.state === 'loading'
  const modelLoaded =
    engine.state === 'ready' && engine.modelId === localSettings.modelId && Boolean(selectedModel)
  const displayedModelId = loadingSelected ? (engine.modelId ?? '') : localSettings.modelId

  const modelOptions = useMemo(
    () =>
      downloadedModels.map((model) => ({
        value: model.id,
        searchText: `${model.name} ${model.id}`,
        label: (
          <span className={styles.modelOption}>
            <span className={styles.modelOptionName}>{model.name}</span>
            <span className={styles.modelOptionPrice}>
              {model.origin === 'huggingface' ? t('settings.localSharedCache') : model.filename}
            </span>
          </span>
        ),
      })),
    [downloadedModels, t],
  )
  const availableLanguages = selectedModel?.languages ?? LOCAL_TRANSCRIPTION_LANGUAGES
  const languageOptions = useMemo(
    () => [
      ...((selectedModel?.supportsLanguageDetection ?? true)
        ? [{ value: 'auto', label: t('settings.automaticLanguage') }]
        : []),
      ...availableLanguages.map((language) => ({
        value: language,
        label: `${languageNames.of(language) ?? language} (${language})`,
      })),
    ],
    [availableLanguages, languageNames, selectedModel?.supportsLanguageDetection, t],
  )
  const catalogLanguageOptions = useMemo(
    () =>
      [...new Set(models.flatMap((model) => model.languages))]
        .sort((left, right) => {
          const leftName = languageNames.of(left) ?? left
          const rightName = languageNames.of(right) ?? right
          return leftName.localeCompare(rightName, settings.uiLanguage)
        })
        .map((language) => ({
          value: language,
          searchText: `${languageNames.of(language) ?? language} ${language}`,
          label: `${languageNames.of(language) ?? language} (${language})`,
        })),
    [languageNames, models, settings.uiLanguage],
  )
  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLocaleLowerCase(settings.uiLanguage)
    return models.filter((model) => {
      const matchesName =
        !query ||
        `${model.name} ${model.id} ${model.family}`
          .toLocaleLowerCase(settings.uiLanguage)
          .includes(query)
      const matchesLanguage = languageFilter === 'all' || model.languages.includes(languageFilter)
      return matchesName && matchesLanguage
    })
  }, [languageFilter, modelSearch, models, settings.uiLanguage])

  /** Persists a partial Local setting through the serialized settings queue. */
  const updateSettings = async (patch: LocalTranscriptionSettingsPatch): Promise<void> => {
    await settingsActions.saveSettings({ transcriptionProviderSettings: { local: patch } })
  }

  /** Loads a complete model before committing it as the selected Local model. */
  const handleSelectModel = async (modelId: string): Promise<void> => {
    try {
      dispatch(setSettings(await window.app.selectLocalModel(modelId)))
    } catch {
      void message.error(t('settings.localModelLoadFailed'))
    }
  }

  /** Releases the active engine model and clears the persisted model selection. */
  const handleEjectModel = async (): Promise<void> => {
    setEjectingModel(true)
    try {
      dispatch(setSettings(await window.app.ejectLocalModel()))
    } catch {
      void message.error(t('settings.localModelEjectFailed'))
    } finally {
      setEjectingModel(false)
    }
  }

  /** Starts a managed download while progress arrives through the event bridge. */
  const handleDownload = (modelId: string): void => {
    void window.app.downloadLocalModel(modelId).catch(() => undefined)
  }

  /** Confirms and removes only an application-managed model copy. */
  const handleDelete = (modelId: string): void => {
    modal.confirm({
      title: t('settings.localDeleteModelTitle'),
      content: t('settings.localDeleteModelDescription'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      onOk: async () => {
        dispatch(setSettings(await window.app.deleteLocalModel(modelId)))
      },
    })
  }

  return (
    <>
      <h2 className={styles.groupTitle}>{t('settings.recognition')}</h2>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.model')}
            description={t('settings.localSelectedModelDescription')}
          />
          <div className={styles.settingControl}>
            <Select
              className={`${styles.wideControl ?? ''} ${styles.modelSelect ?? ''}`}
              value={
                loadingSelected
                  ? displayedModelId
                  : selectedModel?.isDownloaded
                    ? displayedModelId
                    : null
              }
              placeholder={t('settings.localSelectModel')}
              loading={loadingSelected}
              disabled={session !== 'idle' || downloadedModels.length === 0}
              showSearch
              optionFilterProp="searchText"
              options={modelOptions}
              onChange={(modelId: string) => void handleSelectModel(modelId)}
            />
            {modelLoaded && (
              <Button
                icon={<Unplug size={14} />}
                loading={ejectingModel}
                disabled={session !== 'idle'}
                onClick={() => void handleEjectModel()}
              >
                {t('settings.localEjectModel')}
              </Button>
            )}
          </div>
        </div>
        {loadingSelected && (
          <div className={styles.localLoadProgress}>
            <span>{t('settings.localLoadingModel')}</span>
            <Progress percent={100} showInfo={false} status="active" size="small" />
          </div>
        )}
        <div className={styles.settingRow}>
          <SettingLabel
            title={t('settings.speechLanguage')}
            description={t('settings.localLanguageDescription')}
          />
          <div className={styles.settingControl}>
            <Select
              className={styles.wideControl ?? ''}
              value={localSettings.language}
              showSearch
              options={languageOptions}
              onChange={(language: string) => void updateSettings({ language })}
            />
          </div>
        </div>
      </section>

      <div className={styles.localCatalogHeader}>
        <h2 className={styles.groupTitle}>{t('settings.localModels')}</h2>
        <Space size={6}>
          <Button
            size="small"
            icon={<RefreshCw size={13} />}
            onClick={() => void window.app.rescanLocalModels()}
          >
            {t('settings.localScan')}
          </Button>
          <Button
            size="small"
            icon={<FolderOpen size={13} />}
            onClick={() => void window.app.openLocalModelsDirectory()}
          >
            {t('settings.localOpenFolder')}
          </Button>
        </Space>
      </div>
      <div className={`${styles.apiCreditNotice} ${styles.localHardwareNotice}`}>
        <Cpu size={15} />
        <span>{t('settings.localHardwareNotice')}</span>
      </div>
      <div className={styles.localCatalogFilters}>
        <Input
          allowClear
          value={modelSearch}
          placeholder={t('settings.localSearchModels')}
          onChange={(event) => setModelSearch(event.target.value)}
        />
        <Select
          value={languageFilter}
          showSearch
          optionFilterProp="searchText"
          options={[
            {
              value: 'all',
              searchText: t('settings.localAllLanguages'),
              label: t('settings.localAllLanguages'),
            },
            ...catalogLanguageOptions,
          ]}
          onChange={(language: string) => setLanguageFilter(language)}
        />
      </div>
      <section className={styles.localModelGrid}>
        {filteredModels.map((model) => {
          const operation = operations[model.id]
          const downloading =
            !model.isDownloaded && (operation?.phase === 'downloading' || model.isDownloading)
          const verifying = !model.isDownloaded && operation?.phase === 'verifying'
          const percent = Math.max(0, Math.min(100, operation?.percentage ?? 0))
          return (
            <article className={styles.localModelCard} key={model.id}>
              <div className={styles.localModelCardHeader}>
                <div>
                  <strong>{model.name}</strong>
                  <span>{model.id}</span>
                </div>
                {model.isRecommended && <Tag color="green">{t('settings.recommended')}</Tag>}
              </div>
              <p>{model.description}</p>
              <div className={styles.localModelMeta}>
                <Tag color="blue">{model.family}</Tag>
                {model.sizeBytes > 0 && <Tag>{formatBytes(model.sizeBytes)}</Tag>}
                <Tag>{model.license}</Tag>
                {model.isDownloaded && (
                  <Tag color="success" icon={<CircleCheck size={11} />}>
                    {model.origin === 'huggingface'
                      ? t('settings.localSharedCache')
                      : t('settings.localDownloaded')}
                  </Tag>
                )}
              </div>
              {(downloading || verifying) && (
                <Progress
                  percent={verifying ? 100 : Math.round(percent)}
                  status="active"
                  size="small"
                  format={() =>
                    verifying ? t('settings.localVerifying') : `${Math.round(percent)}%`
                  }
                />
              )}
              <div className={styles.localModelActions}>
                {downloading || verifying ? (
                  <Button
                    size="small"
                    icon={<X size={13} />}
                    onClick={() => void window.app.cancelLocalModelDownload(model.id)}
                  >
                    {t('common.cancel')}
                  </Button>
                ) : !model.isDownloaded ? (
                  <Button
                    type="primary"
                    size="small"
                    icon={<Download size={13} />}
                    onClick={() => handleDownload(model.id)}
                  >
                    {model.partialBytes > 0
                      ? t('settings.localResumeDownload')
                      : t('settings.localDownload')}
                  </Button>
                ) : localSettings.modelId === model.id && engine.state === 'ready' ? (
                  <Button
                    size="small"
                    icon={<Unplug size={13} />}
                    loading={ejectingModel}
                    disabled={session !== 'idle'}
                    onClick={() => void handleEjectModel()}
                  >
                    {t('settings.localEjectModel')}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    disabled={session !== 'idle'}
                    onClick={() => void handleSelectModel(model.id)}
                  >
                    {t('settings.localUseModel')}
                  </Button>
                )}
                {model.canDelete && (
                  <Button
                    danger
                    size="small"
                    icon={<Trash2 size={13} />}
                    disabled={session !== 'idle'}
                    onClick={() => handleDelete(model.id)}
                  >
                    {t('common.delete')}
                  </Button>
                )}
              </div>
            </article>
          )
        })}
        {filteredModels.length === 0 && (
          <Empty
            className={styles.localCatalogEmpty ?? ''}
            description={t('settings.localNoModels')}
          />
        )}
      </section>
    </>
  )
}

/** Formats model sizes with compact binary units. */
const formatBytes = (bytes: number): string => {
  if (bytes < 1_024 ** 2) return `${Math.round(bytes / 1_024)} KB`
  if (bytes < 1_024 ** 3) return `${Math.round(bytes / 1_024 ** 2)} MB`
  return `${(bytes / 1_024 ** 3).toFixed(1)} GB`
}

/** Displays provider selection and renders only the selected provider's independent settings. */
const TranscriptionSettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const session = useAppSelector((state) => state.app.session.state)
  const settingsActions = useSettingsActions()
  const { t } = useTranslation()

  return (
    <div className={styles.settingContainer}>
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
      {settings.transcriptionProvider === 'openrouter' && <OpenRouterSettingsSection />}
      {settings.transcriptionProvider === 'local' && <LocalSettingsSection />}
    </div>
  )
}

export default TranscriptionSettingsSection
