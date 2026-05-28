import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

import { buildGoalPositionUpdates, validateGoalPlanOrder } from '@/lib/plan-goal-utils'

const prisma = new PrismaClient()

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.length > 0)
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

  const goal = await prisma.goal.findUnique({
    where: { goal_id: body.goal_id },
    select: { goal_id: true },
  })
  if (!goal) {
    return NextResponse.json({ error: '目标不存在' }, { status: 400 })
  }

  const currentPlans = await prisma.plan.findMany({
    where: { goal_id: body.goal_id },
    select: { plan_id: true, goal_id: true },
  })

  const validation = validateGoalPlanOrder({
    goal_id: body.goal_id,
    ordered_plan_ids: body.ordered_plan_ids,
    currentPlans,
  })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const updates = buildGoalPositionUpdates(body.ordered_plan_ids)
  await prisma.$transaction(
    updates.map(update =>
      prisma.plan.update({
        where: { plan_id: update.plan_id },
        data: { goal_position: update.goal_position },
      }),
    ),
  )

  const plans = await prisma.plan.findMany({
    where: { goal_id: body.goal_id },
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

  return NextResponse.json({
    list: plans.map(plan => ({
      ...plan,
      tags: plan.tags.map(tag => tag.tag),
    })),
    total: plans.length,
  })
}
