import { describe, expect, it } from 'vitest'
import { isJournalCompletion } from './completion-link'

describe('journal completion evidence', () => {
  it('accepts explicit completions only when they count', () => {
    expect(isJournalCompletion({ outcome: 'completed', counts_toward_recurrence: true }, false)).toBe(true)
    expect(isJournalCompletion({ outcome: 'completed', counts_toward_recurrence: false }, true)).toBe(false)
  })
  it('keeps legacy recurrence records compatible without treating ordinary prose as completed', () => {
    expect(isJournalCompletion({ outcome: null, counts_toward_recurrence: true }, true)).toBe(true)
    expect(isJournalCompletion({ outcome: null, counts_toward_recurrence: true }, false)).toBe(false)
  })
  it.each(['partial', 'skipped', 'cancelled'])('does not count %s', outcome => {
    expect(isJournalCompletion({ outcome, counts_toward_recurrence: true }, true)).toBe(false)
  })
})
