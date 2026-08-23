import { describe, expect, it } from "vitest"

import { assertSchedulableInterval, BLOCKING_STATUSES, findOverlappingBlocks } from "./schedule-validation"

describe("schedule validation", () => {
  it("allows touching intervals but rejects overlap", () => {
    const blocks = [
      {
        block_id: "a",
        start_at: new Date("2026-08-23T01:00:00Z"),
        end_at: new Date("2026-08-23T02:00:00Z"),
        status: "scheduled" as const,
      },
    ]

    expect(
      findOverlappingBlocks(
        new Date("2026-08-23T02:00:00Z"),
        new Date("2026-08-23T03:00:00Z"),
        blocks,
      ),
    ).toEqual([])
    expect(
      findOverlappingBlocks(
        new Date("2026-08-23T01:30:00Z"),
        new Date("2026-08-23T02:30:00Z"),
        blocks,
      ).map(item => item.block_id),
    ).toEqual(["a"])
  })

  it("only treats scheduled, completed, and partial blocks as blocking", () => {
    expect(BLOCKING_STATUSES).toEqual(new Set(["scheduled", "completed", "partial"]))

    const common = {
      start_at: new Date("2026-08-23T01:00:00Z"),
      end_at: new Date("2026-08-23T02:00:00Z"),
    }
    const blocks = [
      { block_id: "scheduled", status: "scheduled" as const, ...common },
      { block_id: "completed", status: "completed" as const, ...common },
      { block_id: "partial", status: "partial" as const, ...common },
      { block_id: "skipped", status: "skipped" as const, ...common },
      { block_id: "cancelled", status: "cancelled" as const, ...common },
    ]

    expect(
      findOverlappingBlocks(
        new Date("2026-08-23T01:30:00Z"),
        new Date("2026-08-23T02:30:00Z"),
        blocks,
      ).map(item => item.block_id),
    ).toEqual(["scheduled", "completed", "partial"])
  })

  it("ignores the edited block when checking overlap", () => {
    const blocks = [
      {
        block_id: "edited",
        start_at: new Date("2026-08-23T01:00:00Z"),
        end_at: new Date("2026-08-23T02:00:00Z"),
        status: "scheduled" as const,
      },
    ]

    expect(
      findOverlappingBlocks(
        new Date("2026-08-23T01:30:00Z"),
        new Date("2026-08-23T02:30:00Z"),
        blocks,
        "edited",
      ),
    ).toEqual([])
  })

  it("rejects cross-local-day and reversed intervals", () => {
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2026-08-23T15:30:00Z"),
        end_at: new Date("2026-08-23T16:30:00Z"),
        timezone: "Asia/Shanghai",
      }),
    ).toThrow("时间块不能跨本地日期")
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2026-08-23T02:00:00Z"),
        end_at: new Date("2026-08-23T01:00:00Z"),
        timezone: "Asia/Shanghai",
      }),
    ).toThrow("end_at must be later than start_at")
  })

  it("allows an end exactly at the next local midnight", () => {
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2026-08-23T15:00:00Z"),
        end_at: new Date("2026-08-23T16:00:00Z"),
        timezone: "Asia/Shanghai",
      }),
    ).not.toThrow()
  })

  it.each([
    "2026-08-23T16:00:00.001Z",
    "2026-08-23T16:00:59.999Z",
  ])("rejects an end just after the next local midnight: %s", end_at => {
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2026-08-23T15:00:00Z"),
        end_at: new Date(end_at),
        timezone: "Asia/Shanghai",
      }),
    ).toThrow("时间块不能跨本地日期")
  })

  it("allows the exact next midnight across a DST-shortened local day", () => {
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2026-03-09T03:00:00Z"),
        end_at: new Date("2026-03-09T04:00:00Z"),
        timezone: "America/New_York",
      }),
    ).not.toThrow()
  })

  it("uses the first valid instant as the next boundary after a midnight gap", () => {
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2026-03-08T04:00:00Z"),
        end_at: new Date("2026-03-08T05:00:00Z"),
        timezone: "America/Havana",
      }),
    ).not.toThrow()
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2026-03-08T04:00:00Z"),
        end_at: new Date("2026-03-08T05:00:00.001Z"),
        timezone: "America/Havana",
      }),
    ).toThrow("时间块不能跨本地日期")
  })

  it("only allows the earliest next boundary when local midnight repeats", () => {
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2026-11-01T03:00:00Z"),
        end_at: new Date("2026-11-01T04:00:00Z"),
        timezone: "America/Havana",
      }),
    ).not.toThrow()
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2026-11-01T03:00:00Z"),
        end_at: new Date("2026-11-01T05:00:00Z"),
        timezone: "America/Havana",
      }),
    ).toThrow("时间块不能跨本地日期")
  })

  it("uses the next existing date boundary when a calendar date is skipped", () => {
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2011-12-30T09:00:00Z"),
        end_at: new Date("2011-12-30T10:00:00Z"),
        timezone: "Pacific/Apia",
      }),
    ).not.toThrow()
    expect(() =>
      assertSchedulableInterval({
        start_at: new Date("2011-12-30T09:00:00Z"),
        end_at: new Date("2011-12-30T10:00:00.001Z"),
        timezone: "Pacific/Apia",
      }),
    ).toThrow("时间块不能跨本地日期")
  })
})
