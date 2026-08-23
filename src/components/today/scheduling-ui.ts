import { BLOCKING_STATUSES } from "@/lib/today/schedule-validation"
import {
  formatUtcInTimeZone,
  nextExistingLocalDateStartToUtc,
  zonedMinuteToUtc,
} from "@/lib/today/timezone"
import type { PlanningPreferenceView, ScheduleBlockView } from "@/lib/today/types"

export const SCHEDULE_SLOT_MINUTES = 15

export type LocalBlockRange = {
  start: number
  end: number
}

export type TimelineRect = {
  top: number
  height: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function roundMinuteToSlot(minutes: number, origin: number): number {
  return origin + Math.round((minutes - origin) / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES
}

function floorMinuteToSlot(minutes: number, origin: number): number {
  return origin + Math.floor((minutes - origin) / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES
}

function ceilMinuteToSlot(minutes: number, origin: number): number {
  return origin + Math.ceil((minutes - origin) / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES
}

function ceilToSlot(minutes: number): number {
  return Math.ceil(minutes / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES
}

export function durationForCandidate(
  estimatedMinutes: number | null,
  preference: PlanningPreferenceView,
): number {
  const available = preference.day_end_minutes - preference.day_start_minutes
  const largestWholeSlotDuration = Math.floor(available / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES
  const maximum = Math.max(SCHEDULE_SLOT_MINUTES, largestWholeSlotDuration)
  const requested = estimatedMinutes !== null && Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
    ? estimatedMinutes
    : preference.default_block_minutes
  return clamp(
    Math.max(SCHEDULE_SLOT_MINUTES, ceilToSlot(requested)),
    SCHEDULE_SLOT_MINUTES,
    maximum,
  )
}

export function minuteFromTimelinePoint(
  clientY: number,
  rect: TimelineRect,
  preference: PlanningPreferenceView,
  durationMinutes: number,
): number {
  const dayDuration = preference.day_end_minutes - preference.day_start_minutes
  const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0
  const unrounded = preference.day_start_minutes + clamp(ratio, 0, 1) * dayDuration
  const latestStart = floorMinuteToSlot(
    preference.day_end_minutes - durationMinutes,
    preference.day_start_minutes,
  )
  if (latestStart < preference.day_start_minutes) return preference.day_start_minutes
  return clamp(
    roundMinuteToSlot(unrounded, preference.day_start_minutes),
    preference.day_start_minutes,
    latestStart,
  )
}

function validDate(value: string, field: string): Date {
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${field} must be a valid ISO instant`)
  }
  return parsed
}

export function toLocalBlockRange(
  startAt: string,
  endAt: string,
  timezone: string,
  planningDate: string,
): LocalBlockRange {
  const start = validDate(startAt, "start_at")
  const end = validDate(endAt, "end_at")
  if (end.getTime() <= start.getTime()) {
    throw new Error("end_at must be later than start_at")
  }
  const localStart = formatUtcInTimeZone(start, timezone)
  const localEnd = formatUtcInTimeZone(end, timezone)
  if (localStart.date !== planningDate) {
    throw new Error("start_at is outside the planning date")
  }
  if (localEnd.date === planningDate) {
    return { start: localStart.minutes, end: localEnd.minutes }
  }
  if (end.getTime() === nextExistingLocalDateStartToUtc(planningDate, timezone).getTime()) {
    return { start: localStart.minutes, end: 1440 }
  }
  throw new Error("时间块不能跨本地日期")
}

export function findNextFreeStart(
  date: string,
  durationMinutes: number,
  preference: PlanningPreferenceView,
  blocks: readonly ScheduleBlockView[],
): number | null {
  const blocking = blocks
    .filter(block => BLOCKING_STATUSES.has(block.status))
    .flatMap(block => {
      try {
        return [toLocalBlockRange(block.start_at, block.end_at, preference.timezone, date)]
      } catch {
        return []
      }
    })

  for (
    let start = preference.day_start_minutes;
    start + durationMinutes <= preference.day_end_minutes;
    start += SCHEDULE_SLOT_MINUTES
  ) {
    const end = start + durationMinutes
    try {
      localTimeRangeToUtc(
        date,
        minuteToTimeInput(start),
        minuteToTimeInput(end),
        preference,
      )
    } catch {
      continue
    }
    const overlaps = blocking.some(block => start < block.end && end > block.start)
    if (!overlaps) return start
  }
  return null
}

export function findValidStartAtOrAfter(
  date: string,
  preferredStart: number,
  durationMinutes: number,
  preference: PlanningPreferenceView,
): number | null {
  const firstStart = Math.max(
    preference.day_start_minutes,
    ceilMinuteToSlot(preferredStart, preference.day_start_minutes),
  )
  for (
    let start = firstStart;
    start + durationMinutes <= preference.day_end_minutes;
    start += SCHEDULE_SLOT_MINUTES
  ) {
    try {
      localTimeRangeToUtc(
        date,
        minuteToTimeInput(start),
        minuteToTimeInput(start + durationMinutes),
        preference,
      )
      return start
    } catch {
      // Keep scanning: a wall-clock slot can be missing, ambiguous, or cross a DST offset change.
    }
  }
  return null
}

export function minuteToTimeInput(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}

export function parseTimeInput(value: string, field: string, allowEndOfDay = false): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error(`${field} 必须使用 HH:mm`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (allowEndOfDay && hours === 24 && minutes === 0) return 1440
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`${field} 不是有效时间`)
  }
  return hours * 60 + minutes
}

export function localTimeRangeToUtc(
  date: string,
  startValue: string,
  endValue: string,
  preference: PlanningPreferenceView,
): { start_at: string; end_at: string; startMinutes: number; endMinutes: number } {
  const startMinutes = parseTimeInput(startValue, "开始时间")
  const endMinutes = parseTimeInput(endValue, "结束时间", true)
  if (
    (startMinutes - preference.day_start_minutes) % SCHEDULE_SLOT_MINUTES !== 0
    || (endMinutes - preference.day_start_minutes) % SCHEDULE_SLOT_MINUTES !== 0
  ) {
    throw new Error("时间必须对齐 15 分钟刻度")
  }
  if (endMinutes <= startMinutes) throw new Error("结束时间必须晚于开始时间")
  if (startMinutes < preference.day_start_minutes || endMinutes > preference.day_end_minutes) {
    throw new Error("时间必须位于当天规划范围内")
  }
  const start = zonedMinuteToUtc(date, startMinutes, preference.timezone)
  const end = endMinutes === 1440
    ? nextExistingLocalDateStartToUtc(date, preference.timezone)
    : zonedMinuteToUtc(date, endMinutes, preference.timezone)
  const wallClockDurationMinutes = endMinutes - startMinutes
  const elapsedDurationMinutes = (end.getTime() - start.getTime()) / 60_000
  if (elapsedDurationMinutes !== wallClockDurationMinutes) {
    throw new Error("时间块跨夏令时转换，实际时长不一致")
  }
  return {
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    startMinutes,
    endMinutes,
  }
}
