/**
 * Verifies Bing language normalization and response handling without network access.
 */

import { describe, expect, it, vi } from 'vitest'
import BingTranslateService from '../src/main/services/BingTranslateService'

describe('BingTranslateService', () => {
  it('translates a trimmed sentence with normalized regional language codes', async () => {
    const translate = vi.fn(async () => ({ translation: 'merhaba' }))
    const service = new BingTranslateService(translate)

    await expect(service.translate('  hello  ', 'en-US', 'tr')).resolves.toBe('merhaba')
    expect(translate).toHaveBeenCalledWith('hello', 'en', 'tr')
  })

  it('maps traditional Chinese speech locales to the Bing script code', async () => {
    const translate = vi.fn(async () => ({ translation: '你好' }))
    const service = new BingTranslateService(translate)

    await service.translate('Hello', 'zh-TW', 'zh')

    expect(translate).toHaveBeenCalledWith('Hello', 'zh-Hant', 'zh-Hans')
  })

  it('rejects an empty provider response', async () => {
    const service = new BingTranslateService(vi.fn(async () => undefined))

    await expect(service.translate('Hello', 'en', 'tr')).rejects.toThrow(
      'Bing Translator returned an empty response.',
    )
  })
})
