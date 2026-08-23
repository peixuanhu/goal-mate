import { describe, expect, it } from "vitest"

import type { PlanningPreferenceView, ScheduleBlockView } from "@/lib/today/types"

import {
  durationForCandidate,
  findNextFreeStart,
  localTimeRangeToUtc,
  minuteFromTimelinePoint,
  toLocalBlockRange,
} from "./scheduling-ui"

const preference: PlanningPreferenceView = {
  preference_id: "default",
  timezone: "Asia/Shanghai",
  day_start_minutes: 480,
  day_end_minutes: 600,
  high_energy_start_minutes: null,
  high_energy_end_minutes: null,
  buffer_minutes: 15,
  default_block_minutes: 45,
  capacity_warning_minutes: 480,
  version: null,
}

function block(start: string, end: string, status: ScheduleBlockView["status"] = "scheduled"): ScheduleBlockView {
  return {
    block_id: `${start}-${status}`,
    plan_id: "plan",
    action_id: null,
    title: "Block",
    goal_id: null,
    goal_name: null,
    energy_level: null,
    start_at: start,
    end_at: end,
    status,
    source: "manual",
    result_note: null,
    version: 1,
  }
}

describe("manual scheduling UI helpers", () => {
  it("rounds and clamps candidate duration to 15-minute slots", () => {
    expect(durationForCandidate(52, preference)).toBe(60)
    expect(durationForCandidate(null, preference)).toBe(45)
    expect(durationForCandidate(999, preference)).toBe(120)
    expect(durationForCandidate(1, preference)).toBe(15)
  })

  it("maps a drop point to a clamped 15-minute start", () => {
    expect(minuteFromTimelinePoint(250, { top: 100, height: 300 }, preference, 45)).toBe(540)
    expect(minuteFromTimelinePoint(-100, { top: 100, height: 300 }, preference, 45)).toBe(480)
    expect(minuteFromTimelinePoint(999, { top: 100, height: 300 }, preference, 45)).toBe(555)
  })

  it("scans half-open busy ranges and accepts touching edges", () => {
    const blocks = [
      block("2026-08-23T00:00:00.000Z", "2026-08-23T01:00:00.000Z"),
      block("2026-08-23T01:30:00.000Z", "2026-08-23T02:00:00.000Z"),
    ]
    expect(findNextFreeStart("2026-08-23", 30, preference, blocks)).toBe(540)
  })

  it("ignores non-blocking terminal states and reports an entirely full day", () => {
    const ignored = block("2026-08-23T00:00:00.000Z", "2026-08-23T02:00:00.000Z", "skipped")
    expect(findNextFreeStart("2026-08-23", 30, preference, [ignored])).toBe(480)
    const full = block("2026-08-23T00:00:00.000Z", "2026-08-23T02:00:00.000Z")
    expect(findNextFreeStart("2026-08-23", 30, preference, [full])).toBeNull()
  })

  it("rejects invalid or DST-nonexistent local intervals", () => {
    expect(() => toLocalBlockRange("bad", "2026-08-23T01:00:00.000Z", "Asia/Shanghai", "2026-08-23")).toThrow()
    expect(() => localTimeRangeToUtc("2026-03-08", "02:30", "03:00", {
      ...preference,
      timezone: "America/New_York",
      day_start_minutes: 0,
      day_end_minutes: 600,
    })).toThrow("本地时间不存在")
    expect(() => toLocalBlockRange(
      "2026-08-23T00:00:00.000Z",
      "2026-08-23T01:00:00.000Z",
      "Mars/Olympus",
      "2026-08-23",
    )).toThrow("timezone")
  })
})
