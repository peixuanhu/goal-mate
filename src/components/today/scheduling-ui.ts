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

export type TimelineRange = { start: number; end: number }
export type TimelinePlacementMode = "create" | "move" | "resize-start" | "resize-end"
export type TimelineGridMarker = { minutes: number; emphasis: "hour" | "half" | "quarter" }

export function buildTimelineGrid(preference: PlanningPreferenceView): TimelineGridMarker[] {
  const markers: TimelineGridMarker[] = []
  for (let minutes = preference.day_start_minutes; minutes <= preference.day_end_minutes; minutes += SCHEDULE_SLOT_MINUTES) {
    const offset = minutes - preference.day_start_minutes
    markers.push({ minutes, emphasis: offset % 60 === 0 ? "hour" : offset % 30 === 0 ? "half" : "quarter" })
  }
  const last = markers[markers.length - 1]
  if (!last || last.minutes !== preference.day_end_minutes) {
    const offset = preference.day_end_minutes - preference.day_start_minutes
    markers.push({ minutes: preference.day_end_minutes, emphasis: offset % 60 === 0 ? "hour" : offset % 30 === 0 ? "half" : "quarter" })
  }
  return markers
}

export function placeTimelineRange(
  mode: TimelinePlacementMode,
  snappedMinute: number,
  original: TimelineRange,
  preference: PlanningPreferenceView,
): TimelineRange {
  const start = preference.day_start_minutes
  const end = preference.day_end_minutes
  const snap = clamp(roundMinuteToSlot(snappedMinute, start), start, end)
  if (mode === "resize-start") return { start: clamp(Math.min(snap, original.end - SCHEDULE_SLOT_MINUTES), start, end), end: original.end }
  if (mode === "resize-end") {
    const lastCompleteSlot = floorMinuteToSlot(end, start)
    return { start: original.start, end: clamp(Math.max(snap, original.start + SCHEDULE_SLOT_MINUTES), start, lastCompleteSlot) }
  }
  const duration = original.end - original.start
  if (duration > end - start) return { start: snap, end: snap + duration }
  const latest = floorMinuteToSlot(end - duration, start)
  const placedStart = clamp(snap, start, latest)
  return { start: placedStart, end: placedStart + duration }
}

export type TimelinePlacementErrorCode = "out-of-bounds" | "too-short" | "conflict" | "budget" | "invalid-local-time"
export type TimelinePlacementResult =
  | { ok: true; range: TimelineRange; interval: { start_at: string; end_at: string; startMinutes: number; endMinutes: number } }
  | { ok: false; code: TimelinePlacementErrorCode; message: string }

export function validateTimelinePlacement(input: {
  date: string
  range: TimelineRange
  preference: PlanningPreferenceView
  blocks: readonly ScheduleBlockView[]
  ignoredBlockId?: string
  maximumDurationMinutes?: number
}): TimelinePlacementResult {
  const { range, preference } = input
  if (
    range.start < preference.day_start_minutes || range.start > preference.day_end_minutes
    || range.end < preference.day_start_minutes || range.end > preference.day_end_minutes
  ) {
    return { ok: false, code: "out-of-bounds", message: "时间必须位于当天规划范围内" }
  }
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || !Number.isInteger(range.start) || !Number.isInteger(range.end)) {
    throw new Error("timeline range must use integer minutes")
  }
  if ((range.start - preference.day_start_minutes) % SCHEDULE_SLOT_MINUTES !== 0 || (range.end - preference.day_start_minutes) % SCHEDULE_SLOT_MINUTES !== 0) {
    throw new Error("timeline range must align to 15-minute slots")
  }
  const duration = range.end - range.start
  if (duration < SCHEDULE_SLOT_MINUTES) return { ok: false, code: "too-short", message: "时间块最短为 15 分钟" }
  if (input.maximumDurationMinutes !== undefined && duration > input.maximumDurationMinutes) {
    return { ok: false, code: "budget", message: "时间块超过剩余可安排时间" }
  }
  let interval: ReturnType<typeof localTimeRangeToUtc>
  try {
    interval = localTimeRangeToUtc(input.date, minuteToTimeInput(range.start), minuteToTimeInput(range.end), preference)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("本地时间不存在") || message.includes("本地时间不明确") || message.includes("跨夏令时转换，实际时长不一致")) {
      return { ok: false, code: "invalid-local-time", message: "该本地时间不可用于排期" }
    }
    throw error
  }
  const conflict = input.blocks.some(block => {
    if (block.block_id === input.ignoredBlockId || !BLOCKING_STATUSES.has(block.status)) return false
    try {
      const blockStart = new Date(block.start_at)
      const blockEnd = new Date(block.end_at)
      if (!Number.isFinite(blockStart.getTime()) || !Number.isFinite(blockEnd.getTime()) || blockEnd.getTime() <= blockStart.getTime()) return true
      return new Date(interval.start_at).getTime() < blockEnd.getTime() && new Date(interval.end_at).getTime() > blockStart.getTime()
    } catch {
      return true
    }
  })
  if (conflict) return { ok: false, code: "conflict", message: "该时间与其他时间块冲突" }
  return { ok: true, range, interval }
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
