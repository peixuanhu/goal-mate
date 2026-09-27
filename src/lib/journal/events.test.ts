import { expect, it } from 'vitest'
import { assignEventLanes } from './events'
import type { JournalEventView } from './types'

it('clips cross-month ranges and separates inclusive overlap', () => {
  const event = (id: string, start: string, end: string): JournalEventView => ({
    event_id: id, title: id, start_date: start, end_date: end, note: '', source: 'custom',
    status: 'planned', plan_id: null, goal_id: null, progress_record_id: null, version: 1, sync_completion: false,
  })
  const lanes = assignEventLanes([
    event('a', '2026-08-28', '2026-09-03'), event('b', '2026-09-03', '2026-09-05'),
    event('c', '2026-09-06', '2026-10-02'), event('single', '2026-09-08', '2026-09-08'),
  ], '2026-09')
  expect(lanes[0]).toMatchObject({ clipped_start: '2026-09-01', continues_before: true, lane: 0 })
  expect(lanes[1].lane).toBe(1)
  expect(lanes[2]).toMatchObject({ clipped_end: '2026-09-30', continues_after: true, lane: 0 })
  expect(lanes).toHaveLength(3)
})
