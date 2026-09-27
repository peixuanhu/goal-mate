import { Prisma } from '@prisma/client'
import type { TrackerMeasurement } from '@prisma/client'
import { formatUtcInTimeZone, getUtcDayRange, zonedMinuteToUtc } from '@/lib/today/timezone'
import type { JournalTx } from './persistence'
import { JournalError } from './types'
import type { TrackerRevisionView } from './types'

export function isJournalCompletion(
  record: { outcome: string | null; counts_toward_recurrence: boolean }, recurring: boolean,
) {
  return record.counts_toward_recurrence && (
    record.outcome === 'completed' || (record.outcome === null && recurring)
  )
}

export function qualifiesForCompletion(measurement: TrackerMeasurement, revision: TrackerRevisionView) {
  if (!revision.config.sync_completion || !revision.plan_id || measurement.status !== 'recorded') return false
  if (measurement.boolean_value !== null) return measurement.boolean_value
  return measurement.numeric_value !== null && revision.config.threshold !== null && new Prisma.Decimal(measurement.numeric_value).gte(revision.config.threshold)
}

export async function linkCellCompletion(tx: JournalTx, measurement: TrackerMeasurement, revision: TrackerRevisionView, date: string, timezone: string, trackerName: string) {
  if (!qualifiesForCompletion(measurement, revision)) return
  const planId = revision.plan_id!, key = `cell:${planId}:${date}`
  const owned = await tx.progressRecord.findUnique({ where: { journal_completion_key: key } })
  if (owned && formatUtcInTimeZone(owned.gmt_create, timezone).date !== date) throw new JournalError('SOURCE_CHANGED', '本次打卡来源已改期，请先查看原记录')
  const range = getUtcDayRange(date, timezone)
  const records = await tx.progressRecord.findMany({ where: { plan_id: planId, gmt_create: { gte: range.start, lt: range.endExclusive } }, include: { plan: true }, orderBy: { id: 'asc' } })
  let record = records.find(record => isJournalCompletion(record, record.plan.is_recurring))
  if (!record && owned) record = await tx.progressRecord.update({ where: { id: owned.id }, data: { outcome: 'completed', counts_toward_recurrence: true, version: { increment: 1 } }, include: { plan: true } })
  if (!record) record = await tx.progressRecord.create({ data: { plan_id: planId, journal_completion_key: key,
    outcome: 'completed', counts_toward_recurrence: true, content: `${trackerName}：已完成`, thinking: '',
    gmt_create: zonedMinuteToUtc(date, 12 * 60, timezone) }, include: { plan: true } })
  await tx.trackerMeasurement.update({ where: { measurement_id: measurement.measurement_id }, data: { progress_record_id: record.id, source_record_id: record.id } })
}

export async function releaseCellCompletion(tx: JournalTx, measurement: TrackerMeasurement) {
  if (measurement.progress_record_id === null) return
  const source = await tx.progressRecord.findUnique({ where: { id: measurement.progress_record_id } })
  const key = `cell:${source?.plan_id}:${measurement.local_date.toISOString().slice(0, 10)}`
  if (!source || source.journal_completion_key !== key) return
  const [measurements, events] = await Promise.all([
    tx.trackerMeasurement.count({ where: { progress_record_id: source.id, status: 'recorded' } }),
    tx.journalEvent.count({ where: { completion_record_id: source.id } }),
  ])
  if (!measurements && !events) await tx.progressRecord.delete({ where: { id: source.id } })
}
