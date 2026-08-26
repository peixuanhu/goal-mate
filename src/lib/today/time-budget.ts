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

type PlanTimeBudgetInputBase = {
  default_block_minutes: number | null
  actions: BudgetAction[]
  blocks: BudgetBlock[]
}

export type PlanTimeBudgetInput =
  | (PlanTimeBudgetInputBase & {
    is_recurring: true
    estimated_minutes: null
  })
  | (PlanTimeBudgetInputBase & {
    is_recurring: false
    estimated_minutes: number
  })

export type ActionTimeBudget = {
  estimated_minutes: number
  invested_minutes: number
  remaining_minutes: number
  scheduled_block_count: number
  scheduled_minutes: number
  schedulable_minutes: number
  suggested_block_minutes: number | null
  has_scheduled_block: boolean
}

export type PlanTimeBudget = {
  effective_default_block_minutes: number
  invested_minutes: number
  remaining_minutes: number | null
  reserved_action_minutes: number
  unallocated_remaining_minutes: number | null
  scheduled_block_count: number
  scheduled_minutes: number
  schedulable_minutes: number | null
  suggested_block_minutes: number | null
  budget_status: TimeBudgetStatus
  has_scheduled_direct_block: boolean
  actions: Record<string, ActionTimeBudget>
}

const INVESTED_STATUSES = new Set(["completed", "partial"])

function validatePositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
}

function validateSlotAlignedPositiveSafeInteger(value: number, label: string): void {
  validatePositiveSafeInteger(value, label)
  if (value % 15 !== 0) {
    throw new Error(`${label} must use 15-minute increments`)
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

  const roundedWholeMinutes = Math.round((end - start) / 60_000)
  return Math.max(15, Math.ceil(roundedWholeMinutes / 15) * 15)
}

export function calculatePlanTimeBudget(
  input: PlanTimeBudgetInput,
  preferenceDefaultBlockMinutes: number,
): PlanTimeBudget {
  validateSlotAlignedPositiveSafeInteger(
    preferenceDefaultBlockMinutes,
    "Preference default block minutes",
  )
  if (input.default_block_minutes !== null) {
    validateSlotAlignedPositiveSafeInteger(input.default_block_minutes, "Plan default block minutes")
  }

  if (input.is_recurring) {
    if (input.estimated_minutes !== null) {
      throw new Error("Recurring plan estimated minutes must be null")
    }
  } else {
    validateSlotAlignedPositiveSafeInteger(input.estimated_minutes, "Ordinary plan estimated minutes")
  }

  const effectiveDefaultBlockMinutes = input.default_block_minutes ?? preferenceDefaultBlockMinutes
  const actionInputs = new Map<string, BudgetAction>()
  for (const action of input.actions) {
    if (actionInputs.has(action.action_id)) {
      throw new Error(`Duplicate action ID: ${action.action_id}`)
    }
    if (action.estimated_minutes !== null) {
      validateSlotAlignedPositiveSafeInteger(
        action.estimated_minutes,
        `Action ${action.action_id} estimated minutes`,
      )
    }
    actionInputs.set(action.action_id, action)
  }

  const blockIds = new Set<string>()
  for (const block of input.blocks) {
    if (blockIds.has(block.block_id)) {
      throw new Error(`Duplicate block ID: ${block.block_id}`)
    }
    blockIds.add(block.block_id)
    if (block.action_id !== null && !actionInputs.has(block.action_id)) {
      throw new Error(`Schedule block ${block.block_id} references unknown action ${block.action_id}`)
    }
  }

  const actionInvestedMinutes = new Map(input.actions.map(action => [action.action_id, 0]))
  const actionScheduledBlockCounts = new Map(input.actions.map(action => [action.action_id, 0]))
  const actionScheduledMinutes = new Map(input.actions.map(action => [action.action_id, 0]))

  let investedMinutes = 0
  let scheduledBlockCount = 0
  let scheduledMinutes = 0

  for (const block of input.blocks) {
    if (block.status === "scheduled") {
      const minutes = countedBlockMinutes(block)
      if (block.action_id === null) {
        scheduledBlockCount += 1
        scheduledMinutes += minutes
      } else {
        actionScheduledBlockCounts.set(
          block.action_id,
          (actionScheduledBlockCounts.get(block.action_id) ?? 0) + 1,
        )
        actionScheduledMinutes.set(
          block.action_id,
          (actionScheduledMinutes.get(block.action_id) ?? 0) + minutes,
        )
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
    const scheduledActionMinutes = actionScheduledMinutes.get(action.action_id) ?? 0
    const schedulableMinutes = Math.max(remainingMinutes - scheduledActionMinutes, 0)

    actions[action.action_id] = {
      estimated_minutes: estimatedMinutes,
      invested_minutes: actionInvested,
      remaining_minutes: remainingMinutes,
      scheduled_block_count: actionScheduledBlockCounts.get(action.action_id) ?? 0,
      scheduled_minutes: scheduledActionMinutes,
      schedulable_minutes: schedulableMinutes,
      suggested_block_minutes: action.is_completed || schedulableMinutes === 0
        ? null
        : Math.min(effectiveDefaultBlockMinutes, schedulableMinutes),
      has_scheduled_block: scheduledActionMinutes > 0,
    }
  }

  const reservedActionMinutes = input.actions
    .filter(action => !action.is_completed)
    .reduce((sum, action) => sum + actions[action.action_id].remaining_minutes, 0)
  const unreservedScheduledActionMinutes = input.actions.reduce((sum, action) => {
    const actionBudget = actions[action.action_id]
    const reservedMinutes = action.is_completed ? 0 : actionBudget.remaining_minutes
    return sum + Math.max(actionBudget.scheduled_minutes - reservedMinutes, 0)
  }, 0)

  if (input.is_recurring) {
    return {
      effective_default_block_minutes: effectiveDefaultBlockMinutes,
      invested_minutes: investedMinutes,
      remaining_minutes: null,
      reserved_action_minutes: reservedActionMinutes,
      unallocated_remaining_minutes: null,
      scheduled_block_count: scheduledBlockCount,
      scheduled_minutes: scheduledMinutes,
      schedulable_minutes: null,
      suggested_block_minutes: effectiveDefaultBlockMinutes,
      budget_status: "ok",
      has_scheduled_direct_block: scheduledBlockCount > 0,
      actions,
    }
  }

  const estimatedMinutes = input.estimated_minutes
  const remainingMinutes = Math.max(estimatedMinutes - investedMinutes, 0)
  const unallocatedRemainingMinutes = Math.max(remainingMinutes - reservedActionMinutes, 0)
  const schedulableMinutes = Math.max(
    unallocatedRemainingMinutes - scheduledMinutes - unreservedScheduledActionMinutes,
    0,
  )
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
    scheduled_block_count: scheduledBlockCount,
    scheduled_minutes: scheduledMinutes,
    schedulable_minutes: schedulableMinutes,
    suggested_block_minutes: schedulableMinutes === 0
      ? null
      : Math.min(effectiveDefaultBlockMinutes, schedulableMinutes),
    budget_status: budgetStatus,
    has_scheduled_direct_block: scheduledBlockCount > 0,
    actions,
  }
}
