import { describe, expect, it } from 'vitest'
import { defaultTrackerConfig } from './defaults'
import { parseJournalValue, parseTrackerConfig, parseMeasurementInput, revisionForDate } from './validation'

describe('journal values and configuration', () => {
  it('distinguishes explicit false and zero from missing', () => {
    expect(parseJournalValue('boolean', false, [])).toBe(false)
    expect(parseJournalValue('quantity', '0', [])).toBe('0')
    expect(() => parseJournalValue('boolean', null, [])).toThrow()
  })
  it.each(['NaN', 'Infinity', '1e8', '1.12345', '12345678901234567'])('rejects invalid decimal %s', value => {
    expect(() => parseJournalValue('quantity', value, [])).toThrow()
  })
  it('matches enum identifiers instead of display labels', () => {
    const options = [{ id: 'happy', label: '开心', symbol: '☺', color: '#aabbcc' }]
    expect(parseJournalValue('enum', 'happy', options)).toBe('happy')
    expect(() => parseJournalValue('enum', '开心', options)).toThrow()
  })
  it('uses the revision effective on the occurrence date', () => {
    const revisions = [{ effective_from: '2026-09-01', revision_id: 'v1' }, { effective_from: '2026-10-01', revision_id: 'v2' }]
    expect(revisionForDate(revisions, '2026-08-31')).toBeNull()
    expect(revisionForDate(revisions, '2026-09-30')?.revision_id).toBe('v1')
    expect(revisionForDate(revisions, '2026-10-01')?.revision_id).toBe('v2')
  })
  it('requires an associated plan for a completion source', () => {
    expect(() => parseTrackerConfig({ ...defaultTrackerConfig('boolean'), source: 'plan' }, 'boolean', null)).toThrow()
  })
  it('rejects snapshot summation and automatic implicit completion writes', () => {
    expect(() => parseTrackerConfig({ ...defaultTrackerConfig('snapshot'), daily_aggregation: 'sum' }, 'snapshot', null)).toThrow()
    expect(() => parseTrackerConfig({ ...defaultTrackerConfig('boolean'), source: 'progress_field', sync_completion: true }, 'boolean', 'p')).toThrow()
  })
  it('rejects duplicate weekdays, zero-sized blocks, unknown fields and reversed bounds', () => {
    const config = defaultTrackerConfig('quantity')
    for (const changed of [{ active_weekdays: [1, 1] }, { units_per_cell: '0' }, { invented: true }, { minimum: '20', maximum: '10' }]) {
      expect(() => parseTrackerConfig({ ...config, ...changed }, 'quantity', null)).toThrow()
    }
  })
  it('preserves a zero request value while validating date and version', () => {
    const input = { tracker_id: 't', date: '2026-09-12', expected_version: 0, value: '0', status: 'recorded', note: '', request_id: '6b41b5ea-0f66-4a64-a72a-4cb2f39fcfc3' }
    expect(parseMeasurementInput(input).value).toBe('0')
    expect(() => parseMeasurementInput({ ...input, date: '2026-02-30' })).toThrow()
    expect(() => parseMeasurementInput({ ...input, expected_version: -1 })).toThrow()
  })
})
