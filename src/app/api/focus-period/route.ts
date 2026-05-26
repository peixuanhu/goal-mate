import { Prisma, PrismaClient } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"
import {
  createPeriodId,
  type ExistingFocusPeriod,
  type FocusPeriodInput,
  mapFocusPeriodRecord,
  toDateOnly,
  validateFocusPeriodInput,
} from "@/lib/focus-period-api"
import { type FocusGoalSummary, normalizeDateInput } from "@/lib/focus-period-utils"

const prisma = new PrismaClient()
const FOCUS_PERIOD_LOCK_NAMESPACE = 704251

type FocusPeriodDb = PrismaClient | Prisma.TransactionClient
type RouteResult<T> =
  | { type: "success"; data: T }
  | { type: "validation"; message: string }
  | { type: "not-found" }

function parseYear(value: string | null): number | null {
  if (value === null) {
    return new Date().getFullYear()
  }
  if (value.trim() === "") {
    return null
  }

  const year = Number(value)
  return Number.isInteger(year) ? year : null
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function notFoundError() {
  return NextResponse.json({ success: false, message: "专注阶段不存在" }, { status: 404 })
}

function mapGoalsById(goals: FocusGoalSummary[]): Map<string, FocusGoalSummary> {
  return new Map(goals.map(goal => [goal.goal_id, goal]))
}

function validateWithoutExistingPeriods(input: FocusPeriodInput) {
  return validateFocusPeriodInput(input, [])
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readJsonObject(req: NextRequest): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  try {
    const data = await req.json() as unknown
    if (!isJsonObject(data)) {
      return { ok: false, response: validationError("请求体必须是有效 JSON 对象") }
    }

    return { ok: true, data }
  } catch {
    return { ok: false, response: validationError("请求体必须是有效 JSON 对象") }
  }
}

function toFocusPeriodInput(data: Record<string, unknown>): FocusPeriodInput {
  return {
    year: data.year as number,
    start_date: data.start_date as string,
    end_date: data.end_date as string,
    goal_id: data.goal_id as string,
    color: data.color as string,
  }
}

async function lockFocusPeriodYear(db: FocusPeriodDb, year: number) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${FOCUS_PERIOD_LOCK_NAMESPACE}, ${year})`
}

async function listExistingPeriods(db: FocusPeriodDb, year: number): Promise<ExistingFocusPeriod[]> {
  const periods = await db.focusPeriod.findMany({
    where: { year },
    select: { period_id: true, start_date: true, end_date: true },
  })

  return periods.map(period => ({
    period_id: period.period_id,
    start_date: normalizeDateInput(period.start_date),
    end_date: normalizeDateInput(period.end_date),
  }))
}

async function findGoal(db: FocusPeriodDb, goalId: string): Promise<FocusGoalSummary | null> {
  return db.goal.findUnique({
    where: { goal_id: goalId },
    select: { goal_id: true, name: true, tag: true },
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = parseYear(searchParams.get("year"))
  if (year === null) {
    return validationError("year must be an integer")
  }

  const [periods, total] = await Promise.all([
    prisma.focusPeriod.findMany({
      where: { year },
      orderBy: { start_date: "asc" },
    }),
    prisma.focusPeriod.count({ where: { year } }),
  ])
  const goalIds = [...new Set(periods.map(period => period.goal_id))]
  const goals = goalIds.length
    ? await prisma.goal.findMany({
        where: { goal_id: { in: goalIds } },
        select: { goal_id: true, name: true, tag: true },
      })
    : []
  const goalsById = mapGoalsById(goals)
  const list = periods.map(period => mapFocusPeriodRecord(period, goalsById.get(period.goal_id) ?? null))

  return NextResponse.json({ list, total })
}

export async function POST(req: NextRequest) {
  const body = await readJsonObject(req)
  if (!body.ok) {
    return body.response
  }

  const input = toFocusPeriodInput(body.data)
  const preliminaryValidation = validateWithoutExistingPeriods(input)
  if (!preliminaryValidation.ok) {
    return validationError(preliminaryValidation.message)
  }

  const result = await prisma.$transaction<RouteResult<ReturnType<typeof mapFocusPeriodRecord>>>(async tx => {
    await lockFocusPeriodYear(tx, input.year)

    const existingPeriods = await listExistingPeriods(tx, input.year)
    const validation = validateFocusPeriodInput(input, existingPeriods)
    if (!validation.ok) {
      return { type: "validation", message: validation.message }
    }

    const goal = await findGoal(tx, input.goal_id)
    if (!goal) {
      return { type: "validation", message: "目标不存在" }
    }

    const period = await tx.focusPeriod.create({
      data: {
        period_id: createPeriodId(),
        year: input.year,
        start_date: toDateOnly(input.start_date),
        end_date: toDateOnly(input.end_date),
        goal_id: input.goal_id,
        color: input.color,
      },
    })

    return { type: "success", data: mapFocusPeriodRecord(period, goal) }
  })

  if (result.type === "validation") {
    return validationError(result.message)
  }
  if (result.type === "not-found") {
    return notFoundError()
  }

  return NextResponse.json(result.data)
}

export async function PUT(req: NextRequest) {
  const body = await readJsonObject(req)
  if (!body.ok) {
    return body.response
  }

  const data = body.data
  const periodId = typeof data.period_id === "string" ? data.period_id : ""
  if (!periodId) {
    return validationError("period_id required")
  }

  const input = toFocusPeriodInput(data)
  const preliminaryValidation = validateWithoutExistingPeriods(input)
  if (!preliminaryValidation.ok) {
    return validationError(preliminaryValidation.message)
  }

  const result = await prisma.$transaction<RouteResult<ReturnType<typeof mapFocusPeriodRecord>>>(async tx => {
    const existingPeriodBeforeLock = await tx.focusPeriod.findUnique({
      where: { period_id: periodId },
      select: { period_id: true, year: true },
    })
    if (!existingPeriodBeforeLock) {
      return { type: "not-found" }
    }

    const lockYears = [...new Set([existingPeriodBeforeLock.year, input.year])].sort((a, b) => a - b)
    for (const lockYear of lockYears) {
      await lockFocusPeriodYear(tx, lockYear)
    }

    const existingPeriod = await tx.focusPeriod.findUnique({
      where: { period_id: periodId },
      select: { period_id: true },
    })
    if (!existingPeriod) {
      return { type: "not-found" }
    }

    const existingPeriods = await listExistingPeriods(tx, input.year)
    const validation = validateFocusPeriodInput(input, existingPeriods, periodId)
    if (!validation.ok) {
      return { type: "validation", message: validation.message }
    }

    const goal = await findGoal(tx, input.goal_id)
    if (!goal) {
      return { type: "validation", message: "目标不存在" }
    }

    const period = await tx.focusPeriod.update({
      where: { period_id: periodId },
      data: {
        year: input.year,
        start_date: toDateOnly(input.start_date),
        end_date: toDateOnly(input.end_date),
        goal_id: input.goal_id,
        color: input.color,
      },
    })

    return { type: "success", data: mapFocusPeriodRecord(period, goal) }
  })

  if (result.type === "not-found") {
    return notFoundError()
  }
  if (result.type === "validation") {
    return validationError(result.message)
  }

  return NextResponse.json(result.data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get("period_id")
  if (!periodId) {
    return validationError("period_id required")
  }

  const existingPeriod = await prisma.focusPeriod.findUnique({
    where: { period_id: periodId },
    select: { period_id: true },
  })
  if (!existingPeriod) {
    return notFoundError()
  }

  await prisma.focusPeriod.delete({
    where: { period_id: periodId },
  })

  return NextResponse.json({ success: true })
}
