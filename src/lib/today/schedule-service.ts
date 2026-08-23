import { createHash } from "node:crypto"

import { PrismaClient, type Prisma } from "@prisma/client"

import {
  getDefaultPlanningPreference,
  toPlanningPreferenceView,
  type PersistedPlanningPreferenceRow,
} from "./planning-preference"
import { assertSchedulableInterval, findOverlappingBlocks } from "./schedule-validation"
import {
  formatUtcInTimeZone,
  nextExistingLocalDateStartToUtc,
  zonedDateStartToUtc,
  zonedMinuteToUtc,
} from "./timezone"
import type {
  EnergyLevel,
  PlanningPreferenceView,
  ScheduleBlockSource,
  ScheduleBlockStatus,
  ScheduleBlockView,
} from "./types"

export type ScheduleErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "SCHEDULE_CONFLICT"
  | "ACTION_ALREADY_SCHEDULED"
  | "STALE_VERSION"

export class ScheduleServiceError extends Error {
  readonly code: ScheduleErrorCode
  readonly conflictIds?: string[]

  constructor(code: ScheduleErrorCode, message: string, conflictIds?: string[]) {
    super(message)
    this.name = "ScheduleServiceError"
    this.code = code
    this.conflictIds = conflictIds
  }
}

export type CreateScheduleBlockInput = {
  idempotency_key: string
  plan_id: string
  action_id?: string | null
  start_at: string
  end_at: string
  status?: "scheduled"
  source?: ScheduleBlockSource
}

export type UpdateScheduleBlockInput = {
  block_id: string
  expected_version: number
  start_at: string
  end_at: string
}

export type CancelScheduleBlockInput = {
  block_id: string
  expected_version: number
}

type CancelOptions = {
  now?: Date
}

type ScheduleDb = PrismaClient | Prisma.TransactionClient

type SchedulePlan = {
  plan_id: string
  name: string
  energy_level: string | null
  goal: { goal_id: string; name: string } | null
}

type ScheduleAction = {
  action_id: string
  plan_id: string
  name: string
  energy_level: string | null
  is_completed: boolean
}

type LockedActionRow = {
  action_id: string
  plan_id: string
  is_completed: boolean
}

type ScheduleBlockRow = {
  block_id: string
  plan_id: string
  action_id: string | null
  start_at: Date
  end_at: Date
  status: string
  source: string
  result_note: string | null
  create_fingerprint: string | null
  version: number
  plan: SchedulePlan
  action: ScheduleAction | null
}

type NormalizedCreate = {
  blockId: string
  planId: string
  actionId: string | null
  startAt: Date
  endAt: Date
  status: "scheduled"
  source: ScheduleBlockSource
  createFingerprint: string
}

type NormalizedUpdate = {
  blockId: string
  expectedVersion: number
  startAt: Date
  endAt: Date
}

type NormalizedCancel = {
  blockId: string
  expectedVersion: number
}

const DEFAULT_PREFERENCE_ID = "default"
const SCHEDULE_DATE_LOCK_NAMESPACE = 48_241
const SCHEDULE_KEY_LOCK_NAMESPACE = 48_243
const CREATE_FIELDS = new Set([
  "idempotency_key",
  "plan_id",
  "action_id",
  "start_at",
  "end_at",
  "status",
  "source",
])
const UPDATE_FIELDS = new Set(["block_id", "expected_version", "start_at", "end_at"])
const CANCEL_FIELDS = new Set(["block_id", "expected_version"])
const SOURCES = new Set<ScheduleBlockSource>(["manual", "ai_check", "ai_chat"])
const STATUSES = new Set<ScheduleBlockStatus>([
  "scheduled",
  "completed",
  "partial",
  "skipped",
  "cancelled",
])
const ENERGY_LEVELS = new Set<EnergyLevel>(["low", "medium", "high"])
const ISO_INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/
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

function assertOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  const unexpected = Object.keys(value).find(field => !allowed.has(field))
  if (unexpected) {
    validation(`unexpected field: ${unexpected}`)
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    validation(`${field} required`)
  }
  return value.trim()
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null
  }
  return requiredString(value, field)
}

function positiveVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    validation("expected_version must be a positive integer")
  }
  return value
}

