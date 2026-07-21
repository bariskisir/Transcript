/**
 * Verifies that Deepgram frames become safe, source-attributed application events.
 */

import { describe, expect, it } from 'vitest'
import { parseDeepgramMessage } from '../src/main/services/DeepgramMessageParser'

describe('parseDeepgramMessage', () => {
  it('preserves source attribution for final results', () => {
    const event = parseDeepgramMessage(
      'speaker',
      JSON.stringify({
        type: 'Results',
        is_final: true,
        speech_final: true,
        channel: { alternatives: [{ transcript: '  Hello world.  ', confidence: 0.94 }] },
      }),
    )

    expect(event).toEqual({
      source: 'speaker',
      text: 'Hello world.',
      isFinal: true,
      speechFinal: true,
      confidence: 0.94,
    })
  })

  it('ignores malformed and empty payloads', () => {
    expect(parseDeepgramMessage('microphone', '{')).toBeNull()
    expect(
      parseDeepgramMessage(
        'microphone',
        JSON.stringify({ type: 'Results', channel: { alternatives: [{ transcript: ' ' }] } }),
      ),
    ).toBeNull()
  })

  it('clamps confidence into the domain range', () => {
    const event = parseDeepgramMessage(
      'microphone',
      JSON.stringify({
        type: 'Results',
        channel: { alternatives: [{ transcript: 'Test', confidence: 1.8 }] },
      }),
    )

    expect(event?.confidence).toBe(1)
  })

  it('promotes a speech-final hypothesis to durable text', () => {
    const event = parseDeepgramMessage(
      'microphone',
      JSON.stringify({
        type: 'Results',
        is_final: false,
        speech_final: true,
        channel: { alternatives: [{ transcript: 'Corrected text.', confidence: 0.9 }] },
      }),
    )

    expect(event?.isFinal).toBe(true)
  })
})
