import { PrismaClient } from "@prisma/client"
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

async function listExistingPeriods(year: number): Promise<ExistingFocusPeriod[]> {
  const periods = await prisma.focusPeriod.findMany({
    where: { year },
    select: { period_id: true, start_date: true, end_date: true },
  })

  return periods.map(period => ({
    period_id: period.period_id,
    start_date: normalizeDateInput(period.start_date),
    end_date: normalizeDateInput(period.end_date),
  }))
}

async function findGoal(goalId: string): Promise<FocusGoalSummary | null> {
  return prisma.goal.findUnique({
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
  const input = await req.json() as FocusPeriodInput
  const preliminaryValidation = validateWithoutExistingPeriods(input)
  if (!preliminaryValidation.ok) {
    return validationError(preliminaryValidation.message)
  }

  const existingPeriods = await listExistingPeriods(input.year)
  const validation = validateFocusPeriodInput(input, existingPeriods)
  if (!validation.ok) {
    return validationError(validation.message)
  }

  const goal = await findGoal(input.goal_id)
  if (!goal) {
    return validationError("目标不存在")
  }

  const period = await prisma.focusPeriod.create({
    data: {
      period_id: createPeriodId(),
      year: input.year,
      start_date: toDateOnly(input.start_date),
      end_date: toDateOnly(input.end_date),
      goal_id: input.goal_id,
      color: input.color,
    },
  })

  return NextResponse.json(mapFocusPeriodRecord(period, goal))
}

export async function PUT(req: NextRequest) {
  const data = await req.json() as FocusPeriodInput & { period_id?: string }
  if (!data.period_id) {
    return validationError("period_id required")
  }

  const input: FocusPeriodInput = {
    year: data.year,
    start_date: data.start_date,
    end_date: data.end_date,
    goal_id: data.goal_id,
    color: data.color,
  }
  const preliminaryValidation = validateWithoutExistingPeriods(input)
  if (!preliminaryValidation.ok) {
    return validationError(preliminaryValidation.message)
  }

  const existingPeriod = await prisma.focusPeriod.findUnique({
    where: { period_id: data.period_id },
    select: { period_id: true },
  })
  if (!existingPeriod) {
    return notFoundError()
  }

  const existingPeriods = await listExistingPeriods(input.year)
  const validation = validateFocusPeriodInput(input, existingPeriods, data.period_id)
  if (!validation.ok) {
    return validationError(validation.message)
  }

  const goal = await findGoal(input.goal_id)
  if (!goal) {
    return validationError("目标不存在")
  }

  const period = await prisma.focusPeriod.update({
    where: { period_id: data.period_id },
    data: {
      year: input.year,
      start_date: toDateOnly(input.start_date),
      end_date: toDateOnly(input.end_date),
      goal_id: input.goal_id,
      color: input.color,
    },
  })

  return NextResponse.json(mapFocusPeriodRecord(period, goal))
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
