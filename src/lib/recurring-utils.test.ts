import { afterEach, describe, expect, it, vi } from "vitest"

import { getCurrentPeriodCount } from "./recurring-utils"

describe("recurring progress counting", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not count partial schedule progress toward recurrence", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 23, 12))

    const plan = {
      is_recurring: true,
      recurrence_type: "daily",
      recurrence_value: "1",
      progressRecords: [
        { gmt_create: new Date(2026, 7, 23, 9), counts_toward_recurrence: false },
        { gmt_create: new Date(2026, 7, 23, 10), counts_toward_recurrence: true },
      ],
    }

    expect(getCurrentPeriodCount(plan)).toBe(1)
  })

  it("continues to count legacy progress without an explicit recurrence flag", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 23, 12))

    expect(getCurrentPeriodCount({
      is_recurring: true,
      recurrence_type: "daily",
      recurrence_value: "2",
      progressRecords: [
        { gmt_create: new Date(2026, 7, 23, 9) },
        { gmt_create: new Date(2026, 7, 23, 10), counts_toward_recurrence: true },
      ],
    })).toBe(2)
  })
})
