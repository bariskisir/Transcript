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
})
