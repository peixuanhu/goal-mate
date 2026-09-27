import { Prisma } from '@prisma/client'
import { addDays } from '@/lib/focus-period-utils'
import { dateOnly } from './date'
import { revisionForDate } from './validation'
import type { CellState, JournalCell, RecordedValue, TrackerKind, TrackerView } from './types'

export type AggregateSample = { id: string; timestamp: string; value: RecordedValue | null; status: 'recorded' | 'skipped' | 'cleared' }
export function aggregateDay(kind: TrackerKind, aggregation: 'any' | 'sum' | 'last', samples: AggregateSample[]): Pick<JournalCell, 'state' | 'value'> {
  const unique = [...new Map(samples.map(sample => [sample.id, sample])).values()]
  const recorded = unique.filter(sample => sample.status === 'recorded' && sample.value !== null)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id))
  if (!recorded.length) return { state: unique.some(sample => sample.status === 'skipped') ? 'skipped' : 'missing', value: null }
  if (kind === 'boolean') return { state: 'recorded', value: recorded.some(sample => sample.value === true) }
  if (kind === 'quantity' && aggregation === 'sum') return {
    state: 'recorded', value: recorded.reduce((sum, sample) => sum.plus(String(sample.value)), new Prisma.Decimal(0)).toString(),
  }
  return { state: 'recorded', value: recorded[recorded.length - 1].value }
}
export function summarizeNumericMonth(kind: 'quantity' | 'snapshot', values: string[], baseline: string | null) {
  if (kind === 'quantity') return {
    sum: values.length ? values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0)).toString() : null,
    last: null, baseline: null, delta: null,
  }
  const last = values[values.length - 1] ?? null
  return { sum: null, last, baseline, delta: last !== null && baseline !== null ? new Prisma.Decimal(last).minus(baseline).toString() : null }
}
export function isApplicableDate(tracker: TrackerView, date: string) {
  if (date < tracker.enabled_from || (tracker.archived_from !== null && date >= tracker.archived_from)) return false
  const revision = revisionForDate(tracker.revisions, date)
  if (!revision) return false
  const weekday = dateOnly(date).getUTCDay() || 7
  return !revision.config.active_weekdays.length || revision.config.active_weekdays.includes(weekday)
}
export function summarizeHabitDays(days: { date: string; state: CellState; passed: boolean | null }[], today: string, configured: boolean) {
  if (!configured) return { streak: null, completion_rate: null }
  const elapsed = days.filter(day => day.date <= today)
  const recorded = elapsed.filter(day => day.state === 'recorded' && day.passed !== null)
  const completion_rate = recorded.length ? recorded.filter(day => day.passed === true).length / recorded.length : null
  let streak = 0
  for (const day of [...elapsed].reverse()) {
    if (day.state === 'not_applicable' || day.state === 'skipped') continue
    if (day.state !== 'recorded' || day.passed !== true) break
    streak++
  }
  return { streak, completion_rate }
}

export function trendSegments(cells: Pick<JournalCell, 'date' | 'state' | 'value'>[]) {
  const segments: { date: string; value: number }[][] = []
  let previous: string | null = null
  for (const cell of [...cells].sort((a, b) => a.date.localeCompare(b.date))) {
    if (cell.state !== 'recorded' || typeof cell.value !== 'string' || !Number.isFinite(Number(cell.value))) {
      previous = null
      continue
    }
    if (previous === null || addDays(previous, 1) !== cell.date) segments.push([])
    segments[segments.length - 1].push({ date: cell.date, value: Number(cell.value) })
    previous = cell.date
  }
  return segments
}
