import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient, type Prisma } from '@prisma/client'

import {
  GOAL_ROUTE_LOCK_NAMESPACE,
  buildGoalPositionUpdates,
  getGoalRouteLockKey,
  validateGoalPlanOrder,
} from '@/lib/plan-goal-utils'

const prisma = new PrismaClient()

class GoalNotFoundError extends Error {}
class PlanRouteValidationError extends Error {}
class PlanRouteChangedError extends Error {}

type PlanGoalDb = PrismaClient | Prisma.TransactionClient

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.length > 0)
}

async function lockGoalRoute(db: PlanGoalDb, goal_id: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${GOAL_ROUTE_LOCK_NAMESPACE}::int, ${getGoalRouteLockKey(goal_id)}::int)`
}

export async function PUT(req: NextRequest) {
  let data: unknown
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体必须是有效 JSON 对象' }, { status: 400 })
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return NextResponse.json({ error: '请求体必须是有效 JSON 对象' }, { status: 400 })
  }

  const body = data as { goal_id?: unknown; ordered_plan_ids?: unknown }
  if (typeof body.goal_id !== 'string' || body.goal_id.length === 0) {
    return NextResponse.json({ error: 'goal_id required' }, { status: 400 })
  }
  if (!isStringArray(body.ordered_plan_ids)) {
    return NextResponse.json({ error: 'ordered_plan_ids must be a non-empty string array' }, { status: 400 })
  }
  const goalId = body.goal_id
  const orderedPlanIds = body.ordered_plan_ids

  let plans
  try {
    plans = await prisma.$transaction(async tx => {
      await lockGoalRoute(tx, goalId)

      const goal = await tx.goal.findUnique({
        where: { goal_id: goalId },
        select: { goal_id: true },
      })
      if (!goal) {
        throw new GoalNotFoundError()
      }

      const currentPlans = await tx.plan.findMany({
        where: { goal_id: goalId },
        select: { plan_id: true, goal_id: true },
      })

      const validation = validateGoalPlanOrder({
        goal_id: goalId,
        ordered_plan_ids: orderedPlanIds,
        currentPlans,
      })
      if (!validation.ok) {
        throw new PlanRouteValidationError(validation.error)
      }

      const updates = buildGoalPositionUpdates(orderedPlanIds)
      for (const update of updates) {
        const result = await tx.plan.updateMany({
          where: { plan_id: update.plan_id, goal_id: goalId },
          data: { goal_position: update.goal_position },
        })
        if (result.count !== 1) {
          throw new PlanRouteChangedError('计划归属已变化，请刷新后重试')
        }
      }

      return tx.plan.findMany({
        where: { goal_id: goalId },
        orderBy: [{ goal_position: 'asc' }, { gmt_create: 'asc' }],
        include: {
          tags: true,
          goal: { select: { goal_id: true, name: true, tag: true } },
          progressRecords: {
            select: { gmt_create: true },
            orderBy: { gmt_create: 'desc' },
          },
        },
      })
    })
  } catch (error) {
    if (error instanceof GoalNotFoundError) {
      return NextResponse.json({ error: '目标不存在' }, { status: 400 })
    }
    if (error instanceof PlanRouteValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof PlanRouteChangedError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }

  if (!plans) {
    return NextResponse.json({ error: '目标不存在' }, { status: 400 })
  }

  return NextResponse.json({
    list: plans.map(plan => ({
      ...plan,
      tags: plan.tags.map(tag => tag.tag),
    })),
    total: plans.length,
  })
}
