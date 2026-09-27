import { Prisma, type TrackerMeasurement } from '@prisma/client'
import { formatUtcInTimeZone } from '@/lib/today/timezone'
import { isApplicableDate } from './aggregate'
import { linkCellCompletion, qualifiesForCompletion, releaseCellCompletion } from './completion-link'
import { dateOnly } from './date'
import { requestHash } from './idempotency'
import { journalContext, lockPlans, lockTracker, measurementView, stale, trackerInclude, trackerView } from './persistence'
import type { JournalDb, JournalTx } from './persistence'
import { JournalError } from './types'
import type { ProgressMetricInput, PutMeasurementInput, RecordedValue, TrackerKind } from './types'
import { assertValueBounds, parseJournalValue, parseMeasurementInput, revisionForDate } from './validation'

function valueColumns(kind: TrackerKind, value: RecordedValue | null) {
  return { boolean_value: kind === 'boolean' ? value as boolean | null : null,
    numeric_value: (kind === 'quantity' || kind === 'snapshot') && value !== null ? new Prisma.Decimal(String(value)) : null,
    enum_value: kind === 'enum' ? value as string | null : null }
}
async function trackerForWrite(tx: JournalTx, id: string, date: string) {
  const row = await tx.trackerDefinition.findUnique({ where: { tracker_id: id }, include: trackerInclude })
  if (!row) throw new JournalError('NOT_FOUND', '追踪列已不存在')
  const tracker = trackerView(row), revision = revisionForDate(tracker.revisions, date)
  if (!revision || !isApplicableDate(tracker, date)) throw new JournalError('VALIDATION', '该日期不适用于这列')
  return { tracker, revision }
}
export async function putManualMeasurement(db: JournalDb, raw: PutMeasurementInput) {
  const input = parseMeasurementInput(raw)
  return db.$transaction(async tx => {
    const context = await journalContext(tx)
    if (input.date > context.today) throw new JournalError('VALIDATION', '未来日期只能安排事件，不能填写实际记录')
    const initial = await trackerForWrite(tx, input.tracker_id, input.date)
    await lockPlans(tx, [initial.revision.plan_id])
    await lockTracker(tx, input.tracker_id)
    const { tracker, revision } = await trackerForWrite(tx, input.tracker_id, input.date)
    if (revision.revision_id !== initial.revision.revision_id || revision.plan_id !== initial.revision.plan_id) throw new JournalError('SOURCE_CHANGED', '追踪来源已变化，请读取最新配置')
    if (revision.config.source !== 'manual') throw new JournalError('VALIDATION', '自动格请编辑原进展记录')
    const value = input.status === 'recorded' ? parseJournalValue(tracker.kind, input.value, revision.config.enum_options) : null
    if (value !== null) assertValueBounds(value, revision.config)
    const existing = await tx.trackerMeasurement.findFirst({ where: { tracker_id: input.tracker_id, origin: 'manual', local_date: dateOnly(input.date) } })
    if (existing?.request_id === input.request_id) {
      if (existing.status !== input.status || measurementView(existing).value !== value || existing.note !== input.note) stale('同一请求标识不能用于不同内容')
      return measurementView(existing)
    }
    if ((existing?.version ?? 0) !== input.expected_version) stale('这个格子已变化，请读取最新数据')
    const data = { ...valueColumns(tracker.kind, value), status: input.status, note: input.note, request_id: input.request_id,
      revision_id: revision.revision_id, recorded_at: new Date(), progress_record_id: null, source_record_id: null }
    const saved = existing
      ? await tx.trackerMeasurement.update({ where: { measurement_id: existing.measurement_id }, data: { ...data, version: { increment: 1 } } })
      : await tx.trackerMeasurement.create({ data: { ...data, tracker_id: input.tracker_id, local_date: dateOnly(input.date), origin: 'manual' } })
    if (qualifiesForCompletion(saved, revision)) await linkCellCompletion(tx, saved, revision, input.date, context.timezone, tracker.name)
    else if (existing) await releaseCellCompletion(tx, existing)
    return measurementView(await tx.trackerMeasurement.findUniqueOrThrow({ where: { measurement_id: saved.measurement_id } }))
  }, { timeout: 10000 })
}
export function clearMeasurement(db: JournalDb, input: Pick<PutMeasurementInput, 'tracker_id' | 'date' | 'expected_version' | 'request_id'>) {
  return putManualMeasurement(db, { ...input, value: null, status: 'cleared', note: '' })
}

