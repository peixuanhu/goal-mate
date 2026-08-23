import type {
  EnergyLevel,
  ScheduleBlockSource,
  ScheduleBlockStatus,
  ScheduleBlockView,
} from "./types"

export const SCHEDULE_BLOCK_RELATIONS = {
  plan: {
    select: {
      plan_id: true,
      name: true,
      energy_level: true,
      goal: { select: { goal_id: true, name: true } },
    },
  },
  action: {
    select: {
      action_id: true,
      plan_id: true,
      name: true,
      energy_level: true,
      is_completed: true,
    },
  },
} as const

export type ScheduleBlockProjectionRow = {
  block_id: string
  plan_id: string
  action_id: string | null
  start_at: Date
  end_at: Date
  status: string
  source: string
  result_note: string | null
  version: number
  plan: {
    plan_id: string
    name: string
    energy_level: string | null
    goal: { goal_id: string; name: string } | null
  }
  action: {
    action_id: string
    plan_id: string
    name: string
    energy_level: string | null
    is_completed: boolean
  } | null
}

const STATUSES = new Set<ScheduleBlockStatus>(["scheduled", "completed", "partial", "skipped", "cancelled"])
const SOURCES = new Set<ScheduleBlockSource>(["manual", "ai_check", "ai_chat"])
const ENERGY_LEVELS = new Set<EnergyLevel>(["low", "medium", "high"])

function normalizedEnergy(value: string | null): EnergyLevel | null {
  return value !== null && ENERGY_LEVELS.has(value as EnergyLevel) ? value as EnergyLevel : null
}

export function toScheduleBlockView(row: ScheduleBlockProjectionRow): ScheduleBlockView {
  if (!STATUSES.has(row.status as ScheduleBlockStatus)) throw new Error("stored schedule block status is invalid")
  if (!SOURCES.has(row.source as ScheduleBlockSource)) throw new Error("stored schedule block source is invalid")
  if (!Number.isFinite(row.start_at.getTime()) || !Number.isFinite(row.end_at.getTime()) || row.start_at >= row.end_at) {
    throw new Error("stored schedule block interval is invalid")
  }

  return {
    block_id: row.block_id,
    plan_id: row.plan_id,
    action_id: row.action_id,
    title: row.action?.name ?? row.plan.name,
    goal_id: row.plan.goal?.goal_id ?? null,
    goal_name: row.plan.goal?.name ?? null,
    energy_level: normalizedEnergy(row.action?.energy_level ?? row.plan.energy_level),
    start_at: row.start_at.toISOString(),
    end_at: row.end_at.toISOString(),
    status: row.status as ScheduleBlockStatus,
    source: row.source as ScheduleBlockSource,
    result_note: row.result_note,
    version: row.version,
  }
}
