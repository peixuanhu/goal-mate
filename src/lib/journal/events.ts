import { listMonthDates } from './date'
import type { EventLane, JournalEventView } from './types'

export function assignEventLanes(events: JournalEventView[], month: string): EventLane[] {
  const dates = listMonthDates(month), first = dates[0], last = dates[dates.length - 1]
  const ends: string[] = [], result: EventLane[] = []
  for (const event of events.filter(event => event.start_date < event.end_date && event.end_date >= first && event.start_date <= last)
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date) || a.event_id.localeCompare(b.event_id))) {
    const start = event.start_date < first ? first : event.start_date
    const end = event.end_date > last ? last : event.end_date
    let lane = ends.findIndex(previousEnd => previousEnd < start)
    if (lane < 0) lane = ends.length
    ends[lane] = end
    result.push({ ...event, lane, clipped_start: start, clipped_end: end, continues_before: event.start_date < first, continues_after: event.end_date > last })
  }
  return result
}
