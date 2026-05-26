import { describe, expect, it } from "vitest"
import {
  assignFocusColor,
  buildTimelineSegments,
  dateToYearPercent,
  findCurrentFocusPeriod,
  hasDateRangeOverlap,
  isLeapYear,
  normalizeDateInput,
} from "./focus-period-utils"

const periods = [
  {
    period_id: "period_music",
    year: 2026,
    start_date: "2026-05-01",
    end_date: "2026-06-30",
    goal_id: "goal_music",
    color: "#0f766e",
    goal: { goal_id: "goal_music", name: "学习吉他与编曲", tag: "音乐" },
  },
  {
    period_id: "period_fitness",
    year: 2026,
    start_date: "2026-07-01",
    end_date: "2026-08-31",
    goal_id: "goal_fitness",
    color: "#ea580c",
    goal: { goal_id: "goal_fitness", name: "健身", tag: "身体" },
  },
]

describe("focus-period-utils", () => {
  it("detects leap years", () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
  })

  it("normalizes date inputs to yyyy-mm-dd", () => {
    expect(normalizeDateInput("2026-05-26")).toBe("2026-05-26")
    expect(normalizeDateInput(new Date("2026-05-26T15:30:00.000Z"))).toBe("2026-05-26")
  })

  it("converts dates to year percentages", () => {
    expect(dateToYearPercent("2026-01-01", 2026)).toBe(0)
    expect(dateToYearPercent("2026-12-31", 2026)).toBe(100)
    expect(dateToYearPercent("2024-12-31", 2024)).toBe(100)
  })

  it("finds the current focus period by inclusive date range", () => {
    expect(findCurrentFocusPeriod(periods, new Date("2026-05-26T00:00:00.000Z"))?.period_id).toBe("period_music")
    expect(findCurrentFocusPeriod(periods, new Date("2026-06-30T00:00:00.000Z"))?.period_id).toBe("period_music")
    expect(findCurrentFocusPeriod(periods, new Date("2026-09-01T00:00:00.000Z"))).toBeUndefined()
  })

  it("allows adjacent periods but rejects overlaps", () => {
    expect(
      hasDateRangeOverlap(
        { start_date: "2026-07-01", end_date: "2026-08-31" },
        [{ period_id: "a", start_date: "2026-05-01", end_date: "2026-06-30" }],
      ),
    ).toBe(false)
    expect(
      hasDateRangeOverlap(
        { start_date: "2026-06-30", end_date: "2026-07-10" },
        [{ period_id: "a", start_date: "2026-05-01", end_date: "2026-06-30" }],
      ),
    ).toBe(true)
  })

  it("builds gray gap segments around colored focus periods", () => {
    const segments = buildTimelineSegments(periods, 2026)
    expect(segments.map(segment => segment.kind)).toEqual(["gap", "period", "period", "gap"])
    expect(segments[0]).toMatchObject({ kind: "gap", start_date: "2026-01-01", end_date: "2026-04-30" })
    expect(segments[1]).toMatchObject({ kind: "period", period_id: "period_music", color: "#0f766e" })
  })

  it("assigns stable colors by index", () => {
    expect(assignFocusColor(0)).toBe("#0f766e")
    expect(assignFocusColor(8)).toBe("#0f766e")
  })
})
