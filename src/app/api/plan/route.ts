import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient, type Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import {
  GOAL_ROUTE_LOCK_NAMESPACE,
  getGoalRouteLockKey,
  getNextGoalPosition,
} from '@/lib/plan-goal-utils'
import { normalizePlanTiming } from '@/lib/plan-input'
import {
  getDefaultPlanningPreference,
  toPlanningPreferenceView,
} from '@/lib/today/planning-preference'
import { calculatePlanTimeBudget } from '@/lib/today/time-budget'

const prisma = new PrismaClient()

class GoalNotFoundError extends Error {}
class PlanNotFoundError extends Error {}
class PlanOwnershipChangedError extends Error {}
class PlanExecutionHistoryError extends Error {}
class PlanHasActionsError extends Error {}
class PlanRouteValidationError extends Error {}

type PlanGoalDb = PrismaClient | Prisma.TransactionClient
type LockedPlanMutationRow = { plan_id: string; is_recurring: boolean }

const CREATE_FIELDS = new Set([
  'name',
  'description',
  'difficulty',
  'progress',
  'is_recurring',
  'recurrence_type',
  'recurrence_value',
  'goal_id',
  'tags',
  'due_date',
  'estimated_minutes',
  'default_block_minutes',
  'energy_level',
  'priority_quadrant',
  'is_scheduled',
])
const UPDATE_FIELDS = new Set([...CREATE_FIELDS, 'plan_id', 'expected_goal_id'])

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

function routeValidation(message: string): never {
  throw new PlanRouteValidationError(message)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

async function readJsonObject(req: NextRequest): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    routeValidation('请求体必须是有效 JSON 对象')
  }

  if (!isPlainObject(body)) {
    routeValidation('请求体必须是有效 JSON 对象')
  }
  return body
}

function assertOnlyFields(body: Record<string, unknown>, fields: ReadonlySet<string>): void {
  const unexpected = Object.keys(body).find(field => !fields.has(field))
  if (unexpected) {
    routeValidation(`unexpected field: ${unexpected}`)
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    routeValidation(`${field} required`)
  }
  return value.trim()
}

function validateTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(tag => typeof tag !== 'string')) {
    routeValidation('tags must be an array of strings')
  }
  return value
}

function normalizeTiming(
  data: Record<string, unknown>,
  context: Parameters<typeof normalizePlanTiming>[1],
) {
  try {
    return normalizePlanTiming(data, context)
  } catch (error) {
    if (error instanceof Error) {
      routeValidation(error.message)
    }
    throw error
  }
}

function sanitizeCreateData(data: Record<string, unknown>): Omit<Prisma.PlanUncheckedCreateInput, 'plan_id' | 'goal_id' | 'goal_position'> {
  return omitFields(data, CREATE_OMIT_FIELDS) as Omit<Prisma.PlanUncheckedCreateInput, 'plan_id' | 'goal_id' | 'goal_position'>
}

function normalizeGoalId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string') {
    routeValidation('goal_id must be a string or null')
  }
  return value.trim() || null
}

async function lockPlanForMutation(
  tx: Prisma.TransactionClient,
  planId: string,
): Promise<LockedPlanMutationRow | null> {
  const rows = await tx.$queryRaw<LockedPlanMutationRow[]>`
    SELECT "plan_id", "is_recurring"
    FROM "Plan"
    WHERE "plan_id" = ${planId}
    FOR UPDATE
  `
  return rows[0] ?? null
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

  const [plans, total, preferenceRow] = await Promise.all([
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
            gmt_create: true,
            counts_toward_recurrence: true
          },
          orderBy: { gmt_create: 'desc' }
        },
        actionItems: {
          select: {
            action_id: true,
            estimated_minutes: true,
            is_completed: true,
          },
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
      }
    }),
    prisma.plan.count({ where }),
    prisma.planningPreference.findUnique({
      where: { preference_id: 'default' },
    }),
  ])

  const preference = preferenceRow
    ? toPlanningPreferenceView(preferenceRow)
    : getDefaultPlanningPreference()
  const ordinaryCreateTiming = normalizePlanTiming({}, { mode: 'create' })
  const ordinaryDefaultEstimate = ordinaryCreateTiming.estimated_minutes
  if (typeof ordinaryDefaultEstimate !== 'number') {
    throw new Error('Ordinary plan create timing must provide an estimate')
  }

  const result = plans.map(plan => {
    const { actionItems, scheduleBlocks, ...publicPlan } = plan
    const budgetRelations = {
      default_block_minutes: plan.default_block_minutes,
      actions: actionItems,
      blocks: scheduleBlocks,
    }
    const timeBudget = plan.is_recurring
      ? calculatePlanTimeBudget({
        ...budgetRelations,
        is_recurring: true,
        estimated_minutes: null,
      }, preference.default_block_minutes)
      : calculatePlanTimeBudget({
        ...budgetRelations,
        is_recurring: false,
        estimated_minutes: plan.estimated_minutes ?? ordinaryDefaultEstimate,
      }, preference.default_block_minutes)

    return {
      ...publicPlan,
      tags: plan.tags.map(t => t.tag),
      time_budget: timeBudget,
      has_execution_history: scheduleBlocks.length > 0 || plan.progressRecords.length > 0,
    }
  })

  return NextResponse.json({ list: result, total })
}

