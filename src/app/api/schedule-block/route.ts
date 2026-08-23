import { PrismaClient } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

import {
  getDefaultPlanningPreference,
  toPlanningPreferenceView,
} from "@/lib/today/planning-preference"
import {
  cancelScheduleBlock,
  createScheduleBlock,
  parseScheduleBlockVersion,
  ScheduleServiceError,
  toScheduleBlockView,
  updateScheduleBlock,
  type CreateScheduleBlockInput,
} from "@/lib/today/schedule-service"
import { getUtcDayRange } from "@/lib/today/timezone"
import type { ScheduleBlockSource } from "@/lib/today/types"
import { parseDateKey } from "@/lib/today/validation"

const prisma = new PrismaClient()
const DEFAULT_PREFERENCE_ID = "default"
const POST_FIELDS = new Set(["plan_id", "action_id", "start_at", "end_at", "status", "source"])
const UPDATE_FIELDS = new Set(["operation", "block_id", "expected_version", "start_at", "end_at"])
const CANCEL_FIELDS = new Set(["operation", "block_id", "expected_version"])
const SOURCES = new Set<ScheduleBlockSource>(["manual", "ai_check", "ai_chat"])
const SCHEDULE_RELATIONS = {
  plan: {
    select: {
      plan_id: true,
      name: true,
      energy_level: true,
      goal: { select: { goal_id: true, name: true } },
    },
  },
  action: {
    select: {
      action_id: true,
      plan_id: true,
      name: true,
      energy_level: true,
      is_completed: true,
    },
  },
} as const

function routeValidation(message: string): never {
  throw new ScheduleServiceError("VALIDATION", message)
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
    routeValidation("请求体必须是有效 JSON 对象")
  }
  if (!isPlainObject(value)) {
    routeValidation("请求体必须是有效 JSON 对象")
  }
  return value
}

function assertOnlyFields(body: Record<string, unknown>, fields: ReadonlySet<string>): void {
  const unexpected = Object.keys(body).find(field => !fields.has(field))
  if (unexpected) {
    routeValidation(`unexpected field: ${unexpected}`)
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    routeValidation(`${field} required`)
  }
  return value.trim()
}

function optionalStringOrNull(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) return value
  return requiredString(value, field)
}

export function toScheduleErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof ScheduleServiceError)) {
    return null
  }

  const status = error.code === "VALIDATION"
    ? 400
    : error.code === "NOT_FOUND"
      ? 404
      : 409
  return NextResponse.json({
    error: error.message,
    code: error.code,
    ...(error.conflictIds ? { conflictIds: error.conflictIds } : {}),
  }, { status })
}

export async function GET(req: NextRequest) {
  let date: string
  try {
    date = parseDateKey(new URL(req.url).searchParams.get("date"))
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "date must be a valid yyyy-mm-dd value",
      code: "VALIDATION",
    }, { status: 400 })
  }

  const preferenceRow = await prisma.planningPreference.findUnique({
    where: { preference_id: DEFAULT_PREFERENCE_ID },
  })
  const preference = preferenceRow
    ? toPlanningPreferenceView(preferenceRow)
    : getDefaultPlanningPreference()
  const { start, endExclusive } = getUtcDayRange(date, preference.timezone)
  const rows = await prisma.scheduleBlock.findMany({
    where: {
      start_at: { lt: endExclusive },
      end_at: { gt: start },
    },
    include: SCHEDULE_RELATIONS,
    orderBy: [{ start_at: "asc" }, { block_id: "asc" }],
  })
  const list = rows.map(row => toScheduleBlockView(row))

  return NextResponse.json({ list, total: list.length })
}

export async function POST(req: NextRequest) {
  try {
    const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() ?? ""
    if (idempotencyKey.length < 1 || idempotencyKey.length > 128) {
      routeValidation("Idempotency-Key must contain 1 to 128 characters")
    }

    const body = await readJsonObject(req)
    assertOnlyFields(body, POST_FIELDS)
    const source = body.source
    if (source !== undefined && (typeof source !== "string" || !SOURCES.has(source as ScheduleBlockSource))) {
      routeValidation("source must be manual, ai_check, or ai_chat")
    }
    const status = body.status
    if (status !== undefined && status !== "scheduled") {
      routeValidation("status must be scheduled")
    }

    const input: CreateScheduleBlockInput = {
      idempotency_key: idempotencyKey,
      plan_id: requiredString(body.plan_id, "plan_id"),
      action_id: optionalStringOrNull(body.action_id, "action_id"),
      start_at: requiredString(body.start_at, "start_at"),
      end_at: requiredString(body.end_at, "end_at"),
      ...(status === "scheduled" ? { status } : {}),
      ...(typeof source === "string" ? { source: source as ScheduleBlockSource } : {}),
    }
    return NextResponse.json(await createScheduleBlock(prisma, input))
  } catch (error) {
    const response = toScheduleErrorResponse(error)
    if (response) return response
    throw error
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    if (body.operation === "update") {
      assertOnlyFields(body, UPDATE_FIELDS)
      return NextResponse.json(await updateScheduleBlock(prisma, {
        block_id: requiredString(body.block_id, "block_id"),
        expected_version: parseScheduleBlockVersion(body.expected_version),
        start_at: requiredString(body.start_at, "start_at"),
        end_at: requiredString(body.end_at, "end_at"),
      }))
    }
    if (body.operation === "cancel") {
      assertOnlyFields(body, CANCEL_FIELDS)
      return NextResponse.json(await cancelScheduleBlock(prisma, {
        block_id: requiredString(body.block_id, "block_id"),
        expected_version: parseScheduleBlockVersion(body.expected_version),
      }))
    }
    routeValidation("operation must be update or cancel")
  } catch (error) {
    const response = toScheduleErrorResponse(error)
    if (response) return response
    throw error
  }
}
