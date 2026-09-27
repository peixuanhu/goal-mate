import { describe, expect, it } from 'vitest'
import { journalMonthRange, listMonthDates, shiftJournalMonth } from './date'

describe('journal calendar', () => {
  it('uses the actual days of leap and ordinary February', () => {
    expect(listMonthDates('2028-02')).toHaveLength(29)
    expect(listMonthDates('2026-02')).toHaveLength(28)
    expect(listMonthDates('2026-09')).toHaveLength(30)
    expect(listMonthDates('2026-12')).toHaveLength(31)
  })
  it('bounds a Shanghai month by local midnight', () => {
    const range = journalMonthRange('2026-09', 'Asia/Shanghai')
    expect(range.start.toISOString()).toBe('2026-08-31T16:00:00.000Z')
    expect(range.endExclusive.toISOString()).toBe('2026-09-30T16:00:00.000Z')
  })
  it('uses civil boundaries across a daylight saving change', () => {
    const range = journalMonthRange('2026-11', 'America/New_York')
    expect(range.start.toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(range.endExclusive.toISOString()).toBe('2026-12-01T05:00:00.000Z')
  })
  it.each(['2026-00', '2026-13', 'September', '2026-9', '0000-01'])('rejects invalid month %s', month => {
    expect(() => listMonthDates(month)).toThrow()
  })
  it('moves across year boundaries without overflowing the current day', () => {
    expect(shiftJournalMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftJournalMonth('2026-01', -1)).toBe('2025-12')
  })
})
