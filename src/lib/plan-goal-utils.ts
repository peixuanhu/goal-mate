export const GOAL_POSITION_STEP = 1000
export const GOAL_ROUTE_LOCK_NAMESPACE = 48231

export type GoalPlanOrderCandidate = {
  plan_id: string
  goal_id: string | null
}

export type GoalPlanOrderValidationInput = {
  goal_id: string
  ordered_plan_ids: string[]
  currentPlans: GoalPlanOrderCandidate[]
}

export type GoalPlanOrderValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export function getNextGoalPosition(maxGoalPosition: number | null | undefined): number {
  return typeof maxGoalPosition === "number" ? maxGoalPosition + GOAL_POSITION_STEP : GOAL_POSITION_STEP
}

export function getGoalRouteLockKey(goalId: string): number {
  let hash = 0
  for (let index = 0; index < goalId.length; index += 1) {
    hash = Math.imul(31, hash) + goalId.charCodeAt(index)
    hash |= 0
  }

  return hash
}

export function buildGoalPositionUpdates(orderedPlanIds: string[]): Array<{ plan_id: string; goal_position: number }> {
  return orderedPlanIds.map((plan_id, index) => ({
    plan_id,
    goal_position: (index + 1) * GOAL_POSITION_STEP,
  }))
}

export function validateGoalPlanOrder({
  goal_id,
  ordered_plan_ids,
  currentPlans,
}: GoalPlanOrderValidationInput): GoalPlanOrderValidationResult {
  if (!Array.isArray(ordered_plan_ids) || ordered_plan_ids.length === 0) {
    return { ok: false, error: "ordered_plan_ids must be a non-empty array" }
  }

  const uniquePlanIds = new Set(ordered_plan_ids)
  if (uniquePlanIds.size !== ordered_plan_ids.length) {
    return { ok: false, error: "ordered_plan_ids must not contain duplicates" }
  }

  const currentPlanIds = new Set(currentPlans.map(plan => plan.plan_id))
  for (const plan of currentPlans) {
    if (plan.goal_id !== goal_id) {
      return { ok: false, error: "currentPlans contains a plan outside this goal" }
    }
  }

  for (const planId of ordered_plan_ids) {
    if (!currentPlanIds.has(planId)) {
      return { ok: false, error: "ordered_plan_ids contains a plan outside this goal" }
    }
  }

  if (currentPlanIds.size !== ordered_plan_ids.length) {
    return { ok: false, error: "ordered_plan_ids must include every plan for this goal" }
  }

  return { ok: true }
}
