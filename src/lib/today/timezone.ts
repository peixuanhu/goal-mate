import { addDays, parseDateOnly } from "@/lib/focus-period-utils"

type LocalMinute = {
  date: string
  minutes: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()
const MINUTE_MS = 60_000
const OFFSET_PROBE_RANGE_MINUTES = 36 * 60
const OFFSET_PROBE_STEP_MINUTES = 30

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone)
  if (cached) {
    return cached
  }

  if (typeof timezone !== "string" || timezone.trim() === "") {
    throw new Error("timezone must be a valid IANA timezone")
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
    formatter.format(new Date(0))
    formatterCache.set(timezone, formatter)
    return formatter
  } catch {
    throw new Error("timezone must be a valid IANA timezone")
  }
}

function readLocalMinute(date: Date, timezone: string): LocalMinute {
  if (!Number.isFinite(date.getTime())) {
    throw new Error("date must be valid")
  }

  const values = new Map(
    getFormatter(timezone)
      .formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value]),
  )
  const year = values.get("year")
  const month = values.get("month")
  const day = values.get("day")
  const hour = Number(values.get("hour"))
  const minute = Number(values.get("minute"))

  if (!year || !month || !day || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error("无法解析本地时间")
  }

  return {
    date: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  }
}

export function formatUtcInTimeZone(date: Date, timezone: string): LocalMinute {
  return readLocalMinute(date, timezone)
}

function getUtcLikeTime(parsedDate: Date, minutes: number): number {
  return Date.UTC(
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth(),
    parsedDate.getUTCDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  )
}

function collectPlausibleOffsets(targetUtcLike: number, timezone: string): number[] {
  const offsets = new Set<number>()

  for (
    let probeMinutes = -OFFSET_PROBE_RANGE_MINUTES;
    probeMinutes <= OFFSET_PROBE_RANGE_MINUTES;
    probeMinutes += OFFSET_PROBE_STEP_MINUTES
  ) {
    const probeTime = targetUtcLike + probeMinutes * MINUTE_MS
    const probe = readLocalMinute(new Date(probeTime), timezone)
    const probeDate = parseDateOnly(probe.date)
    const localUtcLike =
      probeDate.getTime()
      + probe.minutes * MINUTE_MS
    offsets.add(localUtcLike - probeTime)
  }

  return [...offsets]
}

function findUtcCandidates(
  date: string,
  minutes: number,
  targetUtcLike: number,
  timezone: string,
  offsets: readonly number[],
): Date[] {
  return offsets
    .map(offset => new Date(targetUtcLike - offset))
    .filter(candidate => {
      const roundTrip = readLocalMinute(candidate, timezone)
      return roundTrip.date === date && roundTrip.minutes === minutes
    })
    .filter((candidate, index, all) => all.findIndex(other => other.getTime() === candidate.getTime()) === index)
    .sort((left, right) => left.getTime() - right.getTime())
}

export function zonedMinuteToUtc(date: string, minutes: number, timezone: string): Date {
  const parsedDate = parseDateOnly(date)
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) {
    throw new Error("minutes must be an integer between 0 and 1439")
  }

  getFormatter(timezone)

  const targetUtcLike = getUtcLikeTime(parsedDate, minutes)
  const matches = findUtcCandidates(
    date,
    minutes,
    targetUtcLike,
    timezone,
    collectPlausibleOffsets(targetUtcLike, timezone),
  )

  if (matches.length === 0) {
    throw new Error("本地时间不存在")
  }
  if (matches.length > 1) {
    throw new Error("本地时间不明确")
  }

  return matches[0]
}

export function zonedDateStartToUtc(date: string, timezone: string): Date {
  const parsedDate = parseDateOnly(date)
  getFormatter(timezone)

  const midnightUtcLike = getUtcLikeTime(parsedDate, 0)
  const offsets = collectPlausibleOffsets(midnightUtcLike, timezone)

  for (let minutes = 0; minutes < 1440; minutes += 1) {
    const matches = findUtcCandidates(
      date,
      minutes,
      midnightUtcLike + minutes * MINUTE_MS,
      timezone,
      offsets,
    )
    if (matches.length > 0) {
      return matches[0]
    }
  }

  throw new Error("本地日期不存在")
}

export function getUtcDayRange(date: string, timezone: string): { start: Date; endExclusive: Date } {
  return {
    start: zonedDateStartToUtc(date, timezone),
    endExclusive: zonedDateStartToUtc(addDays(date, 1), timezone),
  }
}
