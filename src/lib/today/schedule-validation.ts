import type { ScheduleBlockStatus } from "./types"
import { formatUtcInTimeZone, nextExistingLocalDateStartToUtc } from "./timezone"

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
