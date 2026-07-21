/**
 * Verifies the renderer state transition from replaceable interim text to durable final text.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  type BootstrapPayload,
  type TranscriptDocument,
  type TranscriptSegment,
} from '../src/shared/types'
import reducer, {
  addHistorySummary,
  hydrate,
  receiveTranscriptResult,
  removeHistorySummary,
  replaceCurrentTranscript,
  replaceHistorySummary,
  setCurrentTranscript,
  setSessionState,
} from '../src/renderer/src/store/appSlice'

const transcript: TranscriptDocument = {
  id: '60816155-248f-4896-a010-bd6b1b0f80a0',
  title: 'Live transcript',
  isDefaultTitle: false,
  language: 'en',
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
  durationMs: 0,
  segments: [],
}

describe('live transcript state', () => {
  it('does not let a repeated bootstrap response replace the selected transcript', () => {
    const bootstrap: BootstrapPayload = {
      settings: DEFAULT_SETTINGS,
      transcripts: [],
      currentTranscript: transcript,
      hasApiKey: true,
      platform: 'win32',
      version: '3.0.0',
    }
    const selectedTranscript: TranscriptDocument = {
      ...transcript,
      id: '194aefb7-374d-42ef-8885-142dbbc9fb7f',
      title: 'Selected transcript',
    }

    let state = reducer(undefined, hydrate(bootstrap))
    state = reducer(state, setCurrentTranscript(selectedTranscript))
    state = reducer(state, hydrate(bootstrap))

    expect(state.currentTranscript?.id).toBe(selectedTranscript.id)
  })

  it('replaces interim text and clears it when the corrected result becomes final', () => {
    let state = reducer(undefined, setCurrentTranscript(transcript))
    state = reducer(
      state,
      receiveTranscriptResult({
        source: 'microphone',
        text: 'A quick brown',
        isFinal: false,
        speechFinal: false,
        confidence: 0.6,
      }),
    )
    state = reducer(
      state,
      receiveTranscriptResult({
        source: 'microphone',
        text: 'The quick brown fox',
        isFinal: false,
        speechFinal: false,
        confidence: 0.8,
      }),
    )
    expect(state.interim.microphone).toBe('The quick brown fox')

    const segment: TranscriptSegment = {
      id: '82640d84-52c7-4bf5-8323-e768cf5ac378',
      source: 'microphone',
      text: 'The quick brown fox.',
      confidence: 0.96,
      createdAt: '2026-07-21T10:00:01.000Z',
      offsetMs: 1_000,
    }
    state = reducer(
      state,
      receiveTranscriptResult({
        source: 'microphone',
        text: segment.text,
        isFinal: true,
        speechFinal: true,
        confidence: segment.confidence,
        segment,
      }),
    )

    expect(state.interim.microphone).toBe('')
    expect(state.currentTranscript?.segments).toEqual([segment])
  })

  it('clears a source hypothesis when Deepgram finalizes without a persisted segment', () => {
    let state = reducer(undefined, setCurrentTranscript(transcript))
    state = reducer(
      state,
      receiveTranscriptResult({
        source: 'speaker',
        text: 'replaceable words',
        isFinal: false,
        speechFinal: false,
        confidence: 0.5,
      }),
    )
    state = reducer(
      state,
      receiveTranscriptResult({
        source: 'speaker',
        text: '',
        isFinal: true,
        speechFinal: true,
        confidence: 0,
      }),
    )

    expect(state.interim.speaker).toBe('')
    expect(state.currentTranscript?.segments).toEqual([])
  })

  it('clears transient levels and hypotheses when the session becomes idle', () => {
    let state = reducer(undefined, setCurrentTranscript(transcript))
    state = reducer(
      state,
      receiveTranscriptResult({
        source: 'microphone',
        text: 'unfinished phrase',
        isFinal: false,
        speechFinal: false,
        confidence: 0.7,
      }),
    )
    state = reducer(state, setSessionState({ state: 'idle' }))

    expect(state.interim).toEqual({ microphone: '', speaker: '' })
    expect(state.levels).toEqual({ microphone: 0, speaker: 0 })
  })

  it('updates history atomically without replacing an unrelated active transcript', () => {
    const firstSummary = {
      id: transcript.id,
      title: transcript.title,
      isDefaultTitle: transcript.isDefaultTitle,
      language: transcript.language,
      createdAt: transcript.createdAt,
      updatedAt: transcript.updatedAt,
      durationMs: transcript.durationMs,
      segmentCount: 0,
      preview: '',
    }
    const otherTranscript = {
      ...transcript,
      id: '194aefb7-374d-42ef-8885-142dbbc9fb7f',
      title: 'Other transcript',
    }
    let state = reducer(undefined, setCurrentTranscript(otherTranscript))
    state = reducer(state, addHistorySummary(firstSummary))
    state = reducer(state, replaceHistorySummary({ ...firstSummary, title: 'Renamed transcript' }))
    state = reducer(state, replaceCurrentTranscript({ ...transcript, title: 'Renamed transcript' }))

    expect(state.history).toHaveLength(1)
    expect(state.history[0]?.title).toBe('Renamed transcript')
    expect(state.currentTranscript?.id).toBe(otherTranscript.id)

    state = reducer(state, removeHistorySummary(transcript.id))
    expect(state.history).toEqual([])
  })
})
