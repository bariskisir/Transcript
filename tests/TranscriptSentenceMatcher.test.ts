/**
 * Verifies completed-sentence detection and source segment range mapping.
 */

import { describe, expect, it } from 'vitest'
import type { TranscriptSegment } from '../src/shared/types'
import { findCompletedTranscriptSentences } from '../src/main/services/TranscriptSentenceMatcher'

const segments: TranscriptSegment[] = [
  {
    id: '94156f2a-6b99-42b2-8a4f-eb391893d117',
    source: 'microphone',
    text: 'First sentence. Second',
    confidence: 0.98,
    createdAt: '2026-07-22T10:00:00.000Z',
    offsetMs: 100,
  },
  {
    id: 'f5af39db-385b-443e-99b3-44c425026136',
    source: 'speaker',
    text: 'sentence! Partial',
    confidence: 0.97,
    createdAt: '2026-07-22T10:00:01.000Z',
    offsetMs: 200,
  },
]

describe('findCompletedTranscriptSentences', () => {
  it('excludes trailing partial text and maps cross-segment sentences', () => {
    const matches = findCompletedTranscriptSentences(segments)

    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({
      text: 'First sentence.',
      sourceSegmentIds: [segments[0]?.id],
    })
    expect(matches[1]).toMatchObject({
      text: 'Second sentence!',
      sourceSegmentIds: [segments[0]?.id, segments[1]?.id],
    })
    expect(matches[1]?.endIndex).toBe('First sentence. Second sentence!'.length)
  })

  it('does not split decimal punctuation without a whitespace boundary', () => {
    const firstSegment = segments[0]
    if (!firstSegment) throw new Error('The test fixture must contain one segment.')
    const decimal = [{ ...firstSegment, text: 'Pi is 3.14 today.' }]

    expect(findCompletedTranscriptSentences(decimal).map((match) => match.text)).toEqual([
      'Pi is 3.14 today.',
    ])
  })

  it('can resume after translated coverage and include final unpunctuated text', () => {
    const matches = findCompletedTranscriptSentences(segments, {
      startIndex: 'First sentence.'.length,
      includeTrailing: true,
    })

    expect(matches.map((match) => match.text)).toEqual(['Second sentence!', 'Partial'])
  })
})
