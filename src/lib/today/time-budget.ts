export type TimeBudgetStatus = "ok" | "exhausted" | "overrun"

export type BudgetBlock = {
  block_id: string
  action_id: string | null
  start_at: Date
  end_at: Date
  status: string
}

export type BudgetAction = {
  action_id: string
  estimated_minutes: number | null
  is_completed: boolean
}

export type PlanTimeBudgetInput = {
  is_recurring: boolean
  estimated_minutes: number | null
  default_block_minutes: number | null
  actions: BudgetAction[]
  blocks: BudgetBlock[]
}

export type ActionTimeBudget = {
  estimated_minutes: number
  invested_minutes: number
  remaining_minutes: number
  suggested_block_minutes: number | null
  has_scheduled_block: boolean
}

export type PlanTimeBudget = {
  effective_default_block_minutes: number
  invested_minutes: number
  remaining_minutes: number | null
  reserved_action_minutes: number
  unallocated_remaining_minutes: number | null
  suggested_block_minutes: number | null
  budget_status: TimeBudgetStatus
  has_scheduled_direct_block: boolean
  actions: Record<string, ActionTimeBudget>
}

const INVESTED_STATUSES = new Set(["completed", "partial"])

function validateDefaultBlockMinutes(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function countedBlockMinutes(block: BudgetBlock): number {
  const start = block.start_at.getTime()
  const end = block.end_at.getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error(`Schedule block ${block.block_id} must have valid dates`)
  }
  if (end <= start) {
    throw new Error(`Schedule block ${block.block_id} must end after it starts`)
  }

  const minutes = (end - start) / 60_000
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes <= 0) {
    throw new Error(`Schedule block ${block.block_id} must span a positive whole number of minutes`)
  }

  return minutes
}

export function calculatePlanTimeBudget(
  input: PlanTimeBudgetInput,
  preferenceDefaultBlockMinutes: number,
): PlanTimeBudget {
  validateDefaultBlockMinutes(preferenceDefaultBlockMinutes, "Preference default block minutes")
  if (input.default_block_minutes !== null) {
    validateDefaultBlockMinutes(input.default_block_minutes, "Plan default block minutes")
  }

  const effectiveDefaultBlockMinutes = input.default_block_minutes ?? preferenceDefaultBlockMinutes
  const actionInputs = new Map(input.actions.map(action => [action.action_id, action]))
  const actionInvestedMinutes = new Map(input.actions.map(action => [action.action_id, 0]))

  let investedMinutes = 0
  let hasScheduledDirectBlock = false
  const actionsWithScheduledBlocks = new Set<string>()

  for (const block of input.blocks) {
    if (block.action_id !== null && !actionInputs.has(block.action_id)) {
      throw new Error(`Schedule block ${block.block_id} references unknown action ${block.action_id}`)
    }

    if (block.status === "scheduled") {
      if (block.action_id === null) {
        hasScheduledDirectBlock = true
      } else {
        actionsWithScheduledBlocks.add(block.action_id)
      }
    }

    if (!INVESTED_STATUSES.has(block.status)) continue

    const minutes = countedBlockMinutes(block)
    investedMinutes += minutes
    if (block.action_id !== null) {
      actionInvestedMinutes.set(
        block.action_id,
        (actionInvestedMinutes.get(block.action_id) ?? 0) + minutes,
      )
    }
  }

  const actions: Record<string, ActionTimeBudget> = {}
  for (const action of input.actions) {
    const estimatedMinutes = action.estimated_minutes ?? effectiveDefaultBlockMinutes
    const actionInvested = actionInvestedMinutes.get(action.action_id) ?? 0
    const remainingMinutes = Math.max(estimatedMinutes - actionInvested, 0)
    const hasScheduledBlock = actionsWithScheduledBlocks.has(action.action_id)

    actions[action.action_id] = {
      estimated_minutes: estimatedMinutes,
      invested_minutes: actionInvested,
      remaining_minutes: remainingMinutes,
      suggested_block_minutes: hasScheduledBlock || remainingMinutes === 0
        ? null
        : Math.min(effectiveDefaultBlockMinutes, remainingMinutes),
      has_scheduled_block: hasScheduledBlock,
    }
  }

  const reservedActionMinutes = input.actions
    .filter(action => !action.is_completed)
    .reduce((sum, action) => sum + actions[action.action_id].remaining_minutes, 0)

  if (input.is_recurring) {
    return {
      effective_default_block_minutes: effectiveDefaultBlockMinutes,
      invested_minutes: investedMinutes,
      remaining_minutes: null,
      reserved_action_minutes: reservedActionMinutes,
      unallocated_remaining_minutes: null,
      suggested_block_minutes: hasScheduledDirectBlock ? null : effectiveDefaultBlockMinutes,
      budget_status: "ok",
      has_scheduled_direct_block: hasScheduledDirectBlock,
      actions,
    }
  }

  const estimatedMinutes = input.estimated_minutes ?? 0
  const remainingMinutes = Math.max(estimatedMinutes - investedMinutes, 0)
  const unallocatedRemainingMinutes = Math.max(remainingMinutes - reservedActionMinutes, 0)
  const budgetStatus: TimeBudgetStatus = investedMinutes > estimatedMinutes
    || reservedActionMinutes > remainingMinutes
    ? "overrun"
    : remainingMinutes === 0
      ? "exhausted"
      : "ok"

  return {
    effective_default_block_minutes: effectiveDefaultBlockMinutes,
    invested_minutes: investedMinutes,
    remaining_minutes: remainingMinutes,
    reserved_action_minutes: reservedActionMinutes,
    unallocated_remaining_minutes: unallocatedRemainingMinutes,
    suggested_block_minutes: hasScheduledDirectBlock || unallocatedRemainingMinutes === 0
      ? null
      : Math.min(effectiveDefaultBlockMinutes, unallocatedRemainingMinutes),
    budget_status: budgetStatus,
    has_scheduled_direct_block: hasScheduledDirectBlock,
    actions,
  }
}
