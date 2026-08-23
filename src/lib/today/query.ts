import {
  findCurrentFocusPeriod,
  normalizeDateInput,
  parseDateOnly,
} from "@/lib/focus-period-utils"

import {
  getDefaultPlanningPreference,
  toPlanningPreferenceView,
  type PersistedPlanningPreferenceRow,
} from "./planning-preference"
import { toScheduleBlockView } from "./schedule-service"
import { getUtcDayRange } from "./timezone"
import type {
  EnergyLevel,
  QuadrantId,
  SchedulableCandidate,
  TodayView,
} from "./types"

type FocusPeriodRow = {
  period_id: string
  year: number
  start_date: Date
  end_date: Date
  goal_id: string
  color: string
  gmt_modified: Date
}

type GoalSummaryRow = {
  goal_id: string
  name: string
  tag: string
}

type CandidateGoalRow = {
  goal_id: string
  name: string
}

type ActionCandidateRow = {
  action_id: string
  plan_id: string
  position: number
  name: string
  due_date: Date | null
  estimated_minutes: number | null
  energy_level: string | null
  priority_quadrant: string | null
  is_completed: boolean
  scheduleBlocks: Array<{ block_id: string; status: string }>
  gmt_create: Date
  gmt_modified: Date
}

type ScheduleBlockRow = {
  block_id: string
  plan_id: string
  action_id: string | null
  start_at: Date
  end_at: Date
  status: string
  source: string
  result_note: string | null
  create_fingerprint: string | null
  version: number
  plan: {
    plan_id: string
    name: string
    energy_level: string | null
    goal: CandidateGoalRow | null
  }
  action: {
    action_id: string
    plan_id: string
    name: string
    energy_level: string | null
    is_completed: boolean
  } | null
}

type PlanCandidateRow = {
  plan_id: string
  goal_id: string | null
  goal_position?: number | null
  name: string
  progress: number
  is_recurring: boolean
  due_date: Date | null
  estimated_minutes: number | null
  energy_level: string | null
  priority_quadrant: string | null
  gmt_create: Date
  gmt_modified: Date
  goal: CandidateGoalRow | null
  tags: Array<{ tag: string }>
  actionItems: ActionCandidateRow[]
}

export interface TodayQueryDb {
  planningPreference: {
    findUnique(args: { where: { preference_id: "default" } }): PromiseLike<PersistedPlanningPreferenceRow | null>
  }
  focusPeriod: {
    findMany(args: {
      where: {
        year: number
        start_date: { lte: Date }
        end_date: { gte: Date }
      }
      orderBy: [{ start_date: "asc" }, { period_id: "asc" }]
    }): PromiseLike<FocusPeriodRow[]>
  }
  goal: {
    findUnique(args: {
      where: { goal_id: string }
      select: { goal_id: true; name: true; tag: true }
    }): PromiseLike<GoalSummaryRow | null>
  }
  plan: {
    findMany(args: {
      where: { progress: { lt: number } }
      include: {
        goal: { select: { goal_id: true; name: true } }
        tags: true
        actionItems: {
          where: { is_completed: false }
          include: {
            scheduleBlocks: {
              where: { status: "scheduled" }
              select: { block_id: true; status: true }
            }
          }
          orderBy: [{ position: "asc" }, { gmt_create: "asc" }, { action_id: "asc" }]
        }
      }
      orderBy: [{ goal_position: "asc" }, { gmt_create: "asc" }, { plan_id: "asc" }]
    }): PromiseLike<PlanCandidateRow[]>
  }
  scheduleBlock: {
    findMany(args: {
      where: {
        start_at: { lt: Date }
        end_at: { gt: Date }
      }
      include: {
        plan: {
          select: {
            plan_id: true
            name: true
            energy_level: true
            goal: { select: { goal_id: true; name: true } }
          }
        }
        action: {
          select: {
            action_id: true
            plan_id: true
            name: true
            energy_level: true
            is_completed: true
          }
        }
      }
      orderBy: [{ start_at: "asc" }, { block_id: "asc" }]
    }): PromiseLike<ScheduleBlockRow[]>
  }
}

const ENERGY_LEVELS = new Set<EnergyLevel>(["low", "medium", "high"])
const QUADRANT_IDS = new Set<QuadrantId>(["q1", "q2", "q3", "q4"])

function normalizeEnergyLevel(value: string | null): EnergyLevel | null {
  return value !== null && ENERGY_LEVELS.has(value as EnergyLevel) ? value as EnergyLevel : null
}

function normalizeQuadrant(value: string | null): QuadrantId | null {
  return value !== null && QUADRANT_IDS.has(value as QuadrantId) ? value as QuadrantId : null
}

