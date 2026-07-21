/**
 * Renders transcript documents into portable text and lossless JSON formats.
 */

import type { TranscriptDocument, TranscriptFormat } from '@shared/types'

/** Formats a millisecond offset as an elapsed timestamp. */
const formatTimestamp = (offsetMs: number): string => {
  const totalSeconds = Math.floor(offsetMs / 1000)
  return `${Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`
}

/** Renders one transcript in the requested export format. */
export const renderTranscript = (
  transcript: TranscriptDocument,
  format: TranscriptFormat,
): string => {
  if (format === 'json') return `${JSON.stringify(transcript, null, 2)}\n`
  const lines = transcript.segments.map((segment) => {
    const source = segment.source === 'microphone' ? 'Microphone' : 'Speaker'
    return `[${formatTimestamp(segment.offsetMs)}] ${source}: ${segment.text}`
  })
  return `${transcript.title}\n${'='.repeat(transcript.title.length)}\n\n${lines.join('\n')}\n`
}
