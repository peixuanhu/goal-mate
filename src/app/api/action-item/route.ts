import { createHash } from "node:crypto"

import { PrismaClient, type Prisma } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

import { getGoalRouteLockKey } from "@/lib/plan-goal-utils"
import { parseActionItemInput, parsePlanningFields } from "@/lib/today/validation"

const prisma = new PrismaClient()
const ACTION_POSITION_LOCK_NAMESPACE = 48_232
const POSITION_STEP = 1000
const POSTGRESQL_INT_MAX = 2_147_483_647
const POST_FIELDS = new Set([
  "plan_id",
  "name",
  "description",
  "due_date",
  "estimated_minutes",
  "energy_level",
  "priority_quadrant",
])
const PUT_FIELDS = new Set([
  "action_id",
  "name",
  "description",
  "due_date",
  "estimated_minutes",
  "energy_level",
  "priority_quadrant",
  "is_completed",
])

type ActionItemDb = PrismaClient | Prisma.TransactionClient
type LockedPlanRow = {
  plan_id: string
  is_recurring: boolean
}
type LockedActionItemRow = {
  action_id: string
  is_completed: boolean
  completed_at: Date | null
}
type LockedScheduleBlockRow = {
  block_id: string
}
type NormalizedCreatePayload = {
  plan_id: string
  name: string
  description: string | null
  due_date: Date | null
  estimated_minutes: number | null
  energy_level: string | null
  priority_quadrant: string | null
}
type EditableActionData = {
  name?: string
  description?: string | null
  due_date?: Date | null
  estimated_minutes?: number | null
  energy_level?: string | null
  priority_quadrant?: string | null
  is_completed?: boolean
  completed_at?: Date | null
}

class ActionItemValidationError extends Error {}
class PlanNotFoundError extends Error {}
class ActionItemNotFoundError extends Error {}
class RecurringPlanError extends Error {}
class IdempotencyCollisionError extends Error {}
class ProtectedActionItemError extends Error {}
class ActionPositionExhaustedError extends Error {}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function parseValidated<T>(callback: () => T): T {
  try {
    return callback()
  } catch (error) {
    if (error instanceof ActionItemValidationError) {
      throw error
    }
    if (error instanceof Error) {
      throw new ActionItemValidationError(error.message)
    }
    throw error
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

async function readJsonObject(req: NextRequest): Promise<Record<string, unknown>> {
  let value: unknown
  try {
    value = await req.json()
  } catch {
    throw new ActionItemValidationError("请求体必须是有效 JSON 对象")
  }

  if (!isPlainObject(value)) {
    throw new ActionItemValidationError("请求体必须是有效 JSON 对象")
  }
  return value
}

function assertOnlyFields(data: Record<string, unknown>, allowedFields: Set<string>) {
  const unexpectedField = Object.keys(data).find(key => !allowedFields.has(key))
  if (unexpectedField) {
    throw new ActionItemValidationError(`unexpected field: ${unexpectedField}`)
  }
}

function requiredTrimmedString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ActionItemValidationError(`${field} required`)
  }
  return value.trim()
}

function normalizeCreatePayload(data: Record<string, unknown>): NormalizedCreatePayload {
  assertOnlyFields(data, POST_FIELDS)
  const planId = requiredTrimmedString(data.plan_id, "plan_id")
  const input = parseActionItemInput(data)

  return {
    plan_id: planId,
    name: input.name,
    description: input.description ?? null,
    due_date: input.due_date ?? null,
    estimated_minutes: input.estimated_minutes ?? null,
    energy_level: input.energy_level ?? null,
    priority_quadrant: input.priority_quadrant ?? null,
  }
}

function normalizeEditableData(data: Record<string, unknown>): { actionId: string; updateData: EditableActionData } {
  assertOnlyFields(data, PUT_FIELDS)
  const actionId = requiredTrimmedString(data.action_id, "action_id")
  const updateData: EditableActionData = { ...parsePlanningFields(data) }

  if (Object.prototype.hasOwnProperty.call(data, "name")) {
    updateData.name = parseActionItemInput({ name: data.name }).name
  }
  if (Object.prototype.hasOwnProperty.call(data, "description")) {
    updateData.description = parseActionItemInput({ name: "validation", description: data.description }).description ?? null
  }
  if (Object.prototype.hasOwnProperty.call(data, "is_completed")) {
    if (typeof data.is_completed !== "boolean") {
      throw new ActionItemValidationError("is_completed must be a boolean")
    }
    updateData.is_completed = data.is_completed
  }

  if (Object.keys(updateData).length === 0) {
    throw new ActionItemValidationError("at least one editable field required")
  }

  return { actionId, updateData }
}

function actionIdFromKey(key: string): string {
  return `action_${createHash("sha256").update(key).digest("hex").slice(0, 10)}`
}

