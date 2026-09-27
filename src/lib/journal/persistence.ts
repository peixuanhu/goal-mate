import type { Prisma, PrismaClient, TrackerMeasurement } from '@prisma/client'
import { getDefaultPlanningPreference } from '@/lib/today/planning-preference'
import { formatUtcInTimeZone } from '@/lib/today/timezone'
import { JournalError } from './types'
import type { MeasurementView, TrackerConfig, TrackerView } from './types'

export type JournalTx = Prisma.TransactionClient
export type JournalDb = PrismaClient
export const trackerInclude = { revisions: { orderBy: { effective_from: 'asc' as const } } }
export type TrackerRow = Prisma.TrackerDefinitionGetPayload<{ include: typeof trackerInclude }>

export async function journalContext(db: Pick<JournalTx, 'planningPreference'>, now = new Date()) {
  const preference = await db.planningPreference.findUnique({ where: { preference_id: 'default' } })
  const timezone = preference?.timezone ?? getDefaultPlanningPreference().timezone
  return { timezone, today: formatUtcInTimeZone(now, timezone).date }
}
export async function lockPlans(tx: JournalTx, ids: (string | null | undefined)[]) {
  for (const id of [...new Set(ids.filter((id): id is string => !!id))].sort()) {
    const found = await tx.$queryRaw<{ plan_id: string }[]>`SELECT "plan_id" FROM "Plan" WHERE "plan_id"=${id} FOR UPDATE`
    if (!found.length) throw new JournalError('NOT_FOUND', '关联计划已不存在')
  }
}
export async function lockTracker(tx: JournalTx, id: string) {
  const found = await tx.$queryRaw<{ tracker_id: string }[]>`SELECT "tracker_id" FROM "TrackerDefinition" WHERE "tracker_id"=${id} FOR UPDATE`
  if (!found.length) throw new JournalError('NOT_FOUND', '追踪列已不存在')
}
export async function associatedNames(tx: JournalTx, planId: string | null, goalId: string | null) {
  const plan = planId ? await tx.plan.findUnique({ where: { plan_id: planId } }) : null
  const goal = goalId ? await tx.goal.findUnique({ where: { goal_id: goalId } }) : null
  if (planId && !plan) throw new JournalError('NOT_FOUND', '关联计划已不存在')
  if (goalId && !goal) throw new JournalError('NOT_FOUND', '关联目标已不存在')
  return { plan_name: plan?.name ?? null, goal_name: goal?.name ?? null }
}
export function trackerView(row: TrackerRow): TrackerView {
  return {
    tracker_id: row.tracker_id, name: row.name, kind: row.kind as TrackerView['kind'], group: row.group,
    color: row.color, position: row.position, version: row.version,
    enabled_from: row.enabled_from.toISOString().slice(0, 10), archived_from: row.archived_from?.toISOString().slice(0, 10) ?? null,
    revisions: row.revisions.map(revision => ({ revision_id: revision.revision_id, effective_from: revision.effective_from.toISOString().slice(0, 10),
      plan_id: revision.plan_id, goal_id: revision.goal_id, plan_name: revision.plan_name, goal_name: revision.goal_name,
      config: revision.config as unknown as TrackerConfig })),
  }
}
export function measurementView(row: TrackerMeasurement): MeasurementView {
  return { measurement_id: row.measurement_id, tracker_id: row.tracker_id, revision_id: row.revision_id,
    local_date: row.local_date.toISOString().slice(0, 10),
    value: row.boolean_value ?? row.numeric_value?.toString() ?? row.enum_value ?? null,
    status: row.status as MeasurementView['status'], origin: row.origin as MeasurementView['origin'], note: row.note,
    version: row.version, recorded_at: row.recorded_at.toISOString(), progress_record_id: row.progress_record_id,
    source_record_id: row.source_record_id, source_deleted: row.source_record_id !== null && row.progress_record_id === null }
}
export function stale(message = '记录已变化，请读取最新数据') : never { throw new JournalError('STALE_VERSION', message) }
