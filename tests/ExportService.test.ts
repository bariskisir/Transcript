/**
 * Verifies portable transcript rendering without Electron or filesystem dependencies.
 */

import { describe, expect, it } from 'vitest'
import type { TranscriptDocument } from '../src/shared/types'
import { renderTranscript } from '../src/main/services/ExportService'

const transcript: TranscriptDocument = {
  id: '5f4f7f37-61e3-4ef2-9b97-f970ad47885e',
  title: 'Product sync',
  isDefaultTitle: false,
  language: 'en',
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:03.000Z',
  durationMs: 3_000,
  segments: [
    {
      id: '94156f2a-6b99-42b2-8a4f-eb391893d117',
      source: 'microphone',
      text: 'Welcome.',
      confidence: 0.99,
      createdAt: '2026-07-21T10:00:01.000Z',
      offsetMs: 1_000,
    },
    {
      id: 'f5af39db-385b-443e-99b3-44c425026136',
      source: 'speaker',
      text: 'Thank you.',
      confidence: 0.98,
      createdAt: '2026-07-21T10:00:02.000Z',
      offsetMs: 2_000,
    },
  ],
  translations: [],
}

describe('renderTranscript', () => {
  it('renders source labels and elapsed timestamps as text', () => {
    const result = renderTranscript(transcript, 'txt')
    expect(result).toContain('[00:01] Microphone: Welcome.')
    expect(result).toContain('[00:02] Speaker: Thank you.')
  })

  it('renders lossless JSON', () => {
    expect(JSON.parse(renderTranscript(transcript, 'json'))).toEqual(transcript)
  })

  it('includes the selected translation in text exports when it has content', () => {
    const translated: TranscriptDocument = {
      ...transcript,
      translations: [
        {
          id: 'd851ff1c-1f5b-489c-9b59-f2c94b7b573b',
          provider: 'bing',
          sourceText: 'Welcome. Thank you.',
          text: 'Hoş geldiniz. Teşekkürler.',
          sourceLanguage: 'en',
          targetLanguage: 'tr',
          sourceSegmentIds: transcript.segments.map((segment) => segment.id),
          sourceStartIndex: 0,
          sourceEndIndex: 19,
          createdAt: '2026-07-21T10:00:03.000Z',
        },
      ],
    }

    const result = renderTranscript(translated, 'txt', true, 'bing', 'tr')

    expect(result).toContain('Translation (tr)')
    expect(result).toContain('Hoş geldiniz. Teşekkürler.')
    expect(renderTranscript(translated, 'txt', true, 'bing', 'de')).not.toContain(
      'Translation (de)',
    )
    expect(renderTranscript(translated, 'txt', true, 'google', 'tr')).not.toContain(
      'Translation (tr)',
    )
    expect(renderTranscript(translated, 'txt', false, 'bing', 'tr')).not.toContain(
      'Translation (tr)',
    )
  })
})