async function lockActionPositions(db: ActionItemDb, planId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${ACTION_POSITION_LOCK_NAMESPACE}::int, ${getGoalRouteLockKey(planId)}::int)`
}

async function lockPlan(db: ActionItemDb, planId: string): Promise<LockedPlanRow | null> {
  const rows = await db.$queryRaw<LockedPlanRow[]>`SELECT "plan_id", "is_recurring" FROM "Plan" WHERE "plan_id" = ${planId} FOR UPDATE`
  return rows[0] ?? null
}

async function lockActionItem(db: ActionItemDb, actionId: string): Promise<LockedActionItemRow | null> {
  const rows = await db.$queryRaw<LockedActionItemRow[]>`SELECT "action_id", "is_completed", "completed_at" FROM "ActionItem" WHERE "action_id" = ${actionId} FOR UPDATE`
  return rows[0] ?? null
}

async function lockActionScheduleBlocks(db: ActionItemDb, actionId: string): Promise<void> {
  await db.$queryRaw<LockedScheduleBlockRow[]>`SELECT "block_id" FROM "ScheduleBlock" WHERE "action_id" = ${actionId} FOR UPDATE`
}

function sameDate(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) {
    return left === right
  }
  return left.getTime() === right.getTime()
}

function immutablePayloadMatches(
  existing: {
    plan_id: string
    name: string
    description: string | null
    due_date: Date | null
    estimated_minutes: number | null
    energy_level: string | null
    priority_quadrant: string | null
  },
  payload: NormalizedCreatePayload,
): boolean {
  return existing.plan_id === payload.plan_id
    && existing.name === payload.name
    && existing.description === payload.description
    && sameDate(existing.due_date, payload.due_date)
    && existing.estimated_minutes === payload.estimated_minutes
    && existing.energy_level === payload.energy_level
    && existing.priority_quadrant === payload.priority_quadrant
}

function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === code
}

function mapMutationError(error: unknown): NextResponse | null {
  if (error instanceof ActionItemValidationError) {
    return validationError(error.message)
  }
  if (error instanceof PlanNotFoundError) {
    return NextResponse.json({ error: "计划不存在" }, { status: 404 })
  }
  if (error instanceof ActionItemNotFoundError || isPrismaError(error, "P2025")) {
    return NextResponse.json({ error: "行动项不存在" }, { status: 404 })
  }
  if (error instanceof RecurringPlanError) {
    return validationError("周期性计划不能创建行动项")
  }
  if (error instanceof IdempotencyCollisionError || isPrismaError(error, "P2002")) {
    return NextResponse.json({ error: "幂等键已用于不同的行动项内容" }, { status: 409 })
  }
  if (error instanceof ProtectedActionItemError) {
    return NextResponse.json({ error: "行动项存在未来已排期时间块" }, { status: 409 })
  }
  if (error instanceof ActionPositionExhaustedError) {
    return NextResponse.json({ error: "行动项排序空间已用尽" }, { status: 409 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const planId = new URL(req.url).searchParams.get("plan_id")?.trim()
  if (!planId) {
    return validationError("plan_id required")
  }

  const actions = await prisma.actionItem.findMany({
    where: { plan_id: planId },
    orderBy: [{ position: "asc" }, { gmt_create: "asc" }],
  })

  return NextResponse.json({ list: actions, total: actions.length })
}

export async function POST(req: NextRequest) {
  const rawIdempotencyKey = req.headers.get("Idempotency-Key")
  const idempotencyKey = rawIdempotencyKey?.trim() ?? ""
  if (idempotencyKey.length < 1 || idempotencyKey.length > 128) {
    return validationError("Idempotency-Key must contain 1 to 128 characters")
  }

  try {
    const data = await readJsonObject(req)
    const payload = parseValidated(() => normalizeCreatePayload(data))
    const actionId = actionIdFromKey(idempotencyKey)

    const action = await prisma.$transaction(async tx => {
      await lockActionPositions(tx, payload.plan_id)

      const plan = await lockPlan(tx, payload.plan_id)
      if (!plan) {
        throw new PlanNotFoundError()
      }
      if (plan.is_recurring) {
        throw new RecurringPlanError()
      }

      const existing = await tx.actionItem.findUnique({ where: { action_id: actionId } })
      if (existing) {
        if (!immutablePayloadMatches(existing, payload)) {
          throw new IdempotencyCollisionError()
        }
        return existing
      }

      const result = await tx.actionItem.aggregate({
        where: { plan_id: payload.plan_id },
        _max: { position: true },
      })
      const maxPosition = result._max.position ?? 0
      if (maxPosition > POSTGRESQL_INT_MAX - POSITION_STEP) {
        throw new ActionPositionExhaustedError()
      }
      const position = maxPosition + POSITION_STEP

      return tx.actionItem.create({
        data: {
          action_id: actionId,
          ...payload,
          position,
        },
      })
    })

    return NextResponse.json(action)
  } catch (error) {
    if (isPrismaError(error, "P2003")) {
      return NextResponse.json({ error: "计划不存在" }, { status: 404 })
    }
    const response = mapMutationError(error)
    if (response) return response
    throw error
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await readJsonObject(req)
    const { actionId, updateData } = parseValidated(() => normalizeEditableData(data))

    const action = await prisma.$transaction(async tx => {
      const existing = await lockActionItem(tx, actionId)
      if (!existing) {
        throw new ActionItemNotFoundError()
      }

      const mutationData = { ...updateData }
      if (updateData.is_completed === true && !existing.is_completed) {
        mutationData.completed_at = new Date()
      } else if (updateData.is_completed === false) {
        mutationData.completed_at = null
      }

      return tx.actionItem.update({
        where: { action_id: actionId },
        data: mutationData,
      })
    })

    return NextResponse.json(action)
  } catch (error) {
    const response = mapMutationError(error)
    if (response) return response
    throw error
  }
}

export async function DELETE(req: NextRequest) {
  const actionId = new URL(req.url).searchParams.get("action_id")?.trim()
  if (!actionId) {
    return validationError("action_id required")
  }

  try {
    await prisma.$transaction(async tx => {
      const existing = await lockActionItem(tx, actionId)
      if (!existing) {
        throw new ActionItemNotFoundError()
      }

      await lockActionScheduleBlocks(tx, actionId)
      const futureScheduledBlocks = await tx.scheduleBlock.count({
        where: {
          action_id: actionId,
          status: "scheduled",
          start_at: { gt: new Date() },
        },
      })
      if (futureScheduledBlocks > 0) {
        throw new ProtectedActionItemError()
      }

      await tx.actionItem.delete({ where: { action_id: actionId } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const response = mapMutationError(error)
    if (response) return response
    throw error
  }
}
