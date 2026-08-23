import { describe, expect, it, vi } from "vitest"

import { lockScheduleLocalDates } from "./schedule-lock"

describe("schedule date lock primitive", () => {
  it("deduplicates and locks local dates in stable sorted order", async () => {
    const $executeRaw = vi.fn().mockResolvedValue(0)
    await lockScheduleLocalDates({ $executeRaw } as never, ["2026-08-24", "2026-08-23", "2026-08-24"])
    expect($executeRaw).toHaveBeenCalledTimes(2)
    expect($executeRaw.mock.calls[0]?.[1]).toBe(48_241)
    expect($executeRaw.mock.calls[1]?.[1]).toBe(48_241)
    expect($executeRaw.mock.calls[0]?.[2]).toBe("2026-08-23")
    expect($executeRaw.mock.calls[1]?.[2]).toBe("2026-08-24")
  })
})
