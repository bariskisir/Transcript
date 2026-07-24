/**
 * Verifies getInitialLanguage resolves valid locale codes, that the i18next
 * instance can be initialized, and that all 7 locale files share the same keys.
 */

import { describe, expect, it } from 'vitest'
import { getInitialLanguage, initializeI18n } from '../src/renderer/src/i18n/index'
import { APP_LOCALES, type AppLocale } from '../src/shared/types'

import de from '../src/renderer/src/i18n/locales/de'
import en from '../src/renderer/src/i18n/locales/en'
import es from '../src/renderer/src/i18n/locales/es'
import fr from '../src/renderer/src/i18n/locales/fr'
import pt from '../src/renderer/src/i18n/locales/pt'
import tr from '../src/renderer/src/i18n/locales/tr'
import zh from '../src/renderer/src/i18n/locales/zh'

type DeepKeys<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object ? `${K}.${DeepKeys<T[K]>}` : K
    }[keyof T & string]
  : never

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix]
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...collectKeys(value, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

const locales: Record<AppLocale, Record<string, unknown>> = {
  en: en as unknown as Record<string, unknown>,
  tr: tr as unknown as Record<string, unknown>,
  de: de as unknown as Record<string, unknown>,
  fr: fr as unknown as Record<string, unknown>,
  pt: pt as unknown as Record<string, unknown>,
  zh: zh as unknown as Record<string, unknown>,
  es: es as unknown as Record<string, unknown>,
}

describe('getInitialLanguage', () => {
  it('returns en when navigator.language is not in the supported locales', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'jp-JP' },
      writable: true,
      configurable: true,
    })
    expect(getInitialLanguage()).toBe('en')
  })

  it('returns tr when navigator.language starts with tr', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'tr-TR' },
      writable: true,
      configurable: true,
    })
    expect(getInitialLanguage()).toBe('tr')
  })

  it('returns de when navigator.language starts with de', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'de-DE' },
      writable: true,
      configurable: true,
    })
    expect(getInitialLanguage()).toBe('de')
  })

  it('returns fr when navigator.language starts with fr', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'fr-FR' },
      writable: true,
      configurable: true,
    })
    expect(getInitialLanguage()).toBe('fr')
  })

  it('returns pt when navigator.language starts with pt', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'pt-BR' },
      writable: true,
      configurable: true,
    })
    expect(getInitialLanguage()).toBe('pt')
  })

  it('returns zh when navigator.language starts with zh', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'zh-CN' },
      writable: true,
      configurable: true,
    })
    expect(getInitialLanguage()).toBe('zh')
  })

  it('returns es when navigator.language starts with es', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'es-ES' },
      writable: true,
      configurable: true,
    })
    expect(getInitialLanguage()).toBe('es')
  })

  it('returns en when navigator.language is empty', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: '' },
      writable: true,
      configurable: true,
    })
    expect(getInitialLanguage()).toBe('en')
  })

  it('returns a valid AppLocale', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en-US' },
      writable: true,
      configurable: true,
    })
    const result = getInitialLanguage()
    expect(APP_LOCALES).toContain(result)
  })
})

describe('locale key consistency', () => {
  const englishKeys = collectKeys(locales.en).sort()

  it('all 7 locales are defined', () => {
    expect(Object.keys(locales)).toHaveLength(7)
    for (const locale of APP_LOCALES) {
      expect(locales[locale]).toBeDefined()
    }
  })

  it('all locales have the same number of leaf keys as English', () => {
    for (const [locale, resource] of Object.entries(locales)) {
      const keys = collectKeys(resource)
      expect(
        keys.length,
        `Locale "${locale}" has ${keys.length} keys but English has ${englishKeys.length}`,
      ).toBe(englishKeys.length)
    }
  })

  it('Turkish has the same keys as English', () => {
    const trKeys = collectKeys(locales.tr).sort()
    expect(trKeys).toEqual(englishKeys)
  })

  it('German has the same keys as English', () => {
    const deKeys = collectKeys(locales.de).sort()
    expect(deKeys).toEqual(englishKeys)
  })

  it('French has the same keys as English', () => {
    const frKeys = collectKeys(locales.fr).sort()
    expect(frKeys).toEqual(englishKeys)
  })

  it('Portuguese has the same keys as English', () => {
    const ptKeys = collectKeys(locales.pt).sort()
    expect(ptKeys).toEqual(englishKeys)
  })

  it('Chinese has the same keys as English', () => {
    const zhKeys = collectKeys(locales.zh).sort()
    expect(zhKeys).toEqual(englishKeys)
  })

  it('Spanish has the same keys as English', () => {
    const esKeys = collectKeys(locales.es).sort()
    expect(esKeys).toEqual(englishKeys)
  })

  it('all locale values are non-empty strings', () => {
    for (const [locale, resource] of Object.entries(locales)) {
      const keys = collectKeys(resource)
      for (const key of keys) {
        const value = key.split('.').reduce((obj: any, part) => obj?.[part], resource)
        expect(typeof value, `Locale "${locale}" key "${key}" should be a string`).toBe('string')
        expect(value.length, `Locale "${locale}" key "${key}" should not be empty`).toBeGreaterThan(
          0,
        )
      }
    }
  })
})
