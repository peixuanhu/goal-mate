import { NextRequest, NextResponse } from "next/server"
import { PrismaClient, type Prisma } from "@prisma/client"

import {
  buildGoalPositionUpdates,
  lockGoalOrder,
  validateGoalOrder,
} from "@/lib/goal-order"

const prisma = new PrismaClient()

class GoalOrderInputError extends Error {}
class GoalOrderChangedError extends Error {}

const GOAL_ORDER: Prisma.GoalOrderByWithRelationInput[] = [
  { position: { sort: "asc", nulls: "last" } },
  { gmt_create: "desc" },
  { goal_id: "asc" },
]

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.length > 0)
}

export async function PUT(req: NextRequest) {
  let data: unknown
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ error: "请求体必须是有效 JSON 对象" }, { status: 400 })
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ error: "请求体必须是有效 JSON 对象" }, { status: 400 })
  }

  const { ordered_goal_ids } = data as { ordered_goal_ids?: unknown }
  if (!isStringArray(ordered_goal_ids)) {
    return NextResponse.json({ error: "ordered_goal_ids must be a string array" }, { status: 400 })
  }

  try {
    const goals = await prisma.$transaction(async tx => {
      await lockGoalOrder(tx)

      const currentGoals = await tx.goal.findMany({
        select: { goal_id: true },
      })
      const validation = validateGoalOrder({ ordered_goal_ids, currentGoals })
      if (!validation.ok) {
        if (validation.kind === "invalid") {
          throw new GoalOrderInputError(validation.error)
        }
        throw new GoalOrderChangedError(validation.error)
      }

      const updates = buildGoalPositionUpdates(ordered_goal_ids)
      for (const update of updates) {
        const result = await tx.goal.updateMany({
          where: { goal_id: update.goal_id },
          data: { position: update.position },
        })
        if (result.count !== 1) {
          throw new GoalOrderChangedError("目标集合已变化，请刷新后重试")
        }
      }

      return tx.goal.findMany({ orderBy: GOAL_ORDER })
    })

    return NextResponse.json({ list: goals, total: goals.length })
  } catch (error) {
    if (error instanceof GoalOrderInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof GoalOrderChangedError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }
}
