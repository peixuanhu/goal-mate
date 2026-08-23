import { describe, expect, it } from "vitest"

import { formatUtcInTimeZone, getUtcDayRange, zonedMinuteToUtc } from "./timezone"

describe("today timezone conversion", () => {
  it("converts Shanghai wall-clock minutes to UTC", () => {
    expect(zonedMinuteToUtc("2026-08-23", 9 * 60, "Asia/Shanghai").toISOString()).toBe(
      "2026-08-23T01:00:00.000Z",
    )
  })

  it("returns an exclusive UTC day range", () => {
    expect(getUtcDayRange("2026-08-23", "Asia/Shanghai")).toEqual({
      start: new Date("2026-08-22T16:00:00.000Z"),
      endExclusive: new Date("2026-08-23T16:00:00.000Z"),
    })
  })

  it("formats UTC back to the selected local date and minute", () => {
    expect(formatUtcInTimeZone(new Date("2026-08-23T01:30:00.000Z"), "Asia/Shanghai")).toEqual({
      date: "2026-08-23",
      minutes: 570,
    })
  })

  it("rejects nonexistent and ambiguous DST wall times", () => {
    expect(() => zonedMinuteToUtc("2026-03-08", 150, "America/New_York")).toThrow("本地时间不存在")
    expect(() => zonedMinuteToUtc("2026-11-01", 90, "America/New_York")).toThrow("本地时间不明确")
  })

  it("uses each local midnight when a DST day is shorter than 24 hours", () => {
    expect(getUtcDayRange("2026-03-08", "America/New_York")).toEqual({
      start: new Date("2026-03-08T05:00:00.000Z"),
      endExclusive: new Date("2026-03-09T04:00:00.000Z"),
    })
  })

  it("supports non-hour offsets and rejects invalid IANA timezones", () => {
    expect(zonedMinuteToUtc("2026-08-23", 9 * 60, "Asia/Kathmandu").toISOString()).toBe(
      "2026-08-23T03:15:00.000Z",
    )
    expect(() => zonedMinuteToUtc("2026-08-23", 9 * 60, "Not/A_Timezone")).toThrow(
      "timezone must be a valid IANA timezone",
    )
  })
})
