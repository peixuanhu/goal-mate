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

  it("uses the local calendar day when finding the current period from Date", () => {
    const localMidnightPeriod = [
      {
        period_id: "period_local_day",
        year: 2026,
        start_date: "2026-05-02",
        end_date: "2026-05-02",
        goal_id: "goal_local_day",
        color: "#4f46e5",
        goal: { goal_id: "goal_local_day", name: "Local day", tag: "Time" },
      },
    ]

    expect(findCurrentFocusPeriod(localMidnightPeriod, new Date(2026, 4, 2, 0, 30))?.period_id).toBe("period_local_day")
    expect(dateToYearPercent(new Date(2026, 11, 31, 23, 30), 2026)).toBe(100)
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
    expect(segments[0]).toMatchObject({ kind: "gap", start_date: "2026-01-01", end_date: "2026-04-30", color: "#e5e7eb" })
    expect(segments[1]).toMatchObject({ kind: "period", period_id: "period_music", color: "#0f766e", leftPercent: 120 / 365 * 100 })
    expect(segments[0].leftPercent + segments[0].widthPercent).toBeCloseTo(segments[1].leftPercent)
    expect(segments[1].leftPercent + segments[1].widthPercent).toBeCloseTo(segments[2].leftPercent)
  })

  it("keeps a one-day final segment within the year timeline", () => {
    const segments = buildTimelineSegments(
      [
        {
          period_id: "period_year_end",
          year: 2026,
          start_date: "2026-12-31",
          end_date: "2026-12-31",
          goal_id: "goal_year_end",
          color: "#4f46e5",
          goal: { goal_id: "goal_year_end", name: "Year-end review", tag: "Review" },
        },
      ],
      2026,
    )
    const finalPeriod = segments.find(segment => segment.kind === "period" && segment.period_id === "period_year_end")

    expect(finalPeriod).toMatchObject({
      kind: "period",
      leftPercent: 364 / 365 * 100,
      widthPercent: 1 / 365 * 100,
    })
    expect(finalPeriod!.leftPercent + finalPeriod!.widthPercent).toBeCloseTo(100)
  })

  it("assigns stable colors by index", () => {
    expect(assignFocusColor(0)).toBe("#0f766e")
    expect(assignFocusColor(8)).toBe("#0f766e")
  })
})
