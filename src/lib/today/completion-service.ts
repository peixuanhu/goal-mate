import { type Prisma, type PrismaClient } from "@prisma/client"

import {
  getDefaultPlanningPreference,
  toPlanningPreferenceView,
  type PersistedPlanningPreferenceRow,
} from "./planning-preference"
import {
  parseScheduleTerminalVersion,
  ScheduleServiceError,
} from "./schedule-service"
import { lockScheduleLocalDates } from "./schedule-lock"
import { SCHEDULE_BLOCK_RELATIONS, toScheduleBlockView } from "./schedule-block-view"
import { formatUtcInTimeZone } from "./timezone"
import type { ScheduleBlockView } from "./types"

export type CompleteScheduleBlockInput = {
  block_id: string
  expected_version: number
  outcome: "completed" | "partial" | "skipped"
  content?: string
  thinking?: string
  result_note?: string
  plan_progress?: number
}

type NormalizedCompletionInput = {
  blockId: string
  expectedVersion: number
  outcome: "completed" | "partial" | "skipped"
  content: string | null
  thinking: string | null
  resultNote: string | null
  planProgress: number | undefined
}

type CompletionSnapshot = {
  block_id: string
  plan_id: string
  action_id: string | null
  start_at: Date
}

type LockedPlanRow = {
  plan_id: string
  is_recurring: boolean
}

type LockedActionRow = {
  action_id: string
  plan_id: string
  is_completed: boolean
}

const COMPLETION_FIELDS = new Set([
  "block_id",
  "expected_version",
  "outcome",
  "content",
  "thinking",
  "result_note",
  "plan_progress",
])

function validation(message: string): never {
  throw new ScheduleServiceError("VALIDATION", message)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    validation(`${field} required`)
  }
  return value.trim()
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined) return null
  if (typeof value !== "string") {
    validation(`${field} must be a string`)
  }
  return value
}

function normalizeInput(value: CompleteScheduleBlockInput): NormalizedCompletionInput {
  if (!isPlainObject(value)) {
    validation("schedule block completion must be a plain object")
  }
  const unexpected = Object.keys(value).find(field => !COMPLETION_FIELDS.has(field))
  if (unexpected) {
    validation(`unexpected field: ${unexpected}`)
  }

  const expectedVersion = parseScheduleTerminalVersion(value.expected_version)
  const outcome = value.outcome
  if (outcome !== "completed" && outcome !== "partial" && outcome !== "skipped") {
    validation("outcome must be completed, partial, or skipped")
  }
  const planProgress = value.plan_progress
  if (planProgress !== undefined && (
    typeof planProgress !== "number"
    || !Number.isFinite(planProgress)
    || planProgress < 0
    || planProgress > 1
  )) {
    validation("plan_progress must be a finite number between 0 and 1")
  }

  return {
    blockId: requiredString(value.block_id, "block_id"),
    expectedVersion,
    outcome,
    content: optionalText(value.content, "content"),
    thinking: optionalText(value.thinking, "thinking"),
    resultNote: optionalText(value.result_note, "result_note"),
    planProgress,
  }
}

function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === code
}

function prismaErrorTargets(error: unknown): string[] {
  if (typeof error !== "object" || error === null || !("meta" in error)) {
    return []
  }
  const target = (error as { meta?: { target?: unknown } }).meta?.target
  if (typeof target === "string") return [target]
  return Array.isArray(target)
    ? target.filter((value): value is string => typeof value === "string")
    : []
}

function isProgressScheduleBlockUniqueError(error: unknown): boolean {
  return isPrismaError(error, "P2002")
    && prismaErrorTargets(error).some(target => target.includes("schedule_block_id"))
}

async function loadTimezone(tx: Prisma.TransactionClient): Promise<string> {
  const row = await tx.planningPreference.findUnique({
    where: { preference_id: "default" },
  }) as PersistedPlanningPreferenceRow | null
  return row ? toPlanningPreferenceView(row).timezone : getDefaultPlanningPreference().timezone
}

async function lockPlan(tx: Prisma.TransactionClient, planId: string): Promise<LockedPlanRow | null> {
  const rows = await tx.$queryRaw<LockedPlanRow[]>`SELECT "plan_id", "is_recurring" FROM "Plan" WHERE "plan_id" = ${planId} FOR UPDATE`
  return rows[0] ?? null
}

