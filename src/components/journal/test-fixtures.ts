import { defaultTrackerConfig } from '@/lib/journal/defaults'
import { listMonthDates } from '@/lib/journal/date'
import type { JournalMonthView, TrackerKind, TrackerView } from '@/lib/journal/types'
export function trackerFixture(id = 't', kind: TrackerKind = 'boolean'): TrackerView {
  return { tracker_id: id, name: kind === 'boolean' ? '运动' : '播放量', kind, group: '生活', color: '#b6d99d', position: 0, version: 1,
    enabled_from: '2026-09-01', archived_from: null, revisions: [{ revision_id: `${id}-r`, effective_from: '2026-09-01', plan_id: null, plan_name: null, goal_id: null, goal_name: null, config: defaultTrackerConfig(kind) }] }
}
export function monthFixture(month = '2026-09', trackers = [trackerFixture()]): JournalMonthView {
  const dates = listMonthDates(month)
  return { month, timezone: 'Asia/Shanghai', today: '2026-09-27', trackers, dates, events: [], lanes: [], summaries: [], measurements: [],
    cells: Object.fromEntries(dates.map(date => [date, Object.fromEntries(trackers.map(tracker => [tracker.tracker_id, { tracker_id: tracker.tracker_id, date, revision_id: `${tracker.tracker_id}-r`, state: date > '2026-09-27' ? 'future' : 'missing', value: null, sources: [], measurement_id: null, version: 0 }]))])) }
}