export async function POST(req: NextRequest) {
  try {
    const data = await readJsonObject(req)
    assertOnlyFields(data, CREATE_FIELDS)
    const name = requiredString(data.name, 'name')
    const tags = validateTags(data.tags)
    const goal_id = normalizeGoalId(data.goal_id)
    const timing = normalizeTiming(data, { mode: 'create' })

    const createData: Prisma.PlanUncheckedCreateInput = {
      ...sanitizeCreateData(data),
      ...timing,
      name,
      plan_id: `plan_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
    }

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

      if (tags) {
        await Promise.all(tags.map(tag =>
          tx.planTagAssociation.create({ data: { plan_id: plan.plan_id, tag } })
        ))
      }

      return plan
    })

    return NextResponse.json(plan)
  } catch (error) {
    if (error instanceof PlanRouteValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof GoalNotFoundError) {
      return NextResponse.json({ error: '目标不存在' }, { status: 400 })
    }
    throw error
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await readJsonObject(req)
    assertOnlyFields(data, UPDATE_FIELDS)
    const plan_id = requiredString(data.plan_id, 'plan_id')
    const tags = validateTags(data.tags)
    const hasGoalId = Object.prototype.hasOwnProperty.call(data, 'goal_id')
    const hasExpectedGoalId = Object.prototype.hasOwnProperty.call(data, 'expected_goal_id')
    const nextGoalId = hasGoalId ? normalizeGoalId(data.goal_id) : undefined
    const expectedGoalId = hasExpectedGoalId
      ? normalizeGoalId(data.expected_goal_id)
      : undefined
    if (hasGoalId && nextGoalId === undefined) {
      routeValidation('goal_id must be a string or null')
    }
    if (hasExpectedGoalId && expectedGoalId === undefined) {
      routeValidation('expected_goal_id must be a string or null')
    }
    if (
      Object.prototype.hasOwnProperty.call(data, 'is_recurring')
      && typeof data.is_recurring !== 'boolean'
    ) {
      routeValidation('is_recurring 必须是布尔值')
    }

    const plan = await prisma.$transaction(async tx => {
      if (hasGoalId && nextGoalId) {
        await lockGoalRoute(tx, nextGoalId)
      }

      const lockedPlan = await lockPlanForMutation(tx, plan_id)
      if (!lockedPlan) {
        throw new PlanNotFoundError()
      }

      const timing = normalizeTiming(data, {
        mode: 'update',
        currentIsRecurring: lockedPlan.is_recurring,
      })
      const changesRecurringType = typeof timing.is_recurring === 'boolean'
        && timing.is_recurring !== lockedPlan.is_recurring
      if (changesRecurringType) {
        const [scheduleBlockCount, progressRecordCount] = await Promise.all([
          tx.scheduleBlock.count({ where: { plan_id } }),
          tx.progressRecord.count({ where: { plan_id } }),
        ])
        if (scheduleBlockCount > 0 || progressRecordCount > 0) {
          throw new PlanExecutionHistoryError()
        }

        if (timing.is_recurring) {
          const actionCount = await tx.actionItem.count({ where: { plan_id } })
          if (actionCount > 0) {
            throw new PlanHasActionsError()
          }
        }
      }

      const updateData = omitFields(data, UPDATE_OMIT_FIELDS)
      Object.assign(updateData, timing)

      if (hasGoalId) {

        if (hasExpectedGoalId) {
          if (nextGoalId === null) {
            updateData.goal_id = null
            updateData.goal_position = null
          } else if (nextGoalId) {
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

          if (tags !== undefined) {
            await tx.planTagAssociation.deleteMany({ where: { plan_id } })
            await Promise.all(tags.map(tag =>
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

      if (tags !== undefined) {
        await tx.planTagAssociation.deleteMany({ where: { plan_id } })
        await Promise.all(tags.map(tag =>
          tx.planTagAssociation.create({ data: { plan_id, tag } })
        ))
      }

      return plan
    })

    return NextResponse.json(plan)
  } catch (error) {
    if (error instanceof PlanRouteValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof GoalNotFoundError) {
      return NextResponse.json({ error: '目标不存在' }, { status: 400 })
    }
    if (error instanceof PlanNotFoundError) {
      return NextResponse.json({ error: '计划不存在' }, { status: 404 })
    }
    if (error instanceof PlanOwnershipChangedError) {
      return NextResponse.json({ error: '计划归属已变化，请刷新后重试' }, { status: 409 })
    }
    if (error instanceof PlanExecutionHistoryError) {
      return NextResponse.json({ error: '已有执行记录，不能切换周期类型' }, { status: 409 })
    }
    if (error instanceof PlanHasActionsError) {
      return NextResponse.json({ error: '已有行动项，不能切换为周期计划' }, { status: 409 })
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
