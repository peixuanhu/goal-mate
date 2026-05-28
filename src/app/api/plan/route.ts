import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient, type Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import {
  GOAL_ROUTE_LOCK_NAMESPACE,
  getGoalRouteLockKey,
  getNextGoalPosition,
} from '@/lib/plan-goal-utils'

const prisma = new PrismaClient()

class GoalNotFoundError extends Error {}
class PlanNotFoundError extends Error {}
class PlanOwnershipChangedError extends Error {}

type PlanGoalDb = PrismaClient | Prisma.TransactionClient

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

async function lockGoalRoute(db: PlanGoalDb, goal_id: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${GOAL_ROUTE_LOCK_NAMESPACE}::int, ${getGoalRouteLockKey(goal_id)}::int)`
}

async function getNextPositionForGoal(db: PlanGoalDb, goal_id: string): Promise<number> {
  const result = await db.plan.aggregate({
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

  try {
    const plan = await prisma.$transaction(async tx => {
      if (goal_id) {
        await lockGoalRoute(tx, goal_id)
        const existingGoal = await tx.goal.findUnique({ where: { goal_id } })
        if (!existingGoal) {
          throw new GoalNotFoundError()
        }
        createData.goal_id = goal_id
        createData.goal_position = await getNextPositionForGoal(tx, goal_id)
      }

      const plan = await tx.plan.create({ data: createData })

      if (tags && Array.isArray(tags)) {
        await Promise.all(tags.map((tag: string) =>
          tx.planTagAssociation.create({ data: { plan_id: plan.plan_id, tag } })
        ))
      }

      return plan
    })

    return NextResponse.json(plan)
  } catch (error) {
    if (error instanceof GoalNotFoundError) {
      return NextResponse.json({ error: '目标不存在' }, { status: 400 })
    }
    throw error
  }
}

export async function PUT(req: NextRequest) {
  const data = await req.json() as Record<string, unknown>
  const plan_id = data.plan_id as string
  const tags = data.tags
  const hasExpectedGoalId = Object.prototype.hasOwnProperty.call(data, 'expected_goal_id')

  const updateData = omitFields(data, UPDATE_OMIT_FIELDS)

  try {
    const plan = await prisma.$transaction(async tx => {
      if (Object.prototype.hasOwnProperty.call(data, 'goal_id')) {
        const nextGoalId = normalizeGoalId(data.goal_id)
        const expectedGoalId = normalizeGoalId(data.expected_goal_id)

        if (hasExpectedGoalId) {
          if (nextGoalId === null) {
            updateData.goal_id = null
            updateData.goal_position = null
          } else if (nextGoalId) {
            await lockGoalRoute(tx, nextGoalId)
            const existingGoal = await tx.goal.findUnique({ where: { goal_id: nextGoalId } })
            if (!existingGoal) {
              throw new GoalNotFoundError()
            }
            updateData.goal_id = nextGoalId
            updateData.goal_position = await getNextPositionForGoal(tx, nextGoalId)
          }

          const result = await tx.plan.updateMany({
            where: { plan_id, goal_id: expectedGoalId },
            data: updateData,
          })
          if (result.count === 0) {
            throw new PlanOwnershipChangedError()
          }

          if (tags && Array.isArray(tags)) {
            await tx.planTagAssociation.deleteMany({ where: { plan_id } })
            await Promise.all(tags.map((tag: string) =>
              tx.planTagAssociation.create({ data: { plan_id, tag } })
            ))
          }
          return tx.plan.findUnique({ where: { plan_id } })
        }

        const existingPlan = await tx.plan.findUnique({
          where: { plan_id },
          select: { goal_id: true },
        })
        if (!existingPlan) {
          throw new PlanNotFoundError()
        }

        if (nextGoalId === null) {
          updateData.goal_id = null
          updateData.goal_position = null
        } else if (nextGoalId && nextGoalId !== existingPlan.goal_id) {
          await lockGoalRoute(tx, nextGoalId)
          const existingGoal = await tx.goal.findUnique({ where: { goal_id: nextGoalId } })
          if (!existingGoal) {
            throw new GoalNotFoundError()
          }
          updateData.goal_id = nextGoalId
          updateData.goal_position = await getNextPositionForGoal(tx, nextGoalId)
        }
      }

      const plan = await tx.plan.update({
        where: { plan_id },
        data: updateData
      })

      if (tags && Array.isArray(tags)) {
        await tx.planTagAssociation.deleteMany({ where: { plan_id } })
        await Promise.all(tags.map((tag: string) =>
          tx.planTagAssociation.create({ data: { plan_id, tag } })
        ))
      }

      return plan
    })

    return NextResponse.json(plan)
  } catch (error) {
    if (error instanceof GoalNotFoundError) {
      return NextResponse.json({ error: '目标不存在' }, { status: 400 })
    }
    if (error instanceof PlanNotFoundError) {
      return NextResponse.json({ error: '计划不存在' }, { status: 404 })
    }
    if (error instanceof PlanOwnershipChangedError) {
      return NextResponse.json({ error: '计划归属已变化，请刷新后重试' }, { status: 409 })
    }
    throw error
  }
}

// DELETE: DeletePlan
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const plan_id = searchParams.get('plan_id') || undefined
  if (!plan_id) return NextResponse.json({ success: false, message: 'plan_id required' }, { status: 400 })
  await prisma.plan.delete({ where: { plan_id } })
  return NextResponse.json({ success: true })
}
