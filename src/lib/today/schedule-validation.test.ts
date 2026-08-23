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
})
