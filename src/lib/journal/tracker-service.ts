import { Prisma } from '@prisma/client'
import { dateOnly, shiftJournalMonth } from './date'
import { associatedNames, journalContext, lockPlans, lockTracker, stale, trackerInclude, trackerView } from './persistence'
import type { JournalDb, JournalTx } from './persistence'
import { JournalError } from './types'
import type { TrackerArchiveInput, TrackerCreateInput, TrackerOrderInput, TrackerUpdateInput } from './types'
import { parseTrackerConfig, parseTrackerCreate } from './validation'

async function collectionLock(tx: JournalTx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('journal-trackers'))`
}
async function getTracker(tx: JournalTx, id: string) {
  const row = await tx.trackerDefinition.findUnique({ where: { tracker_id: id }, include: trackerInclude })
  if (!row) throw new JournalError('NOT_FOUND', '追踪列已不存在')
  return row
}
export async function createTracker(db: JournalDb, raw: TrackerCreateInput) {
  const input = parseTrackerCreate(raw)
  return db.$transaction(async tx => {
    await lockPlans(tx, [input.plan_id])
    await collectionLock(tx)
    const names = await associatedNames(tx, input.plan_id, input.goal_id)
    const last = await tx.trackerDefinition.aggregate({ _max: { position: true } })
    const row = await tx.trackerDefinition.create({ data: {
      name: input.name, kind: input.kind, group: input.group, color: input.color, enabled_from: dateOnly(input.enabled_from),
      position: (last._max.position ?? -1) + 1,
      revisions: { create: { effective_from: dateOnly(input.enabled_from), plan_id: input.plan_id, goal_id: input.goal_id,
        ...names, config: input.config as unknown as Prisma.InputJsonValue } },
    }, include: trackerInclude })
    return trackerView(row)
  })
}
export async function updateTracker(db: JournalDb, input: TrackerUpdateInput) {
  return db.$transaction(async tx => {
    const initial = await getTracker(tx, input.tracker_id)
    await lockPlans(tx, input.action === 'revise' ? [...initial.revisions.map(revision => revision.plan_id), input.plan_id] : [])
    await lockTracker(tx, input.tracker_id)
    const current = await getTracker(tx, input.tracker_id)
    if (current.version !== input.expected_version) stale('追踪列已变化，请读取最新配置')
    if (input.action === 'display') {
      return trackerView(await tx.trackerDefinition.update({ where: { tracker_id: input.tracker_id }, data: {
        name: input.name, group: input.group, color: input.color, version: { increment: 1 },
      }, include: trackerInclude }))
    }
    const context = await journalContext(tx)
    const nextMonth = `${shiftJournalMonth(context.today.slice(0, 7), 1)}-01`
    dateOnly(input.effective_from)
    if (input.effective_from < nextMonth || input.effective_from <= current.revisions[current.revisions.length - 1].effective_from.toISOString().slice(0, 10)) {
      throw new JournalError('VALIDATION', '新口径须从下月或更晚生效，不能覆盖历史版本')
    }
    if (current.archived_from) throw new JournalError('VALIDATION', '已归档列不能修改记录口径')
    const config = parseTrackerConfig(input.config, current.kind as TrackerCreateInput['kind'], input.plan_id)
    if (current.kind === 'enum') {
      const used = await tx.trackerMeasurement.findMany({ where: { tracker_id: input.tracker_id, enum_value: { not: null } }, distinct: ['enum_value'], select: { enum_value: true } })
      if (used.some(row => !config.enum_options.some(option => option.id === row.enum_value))) throw new JournalError('VALIDATION', '已使用的分类需保留标识，可修改标签')
    }
    const names = await associatedNames(tx, input.plan_id, input.goal_id)
    await tx.trackerRevision.create({ data: { tracker_id: input.tracker_id, effective_from: dateOnly(input.effective_from),
      plan_id: input.plan_id, goal_id: input.goal_id, ...names, config: config as unknown as Prisma.InputJsonValue } })
    await tx.trackerDefinition.update({ where: { tracker_id: input.tracker_id }, data: { version: { increment: 1 } } })
    return trackerView(await getTracker(tx, input.tracker_id))
  })
}
export async function archiveTracker(db: JournalDb, input: TrackerArchiveInput) {
  return db.$transaction(async tx => {
    await lockTracker(tx, input.tracker_id)
    const current = await getTracker(tx, input.tracker_id)
    if (current.version !== input.expected_version) stale()
    const { today } = await journalContext(tx)
    if (input.archived_from < today || dateOnly(input.archived_from) < current.enabled_from) throw new JournalError('VALIDATION', '归档日期不能早于今天或启用日期')
    return trackerView(await tx.trackerDefinition.update({ where: { tracker_id: input.tracker_id },
      data: { archived_from: dateOnly(input.archived_from), version: { increment: 1 } }, include: trackerInclude }))
  })
}
export async function reorderTrackers(db: JournalDb, input: TrackerOrderInput) {
  return db.$transaction(async tx => {
    await collectionLock(tx)
    const { today } = await journalContext(tx)
    const active = await tx.trackerDefinition.findMany({ where: { OR: [{ archived_from: null }, { archived_from: { gt: dateOnly(today) } }] } })
    if (new Set(input.ids).size !== input.ids.length || active.length !== input.ids.length || active.some(row => !input.ids.includes(row.tracker_id))) stale('追踪列集合已变化，请重新读取后排序')
    for (const id of [...input.ids].sort()) await lockTracker(tx, id)
    for (const [position, id] of input.ids.entries()) {
      const updated = await tx.trackerDefinition.updateMany({ where: { tracker_id: id, version: input.expected_versions[id] }, data: { position, version: { increment: 1 } } })
      if (updated.count !== 1) stale('追踪列已变化，请重新读取后排序')
    }
    return (await tx.trackerDefinition.findMany({ where: { tracker_id: { in: input.ids } }, orderBy: [{ position: 'asc' }, { tracker_id: 'asc' }], include: trackerInclude })).map(trackerView)
  })
}