async function loadFocus(db: TodayQueryDb, dateKey: string) {
  const date = parseDateOnly(dateKey)
  const periods = await db.focusPeriod.findMany({
    where: {
      year: date.getUTCFullYear(),
      start_date: { lte: date },
      end_date: { gte: date },
    },
    orderBy: [{ start_date: "asc" }, { period_id: "asc" }],
  })
  const period = findCurrentFocusPeriod(
    periods.map(period => ({
      ...period,
      start_date: normalizeDateInput(period.start_date),
      end_date: normalizeDateInput(period.end_date),
    })),
    dateKey,
  )
  if (!period) {
    return null
  }

  const goal = await db.goal.findUnique({
    where: { goal_id: period.goal_id },
    select: { goal_id: true, name: true, tag: true },
  })
  if (!goal) {
    return null
  }

  return {
    goal_id: goal.goal_id,
    name: goal.name,
    tag: goal.tag,
    color: period.color,
    version: period.gmt_modified.toISOString(),
  }
}

function actionCandidate(plan: PlanCandidateRow, action: ActionCandidateRow): SchedulableCandidate {
  return {
    kind: "action",
    id: action.action_id,
    action_id: action.action_id,
    plan_id: plan.plan_id,
    goal_id: plan.goal?.goal_id ?? plan.goal_id,
    goal_name: plan.goal?.name ?? null,
    name: action.name,
    due_date: action.due_date === null ? null : normalizeDateInput(action.due_date),
    estimated_minutes: action.estimated_minutes,
    energy_level: normalizeEnergyLevel(action.energy_level),
    effective_quadrant: normalizeQuadrant(action.priority_quadrant ?? plan.priority_quadrant),
    is_recurring: false,
    version: action.gmt_modified.toISOString(),
  }
}

function planCandidate(plan: PlanCandidateRow): SchedulableCandidate {
  return {
    kind: "plan",
    id: plan.plan_id,
    action_id: null,
    plan_id: plan.plan_id,
    goal_id: plan.goal?.goal_id ?? plan.goal_id,
    goal_name: plan.goal?.name ?? null,
    name: plan.name,
    due_date: plan.due_date === null ? null : normalizeDateInput(plan.due_date),
    estimated_minutes: plan.estimated_minutes,
    energy_level: normalizeEnergyLevel(plan.energy_level),
    effective_quadrant: normalizeQuadrant(plan.priority_quadrant),
    is_recurring: plan.is_recurring,
    version: plan.gmt_modified.toISOString(),
  }
}

function compareActions(a: ActionCandidateRow, b: ActionCandidateRow): number {
  return a.position - b.position
    || a.gmt_create.getTime() - b.gmt_create.getTime()
    || a.action_id.localeCompare(b.action_id)
}

function buildCandidates(plans: PlanCandidateRow[]): SchedulableCandidate[] {
  return plans
    .filter(plan => plan.progress < 1)
    .flatMap(plan => {
      const actions = plan.is_recurring
        ? []
        : plan.actionItems
          .filter(action => !action.is_completed)
          .filter(action => !action.scheduleBlocks.some(block => block.status === "scheduled"))
          .sort(compareActions)
          .map(action => actionCandidate(plan, action))

      return [...actions, planCandidate(plan)]
    })
}

export async function loadTodayView(db: TodayQueryDb, dateKey: string): Promise<TodayView> {
  const preferenceRow = await db.planningPreference.findUnique({ where: { preference_id: "default" } })
  const preference = preferenceRow ? toPlanningPreferenceView(preferenceRow) : getDefaultPlanningPreference()
  const { start, endExclusive } = getUtcDayRange(dateKey, preference.timezone)
  const [focus, plans, blockRows] = await Promise.all([
    loadFocus(db, dateKey),
    db.plan.findMany({
      where: { progress: { lt: 1 } },
      include: {
        goal: { select: { goal_id: true, name: true } },
        tags: true,
        actionItems: {
          where: { is_completed: false },
          include: {
            scheduleBlocks: {
              where: { status: "scheduled" },
              select: { block_id: true, status: true },
            },
          },
          orderBy: [{ position: "asc" }, { gmt_create: "asc" }, { action_id: "asc" }],
        },
      },
      orderBy: [{ goal_position: "asc" }, { gmt_create: "asc" }, { plan_id: "asc" }],
    }),
    db.scheduleBlock.findMany({
      where: {
        start_at: { lt: endExclusive },
        end_at: { gt: start },
      },
      include: {
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
      },
      orderBy: [{ start_at: "asc" }, { block_id: "asc" }],
    }),
  ])

  const blocks = blockRows
    .filter(block => block.start_at < endExclusive && block.end_at > start)
    .sort((left, right) => (
      left.start_at.getTime() - right.start_at.getTime()
      || left.block_id.localeCompare(right.block_id)
    ))
    .map(block => toScheduleBlockView(block))

  return {
    date: dateKey,
    preference,
    focus,
    candidates: buildCandidates(plans),
    blocks,
    checks: [],
  }
}
