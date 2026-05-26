export interface FocusGoalSummary {
  goal_id: string
  name: string
  tag?: string | null
}

export interface FocusPeriodView extends DateRange {
  period_id: string
  year: number
  goal_id: string
  color: string
  goal?: FocusGoalSummary | null
}

export interface DateRange {
  start_date: string
  end_date: string
  period_id?: string
}

export type TimelineSegment =
  | {
      kind: "gap"
      start_date: string
      end_date: string
      color: "#e5e7eb"
      leftPercent: number
      widthPercent: number
    }
  | (FocusPeriodView & {
      kind: "period"
      leftPercent: number
      widthPercent: number
    })

export const FOCUS_COLORS = [
  "#0f766e",
  "#ea580c",
  "#4f46e5",
  "#be123c",
  "#0891b2",
  "#7c3aed",
  "#65a30d",
  "#c2410c",
] as const

const MS_PER_DAY = 24 * 60 * 60 * 1000
const GAP_COLOR = "#e5e7eb" as const

export function assignFocusColor(index: number): (typeof FOCUS_COLORS)[number] {
  const normalizedIndex = ((index % FOCUS_COLORS.length) + FOCUS_COLORS.length) % FOCUS_COLORS.length
  return FOCUS_COLORS[normalizedIndex]
}

export function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

export function normalizeDateInput(date: string | Date): string {
  if (date instanceof Date) {
    return date.toISOString().slice(0, 10)
  }

  return parseDateOnly(date).toISOString().slice(0, 10)
}

export function parseDateOnly(date: string | Date): Date {
  if (date instanceof Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) {
    throw new Error(`Expected date in yyyy-mm-dd format: ${date}`)
  }

  const [, year, month, day] = match
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid date: ${date}`)
  }

  return parsed
}

export function dateToYearDay(date: string | Date, year: number): number {
  const parsedDate = parseDateOnly(date)
  const yearStart = parseDateOnly(getYearStart(year))

  return Math.floor((parsedDate.getTime() - yearStart.getTime()) / MS_PER_DAY)
}

export function dateToYearPercent(date: string | Date, year: number): number {
  const day = Math.min(Math.max(dateToYearDay(date, year), 0), daysInYear(year) - 1)
  return (day / (daysInYear(year) - 1)) * 100
}

export function addDays(date: string | Date, days: number): string {
  const parsedDate = parseDateOnly(date)
  parsedDate.setUTCDate(parsedDate.getUTCDate() + days)
  return normalizeDateInput(parsedDate)
}

export function getYearStart(year: number): string {
  return `${year}-01-01`
}

export function getYearEnd(year: number): string {
  return `${year}-12-31`
}

export function hasDateRangeOverlap(
  range: DateRange,
  existingRanges: DateRange[],
  ignoredPeriodId?: string,
): boolean {
  const startDate = normalizeDateInput(range.start_date)
  const endDate = normalizeDateInput(range.end_date)

  return existingRanges.some(existingRange => {
    if (ignoredPeriodId && existingRange.period_id === ignoredPeriodId) {
      return false
    }

    const existingStartDate = normalizeDateInput(existingRange.start_date)
    const existingEndDate = normalizeDateInput(existingRange.end_date)

    return startDate <= existingEndDate && endDate >= existingStartDate
  })
}

export function findCurrentFocusPeriod<T extends DateRange>(periods: T[], date: string | Date = new Date()): T | undefined {
  const currentDate = normalizeDateInput(date)

  return [...periods]
    .sort((a, b) => normalizeDateInput(a.start_date).localeCompare(normalizeDateInput(b.start_date)))
    .find(period => currentDate >= normalizeDateInput(period.start_date) && currentDate <= normalizeDateInput(period.end_date))
}

export function buildTimelineSegments<T extends FocusPeriodView>(periods: T[], year: number): TimelineSegment[] {
  const yearStart = getYearStart(year)
  const yearEnd = getYearEnd(year)
  const sortedPeriods = periods
    .filter(period => normalizeDateInput(period.end_date) >= yearStart && normalizeDateInput(period.start_date) <= yearEnd)
    .map(period => ({
      ...period,
      start_date: normalizeDateInput(period.start_date) < yearStart ? yearStart : normalizeDateInput(period.start_date),
      end_date: normalizeDateInput(period.end_date) > yearEnd ? yearEnd : normalizeDateInput(period.end_date),
    }))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))

  const segments: TimelineSegment[] = []
  let cursor = yearStart

  for (const period of sortedPeriods) {
    if (cursor < period.start_date) {
      const gapEndDate = addDays(period.start_date, -1)
      segments.push(createGapSegment(cursor, gapEndDate, year))
    }

    segments.push(createPeriodSegment(period, year))
    const nextCursor = addDays(period.end_date, 1)
    if (nextCursor > cursor) {
      cursor = nextCursor
    }
  }

  if (cursor <= yearEnd) {
    segments.push(createGapSegment(cursor, yearEnd, year))
  }

  return segments.sort((a, b) => a.start_date.localeCompare(b.start_date))
}

function createGapSegment(startDate: string, endDate: string, year: number): TimelineSegment {
  return {
    kind: "gap",
    start_date: startDate,
    end_date: endDate,
    color: GAP_COLOR,
    leftPercent: getInclusiveLeftPercent(startDate, year),
    widthPercent: getInclusiveWidthPercent(startDate, endDate, year),
  }
}

function createPeriodSegment(period: FocusPeriodView, year: number): TimelineSegment {
  return {
    ...period,
    kind: "period",
    leftPercent: getInclusiveLeftPercent(period.start_date, year),
    widthPercent: getInclusiveWidthPercent(period.start_date, period.end_date, year),
  }
}

function getInclusiveLeftPercent(startDate: string, year: number): number {
  const startDay = Math.min(Math.max(dateToYearDay(startDate, year), 0), daysInYear(year) - 1)

  return (startDay / daysInYear(year)) * 100
}

function getInclusiveWidthPercent(startDate: string, endDate: string, year: number): number {
  const startDay = Math.min(Math.max(dateToYearDay(startDate, year), 0), daysInYear(year) - 1)
  const endDay = Math.min(Math.max(dateToYearDay(endDate, year), 0), daysInYear(year) - 1)

  return ((endDay - startDay + 1) / daysInYear(year)) * 100
}
