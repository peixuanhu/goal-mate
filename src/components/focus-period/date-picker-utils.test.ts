import { describe, expect, it } from "vitest"

import {
  buildCalendarMonth,
  calculatePopoverLayout,
  formatDateForDisplay,
  formatMonthTitle,
  getMonthIndexFromDate,
} from "./date-picker-utils"

describe("date-picker-utils", () => {
  it("formats stored dates for display", () => {
    expect(formatDateForDisplay("2026-05-01")).toBe("2026/05/01")
    expect(formatDateForDisplay("")).toBe("")
  })

  it("builds a stable six-week month grid", () => {
    const days = buildCalendarMonth(2026, 4)

    expect(days).toHaveLength(42)
    expect(days[0]).toMatchObject({ date: "2026-04-26", day: 26, inMonth: false, disabled: false })
    expect(days[5]).toMatchObject({ date: "2026-05-01", day: 1, inMonth: true, disabled: false })
    expect(days[36]).toMatchObject({ date: "2026-06-01", day: 1, inMonth: false, disabled: false })
  })

  it("disables dates outside the selected year", () => {
    const january = buildCalendarMonth(2026, 0)
    const december = buildCalendarMonth(2026, 11)

    expect(january[0]).toMatchObject({ date: "2025-12-28", disabled: true })
    expect(december[41]).toMatchObject({ date: "2027-01-09", disabled: true })
  })

  it("derives month labels and selected month indexes", () => {
    expect(formatMonthTitle(2026, 4)).toBe("2026年5月")
    expect(getMonthIndexFromDate("2026-06-30", 0)).toBe(5)
    expect(getMonthIndexFromDate("", 11)).toBe(11)
  })

  it("keeps the date picker popover inside the viewport", () => {
    expect(calculatePopoverLayout({
      triggerBottom: 311,
      triggerLeft: 796,
      triggerTop: 275,
      viewportHeight: 1150,
      viewportWidth: 1030,
    })).toEqual({
      left: -70,
      maxHeight: 322,
      top: 44,
      width: 288,
    })

    expect(calculatePopoverLayout({
      triggerBottom: 311,
      triggerLeft: 80,
      triggerTop: 275,
      viewportHeight: 1150,
      viewportWidth: 1030,
    })).toEqual({
      left: 0,
      maxHeight: 322,
      top: 44,
      width: 288,
    })

    expect(calculatePopoverLayout({
      triggerBottom: 312,
      triggerLeft: 12,
      triggerTop: 276,
      viewportHeight: 640,
      viewportWidth: 280,
    })).toEqual({
      left: 4,
      maxHeight: 322,
      top: 26,
      width: 248,
    })
  })

  it("opens the date picker popover above the trigger when bottom space is tight", () => {
    expect(calculatePopoverLayout({
      triggerBottom: 569,
      triggerLeft: 29,
      triggerTop: 533,
      viewportHeight: 844,
      viewportWidth: 390,
    })).toEqual({
      left: 0,
      maxHeight: 322,
      top: -330,
      width: 288,
    })
  })
})
