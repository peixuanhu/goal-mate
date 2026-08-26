import {
  findCurrentFocusPeriod,
  normalizeDateInput,
  parseDateOnly,
} from "@/lib/focus-period-utils"
import { isPlanCompleted } from "@/lib/plan-completion"
import { normalizePlanTiming } from "@/lib/plan-input"

import {
  getDefaultPlanningPreference,
  toPlanningPreferenceView,
  type PersistedPlanningPreferenceRow,
} from "./planning-preference"
import { SCHEDULE_BLOCK_RELATIONS, toScheduleBlockView } from "./schedule-block-view"
import {
  calculatePlanTimeBudget,
  type BudgetAction,
  type ActionTimeBudget,
  type PlanTimeBudget,
  type PlanTimeBudgetInput,
} from "./time-budget"
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
  position: number | null
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

type PlanCandidateRow = {
  plan_id: string
  goal_id: string | null
  goal_position?: number | null
  name: string
  progress: number
  is_recurring: boolean
  recurrence_type: string | null
  recurrence_value: string | null
  due_date: Date | null
  estimated_minutes: number | null
  default_block_minutes: number | null
  energy_level: string | null
  priority_quadrant: string | null
  gmt_create: Date
  gmt_modified: Date
  goal: CandidateGoalRow | null
  tags: Array<{ tag: string }>
  progressRecords: Array<{
    gmt_create: Date
    counts_toward_recurrence: boolean
  }>
  actionItems: ActionCandidateRow[]
  scheduleBlocks: Array<{
    block_id: string
    action_id: string | null
    start_at: Date
    end_at: Date
    status: string
  }>
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
      where: {
        OR: [
          { is_recurring: true },
          { is_recurring: false; progress: { lt: number } },
        ]
      }
      include: {
        goal: { select: { goal_id: true; name: true; position: true } }
        tags: true
        progressRecords: {
          select: { gmt_create: true; counts_toward_recurrence: true }
          orderBy: { gmt_create: "desc" }
        }
        actionItems: {
          where: { is_completed: false }
          orderBy: [{ position: "asc" }, { gmt_create: "asc" }, { action_id: "asc" }]
        }
        scheduleBlocks: {
          select: {
            block_id: true
            action_id: true
            start_at: true
            end_at: true
            status: true
          }
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
      include: typeof SCHEDULE_BLOCK_RELATIONS
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

function actionScheduleReason(actionBudget: ActionTimeBudget): string | null {
  if (actionBudget.remaining_minutes === 0) return "行动项预计投入已用尽"
  if (actionBudget.schedulable_minutes === 0 && actionBudget.scheduled_minutes > 0) {
    return "剩余时间已全部安排"
  }
  if (actionBudget.suggested_block_minutes === null) return "暂无可安排时间"
  return null
}

function directScheduleReason(budget: PlanTimeBudget): string | null {
  if (budget.budget_status === "overrun") return "总预计投入已超支"
  if (budget.remaining_minutes === 0) return "总预计投入已用尽"
  if (budget.unallocated_remaining_minutes === 0 && budget.reserved_action_minutes > 0) {
    return "剩余时间已预留给行动项"
  }
  if (budget.schedulable_minutes === 0 && budget.scheduled_minutes > 0) {
    return "剩余时间已全部安排"
  }
  if (budget.suggested_block_minutes === null) return "暂无可安排时间"
  return null
}

function actionCandidate(
  plan: PlanCandidateRow,
  action: ActionCandidateRow,
  budget: PlanTimeBudget,
): SchedulableCandidate {
  const actionBudget = budget.actions[action.action_id]
  const scheduleReason = actionScheduleReason(actionBudget)

  return {
    kind: "action",
    id: action.action_id,
    action_id: action.action_id,
    plan_id: plan.plan_id,
    goal_id: plan.goal?.goal_id ?? plan.goal_id,
    goal_name: plan.goal?.name ?? null,
    goal_position: plan.goal?.position ?? null,
    name: action.name,
    due_date: action.due_date === null ? null : normalizeDateInput(action.due_date),
    estimated_minutes: actionBudget.estimated_minutes,
    effective_default_block_minutes: budget.effective_default_block_minutes,
    invested_minutes: actionBudget.invested_minutes,
    remaining_minutes: actionBudget.remaining_minutes,
    reserved_action_minutes: budget.reserved_action_minutes,
    available_minutes: actionBudget.schedulable_minutes,
    scheduled_block_count: actionBudget.scheduled_block_count,
    scheduled_minutes: actionBudget.scheduled_minutes,
    suggested_block_minutes: actionBudget.suggested_block_minutes,
    budget_status: budget.budget_status,
    can_schedule: actionBudget.suggested_block_minutes !== null,
    schedule_reason: scheduleReason,
    energy_level: normalizeEnergyLevel(action.energy_level),
    effective_quadrant: normalizeQuadrant(action.priority_quadrant ?? plan.priority_quadrant),
    is_recurring: false,
    version: action.gmt_modified.toISOString(),
  }
}

function planCandidate(
  plan: PlanCandidateRow,
  budget: PlanTimeBudget,
  estimatedMinutes: number | null,
): SchedulableCandidate {
  const scheduleReason = directScheduleReason(budget)

  return {
    kind: "plan",
    id: plan.plan_id,
    action_id: null,
    plan_id: plan.plan_id,
    goal_id: plan.goal?.goal_id ?? plan.goal_id,
    goal_name: plan.goal?.name ?? null,
    goal_position: plan.goal?.position ?? null,
    name: plan.name,
    due_date: plan.due_date === null ? null : normalizeDateInput(plan.due_date),
    estimated_minutes: estimatedMinutes,
    effective_default_block_minutes: budget.effective_default_block_minutes,
    invested_minutes: budget.invested_minutes,
    remaining_minutes: budget.remaining_minutes,
    reserved_action_minutes: budget.reserved_action_minutes,
    available_minutes: budget.schedulable_minutes,
    scheduled_block_count: budget.scheduled_block_count,
    scheduled_minutes: budget.scheduled_minutes,
    suggested_block_minutes: budget.suggested_block_minutes,
    budget_status: budget.budget_status,
    can_schedule: budget.suggested_block_minutes !== null,
    schedule_reason: scheduleReason,
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

function budgetActions(plan: PlanCandidateRow): BudgetAction[] {
  const knownActionIds = new Set(plan.actionItems.map(action => action.action_id))
  const completedHistoryActionIds = new Set<string>()
  for (const block of plan.scheduleBlocks) {
    if (block.action_id !== null && !knownActionIds.has(block.action_id)) {
      completedHistoryActionIds.add(block.action_id)
    }
  }

  return [
    ...plan.actionItems,
    ...[...completedHistoryActionIds].map(action_id => ({
      action_id,
      estimated_minutes: null,
      is_completed: true,
    })),
  ]
}

function buildCandidates(
  plans: PlanCandidateRow[],
  preferenceDefaultBlockMinutes: number,
): SchedulableCandidate[] {
  const ordinaryCreateTiming = normalizePlanTiming({}, { mode: "create" })
  const ordinaryDefaultEstimate = ordinaryCreateTiming.estimated_minutes
  if (typeof ordinaryDefaultEstimate !== "number") {
    throw new Error("Ordinary plan create timing must provide an estimate")
  }

  return plans
    .filter(plan => !isPlanCompleted(plan))
    .flatMap(plan => {
      const budgetRelations = {
        default_block_minutes: plan.default_block_minutes,
        actions: budgetActions(plan),
        blocks: plan.scheduleBlocks,
      }
      let estimatedMinutes: number | null
      let budgetInput: PlanTimeBudgetInput
      if (plan.is_recurring) {
        estimatedMinutes = null
        budgetInput = {
          ...budgetRelations,
          is_recurring: true,
          estimated_minutes: null,
        }
      } else {
        estimatedMinutes = plan.estimated_minutes ?? ordinaryDefaultEstimate
        budgetInput = {
          ...budgetRelations,
          is_recurring: false,
          estimated_minutes: estimatedMinutes,
        }
      }
      const budget = calculatePlanTimeBudget(budgetInput, preferenceDefaultBlockMinutes)

      const actions = plan.is_recurring
        ? []
        : plan.actionItems
          .filter(action => !action.is_completed)
          .sort(compareActions)
          .map(action => actionCandidate(plan, action, budget))

      return [...actions, planCandidate(plan, budget, estimatedMinutes)]
    })
}

export async function loadTodayView(db: TodayQueryDb, dateKey: string): Promise<TodayView> {
  const preferenceRow = await db.planningPreference.findUnique({ where: { preference_id: "default" } })
  const preference = preferenceRow ? toPlanningPreferenceView(preferenceRow) : getDefaultPlanningPreference()
  const { start, endExclusive } = getUtcDayRange(dateKey, preference.timezone)
  const [focus, plans, blockRows] = await Promise.all([
    loadFocus(db, dateKey),
    db.plan.findMany({
      where: {
        OR: [
          { is_recurring: true },
          { is_recurring: false, progress: { lt: 1 } },
        ],
      },
      include: {
        goal: { select: { goal_id: true, name: true, position: true } },
        tags: true,
        progressRecords: {
          select: { gmt_create: true, counts_toward_recurrence: true },
          orderBy: { gmt_create: "desc" },
        },
        actionItems: {
          where: { is_completed: false },
          orderBy: [{ position: "asc" }, { gmt_create: "asc" }, { action_id: "asc" }],
        },
        scheduleBlocks: {
          select: {
            block_id: true,
            action_id: true,
            start_at: true,
            end_at: true,
            status: true,
          },
        },
      },
      orderBy: [{ goal_position: "asc" }, { gmt_create: "asc" }, { plan_id: "asc" }],
    }),
    db.scheduleBlock.findMany({
      where: {
        start_at: { lt: endExclusive },
        end_at: { gt: start },
      },
      include: SCHEDULE_BLOCK_RELATIONS,
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
    candidates: buildCandidates(plans, preference.default_block_minutes),
    blocks,
    checks: [],
  }
}
