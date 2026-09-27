import { Prisma } from '@prisma/client'
import { formatUtcInTimeZone } from '@/lib/today/timezone'
import { aggregateDay, isApplicableDate, summarizeHabitDays, summarizeNumericMonth } from './aggregate'
import { isJournalCompletion } from './completion-link'
import { dateOnly, journalMonthRange } from './date'
import { assignEventLanes } from './events'
import { journalContext, measurementView, trackerInclude, trackerView } from './persistence'
import type { JournalDb, JournalTx } from './persistence'
import { revisionForDate } from './validation'
import type { JournalCell, JournalEventView, JournalMonthView, TrackerRevisionView, TrackerSummary, TrackerView } from './types'

const plainText = (value: string | null) => (value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim()
const civil = (value: Date) => value.toISOString().slice(0, 10)
const bindingValid = (revision: TrackerRevisionView) => !(revision.plan_id === null && revision.plan_name !== null)
export async function queryJournalTrackers(db: JournalDb, now = new Date()) {
  const context = await journalContext(db, now)
  const rows = await db.trackerDefinition.findMany({ orderBy: [{ position: 'asc' }, { tracker_id: 'asc' }], include: trackerInclude })
  return { list: rows.map(trackerView), ...context }
}
async function snapshotBaseline(tx: JournalTx, tracker: TrackerView, revision: TrackerRevisionView, first: string, start: Date) {
  if (!bindingValid(revision)) return null
  const source = revision.config.source
  if (source === 'plan') return null
  const common = { tracker_id: tracker.tracker_id, revision_id: revision.revision_id, status: 'recorded', numeric_value: { not: null } }
  const row = source === 'manual'
    ? await tx.trackerMeasurement.findFirst({ where: { ...common, origin: 'manual', local_date: { lt: dateOnly(first) } }, orderBy: [{ local_date: 'desc' }, { recorded_at: 'desc' }, { measurement_id: 'desc' }] })
    : await tx.trackerMeasurement.findFirst({ where: { ...common, origin: 'progress_field', progressRecord: { is: { gmt_create: { lt: start }, ...(revision.plan_id ? { plan_id: revision.plan_id } : {}) } } }, orderBy: [{ progressRecord: { gmt_create: 'desc' } }, { measurement_id: 'desc' }] })
  return row?.numeric_value?.toString() ?? null
}
export async function queryJournalMonth(db: JournalDb, month: string | null, now = new Date()): Promise<JournalMonthView> {
  return db.$transaction(async tx => {
    const { timezone, today } = await journalContext(tx, now)
    const resolvedMonth = month ?? today.slice(0, 7), range = journalMonthRange(resolvedMonth, timezone)
    const startDate = dateOnly(range.first), endDate = dateOnly(range.endDate), lastDate = dateOnly(range.last)
    const progressWhere = { gmt_create: { gte: range.start, lt: range.endExclusive } }
    const [definitions, measurements, progress, plans, actions, blocks, custom, focus] = await Promise.all([
      tx.trackerDefinition.findMany({ orderBy: [{ position: 'asc' }, { tracker_id: 'asc' }], include: trackerInclude }),
      tx.trackerMeasurement.findMany({ where: { OR: [{ local_date: { gte: startDate, lt: endDate } }, { origin: 'progress_field', progressRecord: { is: progressWhere } }] }, include: { progressRecord: { include: { plan: true } } } }),
      tx.progressRecord.findMany({ where: progressWhere, include: { plan: true }, orderBy: [{ gmt_create: 'asc' }, { id: 'asc' }] }),
      tx.plan.findMany({ where: { due_date: { gte: startDate, lt: endDate } } }),
      tx.actionItem.findMany({ where: { due_date: { gte: startDate, lt: endDate } }, include: { plan: true } }),
      tx.scheduleBlock.findMany({ where: { start_at: { lt: range.endExclusive }, end_at: { gt: range.start }, status: { in: ['scheduled', 'partial'] } }, include: { plan: true, action: true } }),
      tx.journalEvent.findMany({ where: { start_date: { lte: lastDate }, end_date: { gte: startDate } } }),
      tx.focusPeriod.findMany({ where: { start_date: { lte: lastDate }, end_date: { gte: startDate } } }),
    ])
    const trackers = definitions.map(trackerView).filter(tracker => tracker.enabled_from <= range.last && (tracker.archived_from === null || tracker.archived_from > range.first))
    const sourceDate = (record: { gmt_create: Date }) => formatUtcInTimeZone(record.gmt_create, timezone).date
    const progressByDay = new Map<string, typeof progress>()
    for (const record of progress) {
      const date = sourceDate(record)
      progressByDay.set(date, [...(progressByDay.get(date) ?? []), record])
    }
    const measurementsByCell = new Map<string, typeof measurements>()
    const visibleMeasurements: JournalMonthView['measurements'] = []
    for (const measurement of measurements) {
      const date = measurement.origin === 'progress_field' && measurement.progressRecord ? sourceDate(measurement.progressRecord) : civil(measurement.local_date)
      if (date < range.first || date > range.last) continue
      const key = `${measurement.tracker_id}:${date}`
      measurementsByCell.set(key, [...(measurementsByCell.get(key) ?? []), measurement])
      visibleMeasurements.push({ ...measurementView(measurement), local_date: date })
    }
    const cells: JournalMonthView['cells'] = {}
    for (const date of range.dates) {
      cells[date] = {}
      for (const tracker of trackers) {
        const revision = revisionForDate(tracker.revisions, date)
        const available = (measurementsByCell.get(`${tracker.tracker_id}:${date}`) ?? []).filter(row => row.revision_id === revision?.revision_id)
        const manual = available.find(row => row.origin === 'manual')
        const cell: JournalCell = { tracker_id: tracker.tracker_id, date, revision_id: revision?.revision_id ?? null,
          state: 'missing', value: null, sources: [], measurement_id: manual?.measurement_id ?? null, version: manual?.version ?? 0 }
        if (!isApplicableDate(tracker, date)) cell.state = 'not_applicable'
        else if (date > today) cell.state = 'future'
        else if (revision) {
          if (revision.config.source === 'plan' && bindingValid(revision)) {
            const records = [...new Map((progressByDay.get(date) ?? []).filter(record => record.plan_id === revision.plan_id && isJournalCompletion(record, record.plan.is_recurring)).map(record => [record.id, record])).values()]
            Object.assign(cell, aggregateDay(tracker.kind, revision.config.daily_aggregation, records.map(record => ({ id: `p:${record.id}`, timestamp: record.gmt_create.toISOString(), status: 'recorded', value: tracker.kind === 'boolean' ? true : '1' }))))
            cell.sources = records.map(record => ({ kind: 'progress', id: String(record.id), label: plainText(record.content).slice(0, 100) || record.plan.name, version: record.version, deleted: false, legacy: record.outcome === null }))
          } else if (revision.config.source !== 'plan') {
            const samples = revision.config.source === 'manual' ? available.filter(row => row.origin === 'manual') : available.filter(row => row.origin === 'progress_field' && row.progressRecord && bindingValid(revision) && (!revision.plan_id || row.progressRecord.plan_id === revision.plan_id))
            Object.assign(cell, aggregateDay(tracker.kind, revision.config.daily_aggregation, samples.map(row => ({ id: row.measurement_id, timestamp: row.origin === 'progress_field' ? row.progressRecord!.gmt_create.toISOString() : row.recorded_at.toISOString(), status: row.status as 'recorded' | 'skipped' | 'cleared', value: measurementView(row).value }))))
          }
        }
        for (const row of available) cell.sources.push({ kind: 'measurement', id: row.measurement_id, label: row.note || (row.progressRecord ? plainText(row.progressRecord.content).slice(0, 100) || '进展字段' : row.source_record_id ? '原来源已删除' : '手动记录'), version: row.version, deleted: row.source_record_id !== null && !row.progressRecord, legacy: false })
        cells[date][tracker.tracker_id] = cell
      }
    }
    const summaries: TrackerSummary[] = []
    for (const tracker of trackers) {
      const activeRevisions = tracker.revisions.filter(revision => range.dates.some(date => cells[date][tracker.tracker_id].revision_id === revision.revision_id && cells[date][tracker.tracker_id].state !== 'not_applicable'))
      for (const revision of activeRevisions) {
        const days = range.dates.map(date => cells[date][tracker.tracker_id]).filter(cell => cell.revision_id === revision.revision_id)
        const recorded = days.filter(cell => cell.state === 'recorded'), values = recorded.map(cell => cell.value).filter((value): value is string => typeof value === 'string')
        const baseline = tracker.kind === 'snapshot' && revision === activeRevisions[0] ? await snapshotBaseline(tx, tracker, revision, range.first, range.start) : null
        const numeric = tracker.kind === 'quantity' || tracker.kind === 'snapshot' ? summarizeNumericMonth(tracker.kind, values, baseline) : { sum: null, last: null, baseline: null, delta: null }
        const categories: Record<string, number> = {}
        if (tracker.kind === 'enum') for (const value of values) categories[value] = (categories[value] ?? 0) + 1
        const habit = tracker.kind === 'boolean' || (tracker.kind === 'quantity' && revision.config.threshold !== null)
        const passed = (cell: JournalCell) => cell.state !== 'recorded' ? null : tracker.kind === 'boolean' ? cell.value === true : typeof cell.value === 'string' && revision.config.threshold !== null ? new Prisma.Decimal(cell.value).gte(revision.config.threshold) : null
        summaries.push({ tracker_id: tracker.tracker_id, revision_id: revision.revision_id, unit: revision.config.unit, ...numeric, categories,
          completed_days: recorded.filter(cell => passed(cell) === true).length, applicable_days: days.filter(cell => cell.date <= today && !['not_applicable', 'skipped'].includes(cell.state)).length, recorded_days: recorded.length,
          ...summarizeHabitDays(days.map(cell => ({ date: cell.date, state: cell.state, passed: passed(cell) })), today, habit && (revision.config.active_weekdays.length > 0 || revision.config.threshold !== null)) })
      }
    }
    const events: JournalEventView[] = custom.map(event => ({ event_id: event.event_id, title: event.title, start_date: civil(event.start_date), end_date: civil(event.end_date), note: event.note, source: 'custom', status: event.status as JournalEventView['status'], plan_id: event.plan_id, goal_id: event.goal_id, progress_record_id: event.completion_record_id, version: event.version, sync_completion: event.sync_completion }))
    const eventBase = { note: '', sync_completion: false, version: null, progress_record_id: null }
    const linked = new Set(custom.map(event => event.completion_record_id).filter(id => id !== null))
    for (const record of progress) {
      if (linked.has(record.id)) continue
      const date = sourceDate(record)
      events.push({ ...eventBase, event_id: `progress:${record.id}`, title: plainText(record.content).slice(0, 120) || record.plan.name, start_date: date, end_date: date,
        note: plainText(record.thinking).slice(0, 2000), source: 'progress', status: date > today ? 'planned' : isJournalCompletion(record, record.plan.is_recurring) ? 'completed' : 'progress',
        plan_id: record.plan_id, goal_id: record.plan.goal_id, progress_record_id: record.id, version: record.version })
    }
    for (const plan of plans) events.push({ ...eventBase, event_id: `plan:${plan.plan_id}`, title: plan.name, start_date: civil(plan.due_date!), end_date: civil(plan.due_date!), source: 'plan_due', status: plan.progress >= 1 ? 'completed' : 'planned', plan_id: plan.plan_id, goal_id: plan.goal_id })
    for (const action of actions) events.push({ ...eventBase, event_id: `action:${action.action_id}`, title: action.name, start_date: civil(action.due_date!), end_date: civil(action.due_date!), source: 'action_due', status: action.is_completed ? 'completed' : 'planned', plan_id: action.plan_id, goal_id: action.plan.goal_id })
    for (const block of blocks) events.push({ ...eventBase, event_id: `schedule:${block.block_id}`, title: block.action?.name ?? block.plan.name, start_date: sourceDate({ gmt_create: block.start_at }), end_date: sourceDate({ gmt_create: new Date(block.end_at.getTime() - 1) }), source: 'schedule', status: 'planned', plan_id: block.plan_id, goal_id: block.plan.goal_id })
    const goalIds = [...new Set(focus.map(period => period.goal_id))]
    const goalNames = new Map((await tx.goal.findMany({ where: { goal_id: { in: goalIds } }, select: { goal_id: true, name: true } })).map(goal => [goal.goal_id, goal.name]))
    for (const period of focus) events.push({ ...eventBase, event_id: `focus:${period.period_id}`, title: goalNames.get(period.goal_id) ?? '主线阶段', start_date: civil(period.start_date), end_date: civil(period.end_date), source: 'focus', status: 'planned', plan_id: null, goal_id: period.goal_id })
    events.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.event_id.localeCompare(b.event_id))
    return { month: resolvedMonth, timezone, today, dates: range.dates, trackers, cells, measurements: visibleMeasurements, events, lanes: assignEventLanes(events, resolvedMonth), summaries }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 })
}
