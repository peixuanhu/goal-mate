import type { Prisma } from '@prisma/client'
import { formatUtcInTimeZone } from '@/lib/today/timezone'
import { requestHash } from './journal/idempotency'
import { saveProgressMetrics } from './journal/measurement-service'
import { journalContext, lockPlans, measurementView, stale, trackerInclude, trackerView } from './journal/persistence'
import type { JournalDb, JournalTx } from './journal/persistence'
import { progressInput, progressOccurrence } from './journal/progress-input'
import { JournalError } from './journal/types'
import type { ProgressRecordView, ProgressUpdateInput, ProgressWriteInput } from './journal/types'
import { parseProgressDelete, revisionForDate } from './journal/validation'

const includeMetrics = { journalMeasurements: { where: { origin: 'progress_field' }, orderBy: { measurement_id: 'asc' as const } } }
type RecordRow = Prisma.ProgressRecordGetPayload<{ include: typeof includeMetrics }>
function recordView(row: RecordRow): ProgressRecordView {
  return { id: row.id, plan_id: row.plan_id, content: row.content ?? '', thinking: row.thinking ?? '',
    gmt_create: row.gmt_create.toISOString(), outcome: row.outcome, counts_toward_recurrence: row.counts_toward_recurrence,
    schedule_block_id: row.schedule_block_id, version: row.version, metrics: row.journalMeasurements.map(measurementView) }
}
async function recordForWrite(tx: JournalTx, id: number) {
  const locked = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "ProgressRecord" WHERE "id"=${id} FOR UPDATE`
  if (!locked.length) throw new JournalError('NOT_FOUND', '进展记录已不存在')
  return tx.progressRecord.findUniqueOrThrow({ where: { id }, include: includeMetrics })
}
async function explicitProgress(tx: JournalTx, planId: string, progress: number | undefined) {
  if (progress === undefined) return
  const plan = await tx.plan.findUniqueOrThrow({ where: { plan_id: planId } })
  if (plan.is_recurring) throw new JournalError('VALIDATION', '循环计划通过完成次数记录进展')
  await tx.plan.update({ where: { plan_id: planId }, data: { progress } })
}
export async function getProgressRecord(db: JournalDb, id: number) {
  const record = await db.progressRecord.findUnique({ where: { id }, include: includeMetrics })
  if (!record) throw new JournalError('NOT_FOUND', '进展记录已不存在')
  return recordView(record)
}
export async function createProgressRecord(db: JournalDb, raw: ProgressWriteInput) {
  const input = progressInput(raw, false), hash = requestHash(input)
  return db.$transaction(async tx => {
    if (input.request_id) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`journal-record:${input.request_id}`}))`
      const replay = await tx.progressRecord.findUnique({ where: { journal_request_id: input.request_id }, include: includeMetrics })
      if (replay) { if (replay.journal_request_hash !== hash) stale('同一请求标识不能用于不同内容'); return recordView(replay) }
    }
    await lockPlans(tx, [input.plan_id])
    const context = await journalContext(tx), occurred = progressOccurrence(input.custom_time, context.timezone, new Date())
    if (input.outcome === 'completed' && formatUtcInTimeZone(occurred, context.timezone).date > context.today) throw new JournalError('VALIDATION', '未来日期不能记录已完成')
    const record = await tx.progressRecord.create({ data: { plan_id: input.plan_id, content: input.content, thinking: input.thinking,
      gmt_create: occurred, outcome: input.outcome ?? null, counts_toward_recurrence: input.outcome === 'completed' || (input.outcome == null && input.metrics === undefined),
      journal_request_id: input.request_id, journal_request_hash: input.request_id ? hash : null } })
    if (input.metrics !== undefined) await saveProgressMetrics(tx, record, input.metrics)
    await explicitProgress(tx, record.plan_id, input.plan_progress)
    return recordView(await tx.progressRecord.findUniqueOrThrow({ where: { id: record.id }, include: includeMetrics }))
  }, { timeout: 15000 })
}
export async function updateProgressRecord(db: JournalDb, raw: ProgressUpdateInput) {
  const input = progressInput(raw, true)
  return db.$transaction(async tx => {
    const initial = await tx.progressRecord.findUnique({ where: { id: input.id } })
    if (!initial) throw new JournalError('NOT_FOUND', '进展记录已不存在')
    await lockPlans(tx, [initial.plan_id, input.plan_id])
    const old = await recordForWrite(tx, input.id)
    if (old.plan_id !== initial.plan_id) throw new JournalError('SOURCE_CHANGED', '关联计划已变化，请重读原记录')
    if (input.expected_version !== undefined && old.version !== input.expected_version) stale()
    if (old.schedule_block_id && ((input.plan_id !== undefined && input.plan_id !== old.plan_id) || (input.outcome !== undefined && input.outcome !== old.outcome))) throw new JournalError('VALIDATION', '安排的完成状态请在今日工作台调整')
    const context = await journalContext(tx), planId = input.plan_id ?? old.plan_id
    const occurred = progressOccurrence(input.custom_time, context.timezone, old.gmt_create)
    const date = formatUtcInTimeZone(occurred, context.timezone).date
    if ((input.outcome ?? old.outcome) === 'completed' && date > context.today) throw new JournalError('VALIDATION', '未来日期不能记录已完成')
    let metrics = input.metrics
    if (metrics === undefined && (occurred.getTime() !== old.gmt_create.getTime() || planId !== old.plan_id)) {
      metrics = []
      for (const measurement of old.journalMeasurements.filter(row => row.status !== 'cleared')) {
        const row = await tx.trackerDefinition.findUniqueOrThrow({ where: { tracker_id: measurement.tracker_id }, include: trackerInclude })
        const tracker = trackerView(row), prior = tracker.revisions.find(revision => revision.revision_id === measurement.revision_id), next = revisionForDate(tracker.revisions, date)
        if (!prior || !next || requestHash(prior.config) !== requestHash(next.config) || prior.plan_id !== next.plan_id) throw new JournalError('SOURCE_CHANGED', '改期后的字段口径不同，请重新确认字段值')
        metrics.push({ tracker_id: tracker.tracker_id, revision_id: next.revision_id, value: measurementView(measurement).value,
          status: measurement.status as 'recorded' | 'skipped', note: measurement.note })
      }
    }
    const record = await tx.progressRecord.update({ where: { id: old.id }, data: {
      plan_id: planId, content: input.content, thinking: input.thinking, gmt_create: occurred,
      ...(input.outcome !== undefined ? { outcome: input.outcome, counts_toward_recurrence: input.outcome === 'completed' } : {}), version: { increment: 1 },
    } })
    if (metrics !== undefined) await saveProgressMetrics(tx, record, metrics)
    await explicitProgress(tx, planId, input.plan_progress)
    return recordView(await tx.progressRecord.findUniqueOrThrow({ where: { id: old.id }, include: includeMetrics }))
  }, { timeout: 15000 })
}
export async function deleteProgressRecord(db: JournalDb, raw: { id: number; expected_version?: number }) {
  const input = parseProgressDelete(new URLSearchParams({ id: String(raw.id), ...(raw.expected_version !== undefined ? { expected_version: String(raw.expected_version) } : {}) }))
  return db.$transaction(async tx => {
    const initial = await tx.progressRecord.findUnique({ where: { id: input.id } })
    if (!initial) throw new JournalError('NOT_FOUND', '进展记录已不存在')
    await lockPlans(tx, [initial.plan_id])
    const record = await recordForWrite(tx, input.id)
    if (record.plan_id !== initial.plan_id) throw new JournalError('SOURCE_CHANGED', '关联计划已变化')
    if (input.expected_version !== undefined && record.version !== input.expected_version) stale()
    if (record.schedule_block_id) throw new JournalError('VALIDATION', '安排的完成记录请在今日工作台撤销')
    await tx.progressRecord.delete({ where: { id: record.id } })
    return { success: true }
  })
}
