/**
 * Verifies that the Electron renderer cannot navigate through URL-prefix lookalikes.
 */

import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isTrustedRendererNavigation } from '../src/main/security/RendererNavigationPolicy'

const rendererPath = 'C:\\Transcript\\out\\renderer\\index.html'

describe('renderer navigation policy', () => {
  it('allows only the packaged renderer document for file navigation', () => {
    const rendererUrl = pathToFileURL(rendererPath)
    rendererUrl.hash = 'settings'

    expect(isTrustedRendererNavigation(rendererUrl.href, rendererPath)).toBe(true)
    expect(
      isTrustedRendererNavigation(
        pathToFileURL('C:\\Transcript\\out\\renderer\\unexpected.html').href,
        rendererPath,
      ),
    ).toBe(false)
  })

  it('allows the exact development origin and rejects prefix lookalikes', () => {
    const developmentUrl = 'http://localhost:5173/'

    expect(
      isTrustedRendererNavigation(
        'http://localhost:5173/settings?section=general',
        rendererPath,
        developmentUrl,
      ),
    ).toBe(true)
    expect(
      isTrustedRendererNavigation(
        'http://localhost:5173.evil.example/settings',
        rendererPath,
        developmentUrl,
      ),
    ).toBe(false)
  })
})
