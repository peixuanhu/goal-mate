import { afterEach, describe, expect, it, vi } from "vitest"

import { isPlanCompleted } from "./plan-completion"

afterEach(() => {
  vi.useRealTimers()
})

describe("isPlanCompleted", () => {
  it("uses progress for ordinary plans", () => {
    expect(isPlanCompleted({
      is_recurring: false,
      progress: 1,
      progressRecords: [],
    })).toBe(true)
    expect(isPlanCompleted({
      is_recurring: false,
      progress: 0.99,
      progressRecords: [],
    })).toBe(false)
  })

  it("uses counting records from the current period for recurring plans", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-24T08:00:00.000Z"))

    expect(isPlanCompleted({
      is_recurring: true,
      progress: 0,
      recurrence_type: "daily",
      recurrence_value: "1",
      progressRecords: [{
        gmt_create: new Date("2026-08-24T01:00:00.000Z"),
        counts_toward_recurrence: true,
      }],
    })).toBe(true)

    expect(isPlanCompleted({
      is_recurring: true,
      progress: 1,
      recurrence_type: "daily",
      recurrence_value: "1",
      progressRecords: [{
        gmt_create: new Date("2026-08-23T01:00:00.000Z"),
        counts_toward_recurrence: true,
      }],
    })).toBe(false)
  })
})
