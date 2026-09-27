import { describe, expect, it } from 'vitest'
import { aggregateDay, summarizeNumericMonth, summarizeHabitDays, trendSegments } from './aggregate'

describe('journal daily and monthly aggregation', () => {
  const sample = (id: string, value: string | boolean | null, status: 'recorded' | 'skipped' | 'cleared' = 'recorded') => ({ id, value, status, timestamp: '2026-09-12T08:00:00Z' })
  it('retains an explicitly recorded zero', () => {
    expect(aggregateDay('quantity', 'sum', [sample('a', '0')])).toEqual({ state: 'recorded', value: '0' })
    expect(aggregateDay('boolean', 'any', [sample('a', false)])).toEqual({ state: 'recorded', value: false })
  })
  it('does not sum duplicate source identifiers', () => {
    expect(aggregateDay('quantity', 'sum', [sample('a', '1'), sample('a', '1'), sample('b', '1')]).value).toBe('2')
  })
  it('keeps empty, skipped and zero months distinct', () => {
    expect(aggregateDay('quantity', 'sum', []).state).toBe('missing')
    expect(aggregateDay('quantity', 'sum', [sample('a', null, 'skipped')]).state).toBe('skipped')
    expect(summarizeNumericMonth('quantity', [], null).sum).toBeNull()
    expect(summarizeNumericMonth('quantity', ['0'], null).sum).toBe('0')
  })
  it('sums decimal quantities exactly', () => {
    expect(summarizeNumericMonth('quantity', ['0.1', '0.2'], null).sum).toBe('0.3')
  })
  it('reports the final snapshot and growth without adding stock values', () => {
    expect(summarizeNumericMonth('snapshot', ['1080', '1090', '1100'], '1070')).toEqual({ sum: null, last: '1100', baseline: '1070', delta: '30' })
    expect(summarizeNumericMonth('snapshot', [], '1070').last).toBeNull()
  })
  it('orders the last observation by time rather than input order', () => {
    const samples = [{ ...sample('later', '8'), timestamp: '2026-09-12T10:00:00Z' }, sample('early', '3')]
    expect(aggregateDay('snapshot', 'last', samples).value).toBe('8')
  })
  it('does not turn missing dates into failures for an observed-day rate', () => {
    expect(summarizeHabitDays([
      { date: '2026-09-01', state: 'recorded', passed: true },
      { date: '2026-09-02', state: 'missing', passed: null },
      { date: '2026-09-03', state: 'recorded', passed: true },
      { date: '2026-09-04', state: 'skipped', passed: null },
    ], '2026-09-04', true)).toEqual({ streak: 1, completion_rate: 1 })
  })
  it('breaks trend lines at missing observations instead of interpolating', () => {
    expect(trendSegments([
      { date: '2026-09-01', state: 'recorded', value: '100' },
      { date: '2026-09-02', state: 'missing', value: null },
      { date: '2026-09-03', state: 'recorded', value: '110' },
      { date: '2026-09-04', state: 'recorded', value: '0' },
    ])).toEqual([
      [{ date: '2026-09-01', value: 100 }],
      [{ date: '2026-09-03', value: 110 }, { date: '2026-09-04', value: 0 }],
    ])
  })
})
