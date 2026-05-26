import { describe, expect, it } from "vitest"
import {
  mapFocusPeriodRecord,
  validateFocusPeriodInput,
} from "./focus-period-api"

const existing = [
  {
    period_id: "period_music",
    year: 2026,
    start_date: "2026-05-01",
    end_date: "2026-06-30",
    goal_id: "goal_music",
    color: "#0f766e",
  },
]

describe("focus-period-api", () => {
  it("accepts a valid adjacent period", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-07-01",
          end_date: "2026-08-31",
          goal_id: "goal_fitness",
          color: "#ea580c",
        },
        existing,
      ),
    ).toEqual({ ok: true })
  })

  it("rejects cross-year ranges", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-12-15",
          end_date: "2027-01-15",
          goal_id: "goal_math",
          color: "#4f46e5",
        },
        [],
      ),
    ).toEqual({ ok: false, message: "开始日期和结束日期必须属于同一年" })
  })

  it("rejects reversed ranges", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-08-31",
          end_date: "2026-07-01",
          goal_id: "goal_fitness",
          color: "#ea580c",
        },
        [],
      ),
    ).toEqual({ ok: false, message: "开始日期不能晚于结束日期" })
  })

  it("rejects overlaps", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-06-15",
          end_date: "2026-07-15",
          goal_id: "goal_fitness",
          color: "#ea580c",
        },
        existing,
      ),
    ).toEqual({ ok: false, message: "同一年内的专注阶段不能重叠" })
  })

  it("maps missing goals as deleted", () => {
    const mapped = mapFocusPeriodRecord(
      {
        period_id: "period_old",
        year: 2026,
        start_date: new Date("2026-09-01T00:00:00.000Z"),
        end_date: new Date("2026-09-30T00:00:00.000Z"),
        goal_id: "goal_deleted",
        color: "#4f46e5",
      },
      null,
    )

    expect(mapped).toMatchObject({
      period_id: "period_old",
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      goal_id: "goal_deleted",
      goal: null,
    })
  })
})
