/**
 * Guards user-facing diagnostic interpolation against unresolved locale placeholders.
 */

import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'
import en from '../src/renderer/src/i18n/locales/en'

describe('diagnostic localization', () => {
  it('renders capture details instead of exposing the interpolation token', async () => {
    const i18n = createInstance()
    await i18n.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    })

    expect(i18n.t('errors.captureDetails', { details: 'Permission denied' })).toBe(
      'Audio capture could not start: Permission denied',
    )
  })
})