async function lockAction(tx: Prisma.TransactionClient, actionId: string): Promise<LockedActionRow | null> {
  const rows = await tx.$queryRaw<LockedActionRow[]>`SELECT "action_id", "plan_id", "is_completed" FROM "ActionItem" WHERE "action_id" = ${actionId} FOR UPDATE`
  return rows[0] ?? null
}

export async function completeScheduleBlock(
  db: PrismaClient,
  rawInput: CompleteScheduleBlockInput,
): Promise<ScheduleBlockView> {
  const input = normalizeInput(rawInput)

  try {
    return await db.$transaction(async tx => {
      const snapshot = await tx.scheduleBlock.findUnique({
        where: { block_id: input.blockId },
        select: {
          block_id: true,
          plan_id: true,
          action_id: true,
          start_at: true,
        },
      }) as CompletionSnapshot | null
      if (!snapshot) {
        throw new ScheduleServiceError("NOT_FOUND", "时间块不存在")
      }

      const timezone = await loadTimezone(tx)
      const localDate = formatUtcInTimeZone(snapshot.start_at, timezone).date
      await lockScheduleLocalDates(tx, [localDate])

      const plan = await lockPlan(tx, snapshot.plan_id)
      if (!plan) {
        throw new ScheduleServiceError("NOT_FOUND", "计划不存在")
      }
      if (input.planProgress !== undefined && plan.is_recurring) {
        validation("周期性计划不能设置 plan_progress")
      }

      const updated = await tx.scheduleBlock.updateMany({
        where: {
          block_id: input.blockId,
          plan_id: snapshot.plan_id,
          action_id: snapshot.action_id,
          version: input.expectedVersion,
          status: "scheduled",
        },
        data: {
          status: input.outcome,
          result_note: input.resultNote,
          version: { increment: 1 },
        },
      })
      if (updated.count !== 1) {
        throw new ScheduleServiceError("STALE_VERSION", "时间块版本、状态或归属已变化")
      }

      let action: LockedActionRow | null = null
      if (snapshot.action_id !== null && input.outcome === "completed") {
        action = await lockAction(tx, snapshot.action_id)
        if (!action) {
          throw new ScheduleServiceError("NOT_FOUND", "行动项不存在")
        }
        if (action.plan_id !== snapshot.plan_id) {
          throw new ScheduleServiceError("STALE_VERSION", "行动项归属已变化")
        }
      }

      if (input.outcome !== "skipped") {
        await tx.progressRecord.create({
          data: {
            plan_id: snapshot.plan_id,
            schedule_block_id: input.blockId,
            content: input.content,
            thinking: input.thinking,
            outcome: input.outcome,
            counts_toward_recurrence: input.outcome === "completed",
          },
        })
      }

      if (action && !action.is_completed) {
        await tx.actionItem.update({
          where: { action_id: action.action_id },
          data: { is_completed: true, completed_at: new Date() },
        })
      }

      if (input.planProgress !== undefined) {
        await tx.plan.update({
          where: { plan_id: snapshot.plan_id },
          data: { progress: input.planProgress },
        })
      }

      const row = await tx.scheduleBlock.findUnique({
        where: { block_id: input.blockId },
        include: SCHEDULE_BLOCK_RELATIONS,
      })
      if (!row) {
        throw new ScheduleServiceError("NOT_FOUND", "时间块不存在")
      }
      return toScheduleBlockView(row)
    })
  } catch (error) {
    if (error instanceof ScheduleServiceError) throw error
    if (isPrismaError(error, "P2034")) {
      throw new ScheduleServiceError("SCHEDULE_CONFLICT", "完成操作发生并发冲突，请重试")
    }
    if (isProgressScheduleBlockUniqueError(error)) {
      throw new ScheduleServiceError("STALE_VERSION", "时间块已完成或进展记录已存在")
    }
    if (isPrismaError(error, "P2003")) {
      throw new ScheduleServiceError("NOT_FOUND", "时间块、计划或行动项不存在")
    }
    throw error
  }
}
