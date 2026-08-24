import type { ScheduleBlockStatus } from "./types"
import {
  formatUtcInTimeZone,
  nextExistingLocalDateStartToUtc,
  zonedMinuteToUtc,
} from "./timezone"

const MINUTE_MS = 60_000
const SCHEDULE_SLOT_MINUTES = 15

export const BLOCKING_STATUSES: ReadonlySet<ScheduleBlockStatus> = new Set([
  "scheduled",
  "completed",
  "partial",
])

export type SchedulableInterval = {
  start_at: Date
  end_at: Date
  timezone: string
}

export type ScheduleBlockInterval = {
  block_id: string
  start_at: Date
  end_at: Date
  status: ScheduleBlockStatus
}

export type PlanningSlotInterval = SchedulableInterval & {
  day_start_minutes: number
}

export function assertSchedulableInterval({ start_at, end_at, timezone }: SchedulableInterval): void {
  if (!Number.isFinite(start_at.getTime()) || !Number.isFinite(end_at.getTime())) {
    throw new Error("start_at and end_at must be valid dates")
  }
  if (end_at.getTime() <= start_at.getTime()) {
    throw new Error("end_at must be later than start_at")
  }

  const localStart = formatUtcInTimeZone(start_at, timezone)
  const localEnd = formatUtcInTimeZone(end_at, timezone)

  if (localEnd.date === localStart.date) {
    return
  }

  const nextDateStart = nextExistingLocalDateStartToUtc(localStart.date, timezone)
  if (end_at.getTime() !== nextDateStart.getTime()) {
    throw new Error("时间块不能跨本地日期")
  }
}

export function assertPlanningSlotInterval({
  start_at,
  end_at,
  timezone,
  day_start_minutes,
}: PlanningSlotInterval): { date: string; startMinutes: number; endMinutes: number } {
  assertSchedulableInterval({ start_at, end_at, timezone })

  if (start_at.getTime() % MINUTE_MS !== 0 || end_at.getTime() % MINUTE_MS !== 0) {
    throw new Error("时间块起止点必须是精确整分钟")
  }

  const localStart = formatUtcInTimeZone(start_at, timezone)
  const localEnd = formatUtcInTimeZone(end_at, timezone)
  const nextDateStart = localEnd.date === localStart.date
    ? null
    : nextExistingLocalDateStartToUtc(localStart.date, timezone)
  const endMinutes = nextDateStart?.getTime() === end_at.getTime()
    ? 1440
    : localEnd.minutes

  if (
    (localStart.minutes - day_start_minutes) % SCHEDULE_SLOT_MINUTES !== 0
    || (endMinutes - day_start_minutes) % SCHEDULE_SLOT_MINUTES !== 0
  ) {
    throw new Error("时间必须对齐 15 分钟刻度")
  }

  const uniqueStart = zonedMinuteToUtc(localStart.date, localStart.minutes, timezone)
  if (uniqueStart.getTime() !== start_at.getTime()) {
    throw new Error("开始时间与本地时间不一致")
  }
  if (nextDateStart === null) {
    const uniqueEnd = zonedMinuteToUtc(localEnd.date, localEnd.minutes, timezone)
    if (uniqueEnd.getTime() !== end_at.getTime()) {
      throw new Error("结束时间与本地时间不一致")
    }
  }

  const wallClockDurationMinutes = endMinutes - localStart.minutes
  const elapsedDurationMinutes = (end_at.getTime() - start_at.getTime()) / MINUTE_MS
  if (elapsedDurationMinutes !== wallClockDurationMinutes) {
    throw new Error("时间块跨夏令时转换，实际时长不一致")
  }

  return {
    date: localStart.date,
    startMinutes: localStart.minutes,
    endMinutes,
  }
}

export function findOverlappingBlocks<T extends ScheduleBlockInterval>(
  startAt: Date,
  endAt: Date,
  blocks: readonly T[],
  ignoredBlockId?: string,
): T[] {
  return blocks.filter(block =>
    block.block_id !== ignoredBlockId
    && BLOCKING_STATUSES.has(block.status)
    && startAt.getTime() < block.end_at.getTime()
    && endAt.getTime() > block.start_at.getTime(),
  )
}
