import type { JournalEvent } from '@prisma/client'
import { zonedMinuteToUtc, formatUtcInTimeZone } from '@/lib/today/timezone'
import { dateOnly } from './date'
import { requestHash } from './idempotency'
import { associatedNames, journalContext, lockPlans, stale } from './persistence'
import type { JournalDb, JournalTx } from './persistence'
import { JournalError } from './types'
import type { JournalEventInput, JournalEventUpdateInput, JournalEventView } from './types'
import { parseEventDelete, parseEventInput, parseEventUpdate } from './validation'

function eventView(row: JournalEvent): JournalEventView {
  return { event_id: row.event_id, title: row.title, note: row.note, start_date: row.start_date.toISOString().slice(0, 10),
    end_date: row.end_date.toISOString().slice(0, 10), source: 'custom', status: row.status as JournalEventView['status'],
    plan_id: row.plan_id, goal_id: row.goal_id, progress_record_id: row.completion_record_id, version: row.version, sync_completion: row.sync_completion }
}
async function release(tx: JournalTx, event: JournalEvent) {
  if (!event.completion_record_id) return
  const record = await tx.progressRecord.findUnique({ where: { id: event.completion_record_id } })
  if (record?.journal_completion_key !== `event:${event.event_id}`) return
  const [measurements, events] = await Promise.all([
    tx.trackerMeasurement.count({ where: { progress_record_id: record.id, status: 'recorded' } }),
    tx.journalEvent.count({ where: { completion_record_id: record.id } }),
  ])
  if (!measurements && !events) await tx.progressRecord.delete({ where: { id: record.id } })
  else await tx.progressRecord.update({ where: { id: record.id }, data: { journal_completion_key: null } })
}
async function completion(tx: JournalTx, event: JournalEvent, timezone: string) {
  if (!event.sync_completion || event.status !== 'completed' || !event.plan_id) return
  const key = `event:${event.event_id}`
  let record = await tx.progressRecord.findUnique({ where: { journal_completion_key: key } })
  const data = { plan_id: event.plan_id, gmt_create: zonedMinuteToUtc(event.end_date.toISOString().slice(0, 10), 720, timezone),
    outcome: 'completed', counts_toward_recurrence: true }
  record = record ? await tx.progressRecord.update({ where: { id: record.id }, data: { ...data, version: { increment: 1 } } })
    : await tx.progressRecord.create({ data: { ...data, content: event.title, thinking: event.note, journal_completion_key: key } })
  await tx.journalEvent.update({ where: { event_id: event.event_id }, data: { completion_record_id: record.id } })
}
async function validateWrite(tx: JournalTx, input: JournalEventInput) {
  const context = await journalContext(tx)
  if (input.status === 'completed' && input.end_date > context.today) throw new JournalError('VALIDATION', '未来事件不能标为已完成')
  return { ...context, names: await associatedNames(tx, input.plan_id, input.goal_id) }
}
export async function createJournalEvent(db: JournalDb, raw: JournalEventInput) {
  const input = parseEventInput(raw), hash = requestHash(input)
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`journal-event:${input.request_id}`}))`
    const replay = await tx.journalEvent.findUnique({ where: { request_id: input.request_id } })
    if (replay) { if (replay.request_hash !== hash) stale('同一请求标识不能用于不同内容'); return eventView(replay) }
    await lockPlans(tx, [input.plan_id])
    const context = await validateWrite(tx, input)
    const event = await tx.journalEvent.create({ data: { ...input, ...context.names, start_date: dateOnly(input.start_date), end_date: dateOnly(input.end_date), request_hash: hash } })
    await completion(tx, event, context.timezone)
    return eventView(await tx.journalEvent.findUniqueOrThrow({ where: { event_id: event.event_id } }))
  })
}
async function lockEvent(tx: JournalTx, id: string) {
  const rows = await tx.$queryRaw<{ event_id: string }[]>`SELECT "event_id" FROM "JournalEvent" WHERE "event_id"=${id} FOR UPDATE`
  if (!rows.length) throw new JournalError('NOT_FOUND', '事件已不存在')
  return tx.journalEvent.findUniqueOrThrow({ where: { event_id: id } })
}
export async function updateJournalEvent(db: JournalDb, raw: JournalEventUpdateInput) {
  const { event_id, expected_version, request_id: _requestId, ...input } = parseEventUpdate(raw)
  return db.$transaction(async tx => {
    const initial = await tx.journalEvent.findUnique({ where: { event_id } })
    if (!initial) throw new JournalError('NOT_FOUND', '事件已不存在')
    await lockPlans(tx, [initial.plan_id, input.plan_id])
    const old = await lockEvent(tx, event_id)
    if (old.version !== expected_version) stale()
    const context = await validateWrite(tx, { ...input, request_id: _requestId })
    if (old.completion_record_id) {
      const record = await tx.progressRecord.findUnique({ where: { id: old.completion_record_id } })
      if (record?.journal_completion_key === `event:${event_id}` && (record.plan_id !== old.plan_id || formatUtcInTimeZone(record.gmt_create, context.timezone).date !== old.end_date.toISOString().slice(0, 10))) throw new JournalError('SOURCE_CHANGED', '事件关联的完成记录已改期，请先查看原记录')
    }
    const saved = await tx.journalEvent.update({ where: { event_id }, data: { ...input, ...context.names,
      start_date: dateOnly(input.start_date), end_date: dateOnly(input.end_date), completion_record_id: null, version: { increment: 1 } } })
    if (!saved.sync_completion || saved.status !== 'completed' || old.plan_id !== saved.plan_id) await release(tx, old)
    await completion(tx, saved, context.timezone)
    return eventView(await tx.journalEvent.findUniqueOrThrow({ where: { event_id } }))
  })
}
export async function deleteJournalEvent(db: JournalDb, raw: { event_id: string; expected_version: number }) {
  const input = parseEventDelete(new URLSearchParams({ event_id: raw.event_id, expected_version: String(raw.expected_version) }))
  return db.$transaction(async tx => {
    const initial = await tx.journalEvent.findUnique({ where: { event_id: input.event_id } })
    if (!initial) throw new JournalError('NOT_FOUND', '事件已不存在')
    await lockPlans(tx, [initial.plan_id])
    const event = await lockEvent(tx, input.event_id)
    if (event.version !== input.expected_version) stale()
    await tx.journalEvent.delete({ where: { event_id: event.event_id } }); await release(tx, event)
    return { success: true }
  })
}
