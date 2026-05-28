import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient, type Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { getNextGoalPosition } from '@/lib/plan-goal-utils'

const prisma = new PrismaClient()

const CREATE_OMIT_FIELDS = new Set([
  'tags',
  'goal_id',
  'goal_position',
  'goal',
  'id',
  'gmt_create',
  'gmt_modified',
  'progressRecords',
])

const UPDATE_OMIT_FIELDS = new Set([
  'plan_id',
  'expected_goal_id',
  'tags',
  'goal_id',
  'goal_position',
  'goal',
  'id',
  'gmt_create',
  'gmt_modified',
  'progressRecords',
])

function omitFields(data: Record<string, unknown>, fieldsToOmit: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (!fieldsToOmit.has(key) && value !== undefined) {
      result[key] = value
    }
  }
  return result
}

function sanitizeCreateData(data: Record<string, unknown>): Omit<Prisma.PlanUncheckedCreateInput, 'plan_id' | 'goal_id' | 'goal_position'> {
  return omitFields(data, CREATE_OMIT_FIELDS) as Omit<Prisma.PlanUncheckedCreateInput, 'plan_id' | 'goal_id' | 'goal_position'>
}

function normalizeGoalId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return String(value)
}

async function getNextPositionForGoal(goal_id: string): Promise<number> {
  const result = await prisma.plan.aggregate({
    where: { goal_id },
    _max: { goal_position: true },
  })

  return getNextGoalPosition(result._max.goal_position)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tag = searchParams.get('tag')
  const difficulty = searchParams.get('difficulty')
  const goal_id = searchParams.get('goal_id')
  const is_scheduled = searchParams.get('is_scheduled')
  const priority_quadrant = searchParams.get('priority_quadrant')
  const unscheduled = searchParams.get('unscheduled')
  const unassigned = searchParams.get('unassigned')
  const pageNum = parseInt(searchParams.get('pageNum') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '10')

  const where: Record<string, unknown> = {}
  if (difficulty) where.difficulty = difficulty
  if (is_scheduled !== null && is_scheduled !== undefined) {
    where.is_scheduled = is_scheduled === 'true'
  }
  if (priority_quadrant) where.priority_quadrant = priority_quadrant
  if (unscheduled === 'true') {
    where.is_scheduled = false
  }
  if (unassigned === 'true') {
    where.goal_id = null
  } else if (goal_id) {
    where.goal_id = goal_id
  }
  if (!goal_id && unassigned !== 'true' && tag) {
    where.tags = { some: { tag } }
  }

  const orderBy = goal_id
    ? [{ goal_position: 'asc' as const }, { gmt_create: 'asc' as const }]
    : { gmt_create: 'desc' as const }

  const [plans, total] = await Promise.all([
    prisma.plan.findMany({
      where,
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
      orderBy,
      include: {
        tags: true,
        goal: { select: { goal_id: true, name: true, tag: true } },
        progressRecords: {
          select: {
            gmt_create: true
          },
          orderBy: { gmt_create: 'desc' }
        }
      }
    }),
    prisma.plan.count({ where })
  ])

  const result = plans.map(plan => ({
    ...plan,
    tags: plan.tags.map(t => t.tag)
  }))

  return NextResponse.json({ list: result, total })
}

export async function POST(req: NextRequest) {
  const data = await req.json() as Record<string, unknown>
  const tags = data.tags
  const goal_id = normalizeGoalId(data.goal_id)

  const createData: Prisma.PlanUncheckedCreateInput = {
    ...sanitizeCreateData(data),
    plan_id: `plan_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
  }

  if (goal_id) {
    const existingGoal = await prisma.goal.findUnique({ where: { goal_id } })
    if (!existingGoal) {
      return NextResponse.json({ error: '目标不存在' }, { status: 400 })
    }
    createData.goal_id = goal_id
    createData.goal_position = await getNextPositionForGoal(goal_id)
  }

  const plan = await prisma.plan.create({ data: createData })

  if (tags && Array.isArray(tags)) {
    await Promise.all(tags.map((tag: string) =>
      prisma.planTagAssociation.create({ data: { plan_id: plan.plan_id, tag } })
    ))
  }
  return NextResponse.json(plan)
}

export async function PUT(req: NextRequest) {
  const data = await req.json() as Record<string, unknown>
  const plan_id = data.plan_id as string
  const tags = data.tags
  const hasExpectedGoalId = Object.prototype.hasOwnProperty.call(data, 'expected_goal_id')

  const updateData = omitFields(data, UPDATE_OMIT_FIELDS)

  if (Object.prototype.hasOwnProperty.call(data, 'goal_id')) {
    const nextGoalId = normalizeGoalId(data.goal_id)
    const expectedGoalId = normalizeGoalId(data.expected_goal_id)

    if (hasExpectedGoalId) {
      if (nextGoalId === null) {
        updateData.goal_id = null
        updateData.goal_position = null
      } else if (nextGoalId) {
        const existingGoal = await prisma.goal.findUnique({ where: { goal_id: nextGoalId } })
        if (!existingGoal) {
          return NextResponse.json({ error: '目标不存在' }, { status: 400 })
        }
        updateData.goal_id = nextGoalId
        updateData.goal_position = await getNextPositionForGoal(nextGoalId)
      }

      const result = await prisma.plan.updateMany({
        where: { plan_id, goal_id: expectedGoalId },
        data: updateData,
      })
      if (result.count === 0) {
        return NextResponse.json({ error: '计划归属已变化，请刷新后重试' }, { status: 409 })
      }

      if (tags && Array.isArray(tags)) {
        await prisma.planTagAssociation.deleteMany({ where: { plan_id } })
        await Promise.all(tags.map((tag: string) =>
          prisma.planTagAssociation.create({ data: { plan_id, tag } })
        ))
      }
      const plan = await prisma.plan.findUnique({ where: { plan_id } })
      return NextResponse.json(plan)
    }

    const existingPlan = await prisma.plan.findUnique({
      where: { plan_id },
      select: { goal_id: true },
    })
    if (!existingPlan) {
      return NextResponse.json({ error: '计划不存在' }, { status: 404 })
    }

    if (nextGoalId === null) {
      updateData.goal_id = null
      updateData.goal_position = null
    } else if (nextGoalId && nextGoalId !== existingPlan.goal_id) {
      const existingGoal = await prisma.goal.findUnique({ where: { goal_id: nextGoalId } })
      if (!existingGoal) {
        return NextResponse.json({ error: '目标不存在' }, { status: 400 })
      }
      updateData.goal_id = nextGoalId
      updateData.goal_position = await getNextPositionForGoal(nextGoalId)
    }
  }

  const plan = await prisma.plan.update({
    where: { plan_id },
    data: updateData
  })

  if (tags && Array.isArray(tags)) {
    await prisma.planTagAssociation.deleteMany({ where: { plan_id } })
    await Promise.all(tags.map((tag: string) =>
      prisma.planTagAssociation.create({ data: { plan_id, tag } })
    ))
  }
  return NextResponse.json(plan)
}

// DELETE: DeletePlan
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const plan_id = searchParams.get('plan_id') || undefined
  if (!plan_id) return NextResponse.json({ success: false, message: 'plan_id required' }, { status: 400 })
  await prisma.plan.delete({ where: { plan_id } })
  return NextResponse.json({ success: true })
}
