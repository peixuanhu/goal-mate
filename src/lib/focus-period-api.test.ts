import { describe, expect, it } from "vitest"
import {
  type FocusPeriodInput,
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

  it("rejects invalid calendar dates", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-02-31",
          end_date: "2026-03-15",
          goal_id: "goal_math",
          color: "#4f46e5",
        },
        [],
      ),
    ).toEqual({ ok: false, message: "日期格式无效" })
  })

  it("rejects missing date fields", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          end_date: "2026-03-15",
          goal_id: "goal_math",
          color: "#4f46e5",
        } as unknown as FocusPeriodInput,
        [],
      ),
    ).toEqual({ ok: false, message: "日期格式无效" })
  })

  it("rejects non-string date fields", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: 20260501,
          end_date: "2026-06-30",
          goal_id: "goal_music",
          color: "#0f766e",
        } as unknown as FocusPeriodInput,
        [],
      ),
    ).toEqual({ ok: false, message: "日期格式无效" })
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

  it("ignores the current period when checking overlaps", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-05-15",
          end_date: "2026-06-15",
          goal_id: "goal_music",
          color: "#0f766e",
        },
        existing,
        "period_music",
      ),
    ).toEqual({ ok: true })
  })

  it("rejects empty goals", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-07-01",
          end_date: "2026-08-31",
          goal_id: "",
          color: "#ea580c",
        },
        [],
      ),
    ).toEqual({ ok: false, message: "必须选择一个目标" })
  })

  it("rejects non-hex colors", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-07-01",
          end_date: "2026-08-31",
          goal_id: "goal_fitness",
          color: "orange",
        },
        [],
      ),
    ).toEqual({ ok: false, message: "颜色必须是十六进制色值" })
  })

  it("rejects non-integer years", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026.5,
          start_date: "2026-07-01",
          end_date: "2026-08-31",
          goal_id: "goal_fitness",
          color: "#ea580c",
        },
        [],
      ),
    ).toEqual({ ok: false, message: "年份必须是整数" })
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