export async function metricsForProgressMove(tx: JournalTx, measurements: TrackerMeasurement[], date: string): Promise<ProgressMetricInput[]> {
  const metrics: ProgressMetricInput[] = []
  for (const measurement of measurements.filter(row => row.status !== 'cleared')) {
    const row = await tx.trackerDefinition.findUniqueOrThrow({ where: { tracker_id: measurement.tracker_id }, include: trackerInclude })
    const tracker = trackerView(row), prior = tracker.revisions.find(revision => revision.revision_id === measurement.revision_id), next = revisionForDate(tracker.revisions, date)
    if (!prior || !next || requestHash(prior.config) !== requestHash(next.config) || prior.plan_id !== next.plan_id) throw new JournalError('SOURCE_CHANGED', '改期后的字段口径不同，请重新确认字段值')
    metrics.push({ tracker_id: tracker.tracker_id, revision_id: next.revision_id, value: measurementView(measurement).value,
      status: measurement.status as 'recorded' | 'skipped', note: measurement.note })
  }
  return metrics
}

export async function saveProgressMetrics(tx: JournalTx, record: { id: number; plan_id: string; gmt_create: Date }, metrics: ProgressMetricInput[]) {
  if (!Array.isArray(metrics) || new Set(metrics.map(metric => metric.tracker_id)).size !== metrics.length) throw new JournalError('VALIDATION', '进展字段不能重复')
  const context = await journalContext(tx), date = formatUtcInTimeZone(record.gmt_create, context.timezone).date
  if (date > context.today && metrics.some(metric => metric.status === 'recorded')) throw new JournalError('VALIDATION', '未来日期不能填写实际测量')
  const existing = await tx.trackerMeasurement.findMany({ where: { progress_record_id: record.id, origin: 'progress_field' } })
  for (const id of [...new Set([...existing.map(row => row.tracker_id), ...metrics.map(metric => metric.tracker_id)])].sort()) await lockTracker(tx, id)
  for (const metric of metrics) {
    if (!['recorded', 'skipped', 'cleared'].includes(metric.status) || (metric.status !== 'recorded' && metric.value !== null) || typeof metric.note !== 'string' || metric.note.length > 4000) throw new JournalError('VALIDATION', '字段状态或备注无效')
    const row = existing.find(row => row.tracker_id === metric.tracker_id)
    // Clearing an existing field must remain possible after its column or source stops applying.
    if (metric.status === 'cleared' && row) {
      await tx.trackerMeasurement.update({ where: { measurement_id: row.measurement_id }, data: {
        status: 'cleared', boolean_value: null, numeric_value: null, enum_value: null, note: metric.note,
        local_date: dateOnly(date), recorded_at: record.gmt_create, version: { increment: 1 },
      } })
      continue
    }
    const { tracker, revision } = await trackerForWrite(tx, metric.tracker_id, date)
    if (revision.revision_id !== metric.revision_id) throw new JournalError('SOURCE_CHANGED', '发生日期的字段口径已变化，请重新确认')
    if (revision.config.source !== 'progress_field' || (revision.plan_id !== null && revision.plan_id !== record.plan_id) || (revision.plan_id === null && revision.plan_name !== null)) throw new JournalError('SOURCE_CHANGED', '字段来源不适用于这条进展')
    const value = metric.status === 'recorded' ? parseJournalValue(tracker.kind, metric.value, revision.config.enum_options) : null
    if (value !== null) assertValueBounds(value, revision.config)
    const data = { ...valueColumns(tracker.kind, value), revision_id: revision.revision_id, status: metric.status, note: metric.note,
      local_date: dateOnly(date), recorded_at: record.gmt_create, source_record_id: record.id }
    if (row) await tx.trackerMeasurement.update({ where: { measurement_id: row.measurement_id }, data: { ...data, version: { increment: 1 } } })
    else await tx.trackerMeasurement.create({ data: { ...data, tracker_id: metric.tracker_id, origin: 'progress_field', progress_record_id: record.id } })
  }
  const removed = existing.filter(row => !metrics.some(metric => metric.tracker_id === row.tracker_id)).map(row => row.measurement_id)
  if (removed.length) await tx.trackerMeasurement.updateMany({ where: { measurement_id: { in: removed } }, data: { status: 'cleared', boolean_value: null, numeric_value: null, enum_value: null, version: { increment: 1 } } })
}
