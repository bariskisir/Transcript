/**
 * Verifies the fixed transcript date layout and selectable clock format.
 */

import { describe, expect, it } from 'vitest'
import { formatDate } from '../src/renderer/src/utils/formatters'

describe('transcript date formatter', () => {
  it('uses DD.MM.YYYY with a 24-hour clock by default', () => {
    const localDate = new Date(2026, 11, 31, 23, 59)
    const formatted = formatDate(localDate.toISOString(), '24-hour')

    expect(formatted).toBe('31.12.2026 23:59')
  })

  it('keeps DD.MM.YYYY when the 12-hour preference is selected', () => {
    const localDate = new Date(2026, 11, 31, 23, 59)
    const formatted = formatDate(localDate.toISOString(), '12-hour')

    expect(formatted).toBe('31.12.2026 11:59 PM')
  })
})
