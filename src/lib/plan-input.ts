import { parseOptionalSlotMinutes } from "@/lib/today/validation"

export type PlanTimingContext =
  | { mode: "create" }
  | { mode: "update"; currentIsRecurring: boolean }

export type NormalizedPlanTiming = {
  is_recurring?: boolean
  estimated_minutes?: number | null
  default_block_minutes?: number | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key)
}

function parsePlanMinutes(value: unknown, field: string, label: string): number | null {
  try {
    return parseOptionalSlotMinutes(value, field)
  } catch (error) {
    if (!(error instanceof Error)) throw error
    if (error.message.endsWith("must use 15-minute increments")) {
      throw new Error(`${label}必须使用 15 分钟粒度`)
    }
    if (error.message.endsWith("must be a positive PostgreSQL Int or null")) {
      throw new Error(`${label}必须在 PostgreSQL Int 正整数范围内，或设为空`)
    }
    throw new Error(`${label}必须是正整数或空值`)
  }
}

export function normalizePlanTiming(
  input: unknown,
  context: PlanTimingContext,
): NormalizedPlanTiming {
  if (!isPlainObject(input)) {
    throw new Error("计划输入必须是普通对象")
  }

  const hasRecurring = hasOwn(input, "is_recurring")
  if (hasRecurring && typeof input.is_recurring !== "boolean") {
    throw new Error("is_recurring 必须是布尔值")
  }

  const currentIsRecurring = context.mode === "update" && context.currentIsRecurring
  const isRecurring = hasRecurring
    ? input.is_recurring as boolean
    : context.mode === "create"
      ? false
      : currentIsRecurring
  const result: NormalizedPlanTiming = {}

  if (context.mode === "create" || hasRecurring) {
    result.is_recurring = isRecurring
  }

  if (hasOwn(input, "default_block_minutes")) {
    result.default_block_minutes = parsePlanMinutes(
      input.default_block_minutes,
      "default_block_minutes",
      "默认时间块时长",
    )
  }

  const hasEstimated = hasOwn(input, "estimated_minutes")
  const estimatedMinutes = hasEstimated
    ? parsePlanMinutes(input.estimated_minutes, "estimated_minutes", "总预计投入")
    : undefined

  if (isRecurring) {
    if (estimatedMinutes !== undefined && estimatedMinutes !== null) {
      throw new Error("周期计划不能设置总预计投入")
    }

    if (hasEstimated || (context.mode === "update" && hasRecurring && !currentIsRecurring)) {
      result.estimated_minutes = null
    }
    return result
  }

  if (context.mode === "create") {
    result.estimated_minutes = estimatedMinutes ?? 60
    return result
  }

  if (hasEstimated) {
    if (estimatedMinutes === null) {
      throw new Error("非周期计划必须设置总预计投入")
    }
    result.estimated_minutes = estimatedMinutes
  } else if (hasRecurring && currentIsRecurring) {
    result.estimated_minutes = 60
  }

  return result
}
