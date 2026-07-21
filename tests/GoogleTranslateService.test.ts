/**
 * Verifies Google Translate request encoding and defensive response parsing.
 */

import { describe, expect, it } from 'vitest'
import GoogleTranslateService from '../src/main/services/GoogleTranslateService'

describe('GoogleTranslateService', () => {
  it('uses coarse language codes and joins nested translated chunks', async () => {
    let requestedUrl = ''
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = String(input)
      return new Response(
        JSON.stringify([
          [
            ['Merhaba ', 'Hello '],
            ['dünya.', 'world.'],
          ],
          null,
          'en',
        ]),
        { status: 200 },
      )
    }
    const service = new GoogleTranslateService(fetcher)

    await expect(service.translate('Hello world.', 'en-US', 'tr')).resolves.toBe('Merhaba dünya.')
    const url = new URL(requestedUrl)
    expect(url.searchParams.get('sl')).toBe('en')
    expect(url.searchParams.get('tl')).toBe('tr')
    expect(url.searchParams.get('q')).toBe('Hello world.')
  })

  it('does not call the provider for blank text', async () => {
    let called = false
    const fetcher: typeof fetch = async () => {
      called = true
      return new Response('[]')
    }
    const service = new GoogleTranslateService(fetcher)

    await expect(service.translate('   ', 'en', 'tr')).resolves.toBe('')
    expect(called).toBe(false)
  })
})