function parseIsoInstant(value: unknown, field: string): Date {
  if (typeof value !== "string") {
    validation(`${field} must be a valid ISO instant`)
  }

  const match = ISO_INSTANT_PATTERN.exec(value)
  if (!match) {
    validation(`${field} must be a valid ISO instant`)
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", zone] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const millisecond = Number(fraction.padEnd(3, "0"))
  const utcLike = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond))
  const componentsMatch = utcLike.getUTCFullYear() === year
    && utcLike.getUTCMonth() === month - 1
    && utcLike.getUTCDate() === day
    && utcLike.getUTCHours() === hour
    && utcLike.getUTCMinutes() === minute
    && utcLike.getUTCSeconds() === second
  const offsetMatch = zone === "Z" ? null : /^([+-])(\d{2}):(\d{2})$/.exec(zone)
  const offsetIsValid = zone === "Z"
    || (offsetMatch !== null && Number(offsetMatch[2]) <= 23 && Number(offsetMatch[3]) <= 59)
  const parsed = new Date(value)

  if (!componentsMatch || !offsetIsValid || !Number.isFinite(parsed.getTime())) {
    validation(`${field} must be a valid ISO instant`)
  }
  return parsed
}

function normalizeCreateInput(input: CreateScheduleBlockInput): NormalizedCreate {
  if (!isPlainObject(input)) {
    validation("schedule block input must be a plain object")
  }
  assertOnlyFields(input, CREATE_FIELDS)

  const idempotencyKey = requiredString(input.idempotency_key, "idempotency_key")
  if (idempotencyKey.length > 128) {
    validation("idempotency_key must contain 1 to 128 characters")
  }
  const status = input.status ?? "scheduled"
  if (status !== "scheduled") {
    validation("status must be scheduled")
  }
  const source = input.source ?? "manual"
  if (!SOURCES.has(source)) {
    validation("source must be manual, ai_check, or ai_chat")
  }

  const planId = requiredString(input.plan_id, "plan_id")
  const actionId = optionalId(input.action_id, "action_id")
  const startAt = parseIsoInstant(input.start_at, "start_at")
  const endAt = parseIsoInstant(input.end_at, "end_at")
  const canonicalPayload = JSON.stringify({
    plan_id: planId,
    action_id: actionId,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    status,
    source,
  })

  return {
    blockId: `block_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 10)}`,
    planId,
    actionId,
    startAt,
    endAt,
    status,
    source,
    createFingerprint: createHash("sha256").update(canonicalPayload).digest("hex"),
  }
}

function normalizeUpdateInput(input: UpdateScheduleBlockInput): NormalizedUpdate {
  if (!isPlainObject(input)) {
    validation("schedule block update must be a plain object")
  }
  assertOnlyFields(input, UPDATE_FIELDS)
  return {
    blockId: requiredString(input.block_id, "block_id"),
    expectedVersion: positiveVersion(input.expected_version),
    startAt: parseIsoInstant(input.start_at, "start_at"),
    endAt: parseIsoInstant(input.end_at, "end_at"),
  }
}

function normalizeCancelInput(input: CancelScheduleBlockInput): NormalizedCancel {
  if (!isPlainObject(input)) {
    validation("schedule block cancellation must be a plain object")
  }
  assertOnlyFields(input, CANCEL_FIELDS)
  return {
    blockId: requiredString(input.block_id, "block_id"),
    expectedVersion: positiveVersion(input.expected_version),
  }
}

function isPrismaClient(db: ScheduleDb): db is PrismaClient {
  return "$transaction" in db && typeof db.$transaction === "function"
}

async function inTransaction<T>(db: ScheduleDb, callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (isPrismaClient(db)) {
    return db.$transaction(callback)
  }
  return callback(db)
}

