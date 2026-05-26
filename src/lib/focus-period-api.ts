import { randomUUID } from "crypto"
import {
  type DateRange,
  type FocusGoalSummary,
  type FocusPeriodView,
  hasDateRangeOverlap,
  normalizeDateInput,
  parseDateOnly,
} from "@/lib/focus-period-utils"

export interface FocusPeriodInput extends DateRange {
  year: number
  goal_id: string
  color: string
}

export interface ExistingFocusPeriod extends DateRange {
  period_id: string
}

export type ValidationResult = { ok: true } | { ok: false; message: string }

export function createPeriodId(): string {
  return `focus_${randomUUID().replace(/-/g, "").substring(0, 10)}`
}

export function toDateOnly(value: string): Date {
  return parseDateOnly(value)
}

export function validateFocusPeriodInput(
  input: FocusPeriodInput,
  existingPeriods: ExistingFocusPeriod[],
  ignorePeriodId?: string,
): ValidationResult {
  if (!Number.isInteger(input.year)) {
    return { ok: false, message: "年份必须是整数" }
  }
  if (!input.goal_id) {
    return { ok: false, message: "必须选择一个目标" }
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) {
    return { ok: false, message: "颜色必须是十六进制色值" }
  }

  const parsedRange = parseFocusPeriodDateRange(input)
  if (!parsedRange) {
    return { ok: false, message: "日期格式无效" }
  }

  if (!input.start_date.startsWith(`${input.year}-`) || !input.end_date.startsWith(`${input.year}-`)) {
    return { ok: false, message: "开始日期和结束日期必须属于同一年" }
  }
  if (parsedRange.startDate.getTime() > parsedRange.endDate.getTime()) {
    return { ok: false, message: "开始日期不能晚于结束日期" }
  }
  if (hasDateRangeOverlap(input, existingPeriods, ignorePeriodId)) {
    return { ok: false, message: "同一年内的专注阶段不能重叠" }
  }

  return { ok: true }
}

function parseFocusPeriodDateRange(input: FocusPeriodInput): { startDate: Date; endDate: Date } | null {
  if (typeof input.start_date !== "string" || typeof input.end_date !== "string") {
    return null
  }

  try {
    return {
      startDate: parseDateOnly(input.start_date),
      endDate: parseDateOnly(input.end_date),
    }
  } catch {
    return null
  }
}

export function mapFocusPeriodRecord(
  period: {
    period_id: string
    year: number
    start_date: Date
    end_date: Date
    goal_id: string
    color: string
  },
  goal: FocusGoalSummary | null,
): FocusPeriodView {
  return {
    period_id: period.period_id,
    year: period.year,
    start_date: normalizeDateInput(period.start_date),
    end_date: normalizeDateInput(period.end_date),
    goal_id: period.goal_id,
    color: period.color,
    goal,
  }
}
