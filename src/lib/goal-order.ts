import type { Prisma } from "@prisma/client"

export const GOAL_ORDER_LOCK_NAMESPACE = 48232

type GoalOrderDb = Pick<Prisma.TransactionClient, "$executeRaw">
export type GoalOrderCandidate = { goal_id: string }
export type GoalOrderValidationResult =
  | { ok: true }
  | { ok: false; kind: "invalid" | "conflict"; error: string }

export async function lockGoalOrder(db: GoalOrderDb): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${GOAL_ORDER_LOCK_NAMESPACE}::int)`
}

export function getNextGoalPosition(maxPosition: number | null | undefined): number {
  return typeof maxPosition === "number" ? maxPosition + 1 : 0
}

export function buildGoalPositionUpdates(orderedGoalIds: string[]): Array<{ goal_id: string; position: number }> {
  return orderedGoalIds.map((goal_id, position) => ({ goal_id, position }))
}

export function validateGoalOrder({ ordered_goal_ids, currentGoals }: {
  ordered_goal_ids: string[]
  currentGoals: GoalOrderCandidate[]
}): GoalOrderValidationResult {
  if (new Set(ordered_goal_ids).size !== ordered_goal_ids.length) {
    return { ok: false, kind: "invalid", error: "ordered_goal_ids must not contain duplicates" }
  }
  const currentIds = new Set(currentGoals.map(goal => goal.goal_id))
  const exactCollection = ordered_goal_ids.length === currentIds.size
    && ordered_goal_ids.every(goalId => currentIds.has(goalId))
  return exactCollection
    ? { ok: true }
    : { ok: false, kind: "conflict", error: "目标集合已变化，请刷新后重试" }
}