async function lockValue(db: Prisma.TransactionClient, namespace: number, value: string): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${namespace}::int, hashtext(${value})::int)`
}

async function lockLocalDates(db: Prisma.TransactionClient, dates: readonly string[]): Promise<void> {
  const sortedDates = [...new Set(dates)].sort()
  for (const date of sortedDates) {
    await lockValue(db, SCHEDULE_DATE_LOCK_NAMESPACE, date)
  }
}

async function lockActionItem(
  db: Prisma.TransactionClient,
  actionId: string,
): Promise<LockedActionRow | null> {
  const rows = await db.$queryRaw<LockedActionRow[]>`SELECT "action_id", "plan_id", "is_completed" FROM "ActionItem" WHERE "action_id" = ${actionId} FOR UPDATE`
  return rows[0] ?? null
}

async function loadPreference(db: Prisma.TransactionClient): Promise<PlanningPreferenceView> {
  const row = await db.planningPreference.findUnique({
    where: { preference_id: DEFAULT_PREFERENCE_ID },
  }) as PersistedPlanningPreferenceRow | null
  return row ? toPlanningPreferenceView(row) : getDefaultPlanningPreference()
}

function localDateAndAssertBounds(
  startAt: Date,
  endAt: Date,
  preference: PlanningPreferenceView,
): string {
  try {
    assertSchedulableInterval({ start_at: startAt, end_at: endAt, timezone: preference.timezone })
  } catch (error) {
    validation(error instanceof Error ? error.message : "invalid schedule interval")
  }

  const localStart = formatUtcInTimeZone(startAt, preference.timezone)
  let planningStart: Date
  let planningEnd: Date
  try {
    planningStart = preference.day_start_minutes === 0
      ? zonedDateStartToUtc(localStart.date, preference.timezone)
      : zonedMinuteToUtc(localStart.date, preference.day_start_minutes, preference.timezone)
    planningEnd = preference.day_end_minutes === 1440
      ? nextExistingLocalDateStartToUtc(localStart.date, preference.timezone)
      : zonedMinuteToUtc(localStart.date, preference.day_end_minutes, preference.timezone)
  } catch (error) {
    validation(error instanceof Error ? error.message : "invalid planning day boundary")
  }

  if (startAt.getTime() < planningStart.getTime() || endAt.getTime() > planningEnd.getTime()) {
    validation("时间块必须位于已配置的计划日范围内")
  }
  return localStart.date
}

function energy(value: string | null): EnergyLevel | null {
  return value !== null && ENERGY_LEVELS.has(value as EnergyLevel) ? value as EnergyLevel : null
}

export function toScheduleBlockView(row: ScheduleBlockRow): ScheduleBlockView {
  if (!STATUSES.has(row.status as ScheduleBlockStatus)) {
    validation("stored schedule block status is invalid")
  }
  if (!SOURCES.has(row.source as ScheduleBlockSource)) {
    validation("stored schedule block source is invalid")
  }

  return {
    block_id: row.block_id,
    plan_id: row.plan_id,
    action_id: row.action_id,
    title: row.action?.name ?? row.plan.name,
    goal_id: row.plan.goal?.goal_id ?? null,
    goal_name: row.plan.goal?.name ?? null,
    energy_level: energy(row.action?.energy_level ?? row.plan.energy_level),
    start_at: row.start_at.toISOString(),
    end_at: row.end_at.toISOString(),
    status: row.status as ScheduleBlockStatus,
    source: row.source as ScheduleBlockSource,
    result_note: row.result_note,
    version: row.version,
  }
}

function legacyCreateFieldsMatch(row: ScheduleBlockRow, input: NormalizedCreate): boolean {
  return row.plan_id === input.planId
    && row.action_id === input.actionId
    && row.start_at.getTime() === input.startAt.getTime()
    && row.end_at.getTime() === input.endAt.getTime()
    && row.status === input.status
    && row.source === input.source
}

function idempotencyConflict(blockId: string): ScheduleServiceError {
  return new ScheduleServiceError(
    "SCHEDULE_CONFLICT",
    "幂等键已用于不同的时间块内容",
    [blockId],
  )
}

async function resolveExistingCreate(
  db: Prisma.TransactionClient,
  row: ScheduleBlockRow,
  input: NormalizedCreate,
): Promise<ScheduleBlockView> {
  if (row.create_fingerprint !== null) {
    if (row.create_fingerprint !== input.createFingerprint) {
      throw idempotencyConflict(input.blockId)
    }
    return toScheduleBlockView(row)
  }

  if (!legacyCreateFieldsMatch(row, input)) {
    throw idempotencyConflict(input.blockId)
  }

  // Legacy rows did not persist the original create payload. Backfill only when
  // every current create field still matches, so a moved legacy row cannot be
  // mistaken for an identical retry.
  const backfilled = await db.scheduleBlock.updateMany({
    where: {
      block_id: input.blockId,
      create_fingerprint: null,
      plan_id: input.planId,
      action_id: input.actionId,
      start_at: input.startAt,
      end_at: input.endAt,
      status: input.status,
      source: input.source,
    },
    data: { create_fingerprint: input.createFingerprint },
  })
  if (backfilled.count === 1) {
    return toScheduleBlockView(row)
  }

  const current = await findBlock(db, input.blockId)
  if (current?.create_fingerprint === input.createFingerprint) {
    return toScheduleBlockView(current)
  }
  throw idempotencyConflict(input.blockId)
}

async function findBlock(db: Prisma.TransactionClient, blockId: string): Promise<ScheduleBlockRow | null> {
  return db.scheduleBlock.findUnique({
    where: { block_id: blockId },
    include: SCHEDULE_RELATIONS,
  }) as Promise<ScheduleBlockRow | null>
}

async function assertPlanAndAction(
  db: Prisma.TransactionClient,
  planId: string,
  actionId: string | null,
): Promise<void> {
  const planRow = await db.plan.findUnique({
    where: { plan_id: planId },
    select: { plan_id: true },
  })
  if (!planRow) {
    throw new ScheduleServiceError("NOT_FOUND", "计划不存在")
  }
  if (actionId === null) {
    return
  }

  const actionRow = await lockActionItem(db, actionId)
  if (!actionRow) {
    throw new ScheduleServiceError("NOT_FOUND", "行动项不存在")
  }
  if (actionRow.plan_id !== planId) {
    validation("行动项不属于指定计划")
  }
  if (actionRow.is_completed) {
    validation("已完成行动项不能排期")
  }

  const active = await db.scheduleBlock.findFirst({
    where: { action_id: actionId, status: "scheduled" },
    select: { block_id: true },
  })
  if (active) {
    throw new ScheduleServiceError(
      "ACTION_ALREADY_SCHEDULED",
      "行动项已有活动排期",
      [active.block_id],
    )
  }
}

async function findConflicts(
  db: Prisma.TransactionClient,
  startAt: Date,
  endAt: Date,
  ignoredBlockId?: string,
): Promise<string[]> {
  const rows = await db.scheduleBlock.findMany({
    where: {
      status: { in: ["scheduled", "completed", "partial"] },
      start_at: { lt: endAt },
      end_at: { gt: startAt },
      ...(ignoredBlockId ? { block_id: { not: ignoredBlockId } } : {}),
    },
    select: { block_id: true, start_at: true, end_at: true, status: true },
    orderBy: { block_id: "asc" },
  }) as Array<{ block_id: string; start_at: Date; end_at: Date; status: ScheduleBlockStatus }>

  return findOverlappingBlocks(startAt, endAt, rows, ignoredBlockId).map(row => row.block_id)
}

function throwIfConflicts(conflictIds: string[]): void {
  if (conflictIds.length > 0) {
    throw new ScheduleServiceError("SCHEDULE_CONFLICT", "时间段与既有时间块冲突", conflictIds)
  }
}

function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === code
}

export async function createScheduleBlock(
  db: ScheduleDb,
  rawInput: CreateScheduleBlockInput,
): Promise<ScheduleBlockView> {
  const input = normalizeCreateInput(rawInput)

  try {
    return await inTransaction(db, async tx => {
      await lockValue(tx, SCHEDULE_KEY_LOCK_NAMESPACE, input.blockId)
      const existing = await findBlock(tx, input.blockId)
      if (existing) {
        return resolveExistingCreate(tx, existing, input)
      }

      const preference = await loadPreference(tx)
      const localDate = localDateAndAssertBounds(input.startAt, input.endAt, preference)
      await lockLocalDates(tx, [localDate])
      await assertPlanAndAction(tx, input.planId, input.actionId)
      throwIfConflicts(await findConflicts(tx, input.startAt, input.endAt))

      const created = await tx.scheduleBlock.create({
        data: {
          block_id: input.blockId,
          plan_id: input.planId,
          action_id: input.actionId,
          start_at: input.startAt,
          end_at: input.endAt,
          status: input.status,
          source: input.source,
          create_fingerprint: input.createFingerprint,
        },
        include: SCHEDULE_RELATIONS,
      }) as ScheduleBlockRow
      return toScheduleBlockView(created)
    })
  } catch (error) {
    if (error instanceof ScheduleServiceError) throw error
    if (isPrismaError(error, "P2003")) {
      throw new ScheduleServiceError("NOT_FOUND", "计划或行动项不存在")
    }
    if (isPrismaError(error, "P2002")) {
      throw new ScheduleServiceError("SCHEDULE_CONFLICT", "时间块幂等键冲突", [input.blockId])
    }
    throw error
  }
}

export async function updateScheduleBlock(
  db: ScheduleDb,
  rawInput: UpdateScheduleBlockInput,
): Promise<ScheduleBlockView> {
  const input = normalizeUpdateInput(rawInput)

  return inTransaction(db, async tx => {
    const preference = await loadPreference(tx)
    const newLocalDate = localDateAndAssertBounds(input.startAt, input.endAt, preference)
    const snapshot = await findBlock(tx, input.blockId)
    if (!snapshot) {
      throw new ScheduleServiceError("NOT_FOUND", "时间块不存在")
    }
    const oldLocalDate = formatUtcInTimeZone(snapshot.start_at, preference.timezone).date
    await lockLocalDates(tx, [oldLocalDate, newLocalDate])
    if (snapshot.action_id) {
      const lockedAction = await lockActionItem(tx, snapshot.action_id)
      if (!lockedAction) {
        throw new ScheduleServiceError("NOT_FOUND", "行动项不存在")
      }
      if (lockedAction.plan_id !== snapshot.plan_id) {
        validation("行动项不属于时间块计划")
      }
      if (lockedAction.is_completed) {
        validation("已完成行动项不能排期")
      }
    }

    const current = await findBlock(tx, input.blockId)
    if (!current) {
      throw new ScheduleServiceError("NOT_FOUND", "时间块不存在")
    }
    if (current.version !== input.expectedVersion || current.status !== "scheduled") {
      throw new ScheduleServiceError("STALE_VERSION", "时间块版本或状态已变化")
    }
    if (current.plan_id !== snapshot.plan_id || current.action_id !== snapshot.action_id) {
      throw new ScheduleServiceError("STALE_VERSION", "时间块归属已变化")
    }

    throwIfConflicts(await findConflicts(tx, input.startAt, input.endAt, input.blockId))
    const updated = await tx.scheduleBlock.updateMany({
      where: {
        block_id: input.blockId,
        version: input.expectedVersion,
        status: "scheduled",
      },
      data: {
        start_at: input.startAt,
        end_at: input.endAt,
        version: { increment: 1 },
      },
    })
    if (updated.count !== 1) {
      throw new ScheduleServiceError("STALE_VERSION", "时间块版本或状态已变化")
    }

    const row = await findBlock(tx, input.blockId)
    if (!row) {
      throw new ScheduleServiceError("NOT_FOUND", "时间块不存在")
    }
    return toScheduleBlockView(row)
  })
}

export async function cancelScheduleBlock(
  db: ScheduleDb,
  rawInput: CancelScheduleBlockInput,
  options: CancelOptions = {},
): Promise<ScheduleBlockView> {
  const input = normalizeCancelInput(rawInput)
  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime())) {
    validation("now must be a valid date")
  }

  return inTransaction(db, async tx => {
    const preference = await loadPreference(tx)
    const snapshot = await findBlock(tx, input.blockId)
    if (!snapshot) {
      throw new ScheduleServiceError("NOT_FOUND", "时间块不存在")
    }
    const localDate = formatUtcInTimeZone(snapshot.start_at, preference.timezone).date
    await lockLocalDates(tx, [localDate])

    const current = await findBlock(tx, input.blockId)
    if (!current) {
      throw new ScheduleServiceError("NOT_FOUND", "时间块不存在")
    }
    if (current.version !== input.expectedVersion || current.status !== "scheduled") {
      throw new ScheduleServiceError("STALE_VERSION", "时间块版本或状态已变化")
    }
    if (current.start_at.getTime() <= now.getTime()) {
      throw new ScheduleServiceError(
        "SCHEDULE_CONFLICT",
        "已开始的时间块不能取消，请完成、部分完成或跳过",
        [current.block_id],
      )
    }

    const updated = await tx.scheduleBlock.updateMany({
      where: {
        block_id: input.blockId,
        version: input.expectedVersion,
        status: "scheduled",
      },
      data: { status: "cancelled", version: { increment: 1 } },
    })
    if (updated.count !== 1) {
      throw new ScheduleServiceError("STALE_VERSION", "时间块版本或状态已变化")
    }

    const row = await findBlock(tx, input.blockId)
    if (!row) {
      throw new ScheduleServiceError("NOT_FOUND", "时间块不存在")
    }
    return toScheduleBlockView(row)
  })
}
