import { describe, expect, it } from "vitest"

import type { PlanningPreferenceView, ScheduleBlockView } from "@/lib/today/types"

import {
  durationForCandidate,
  findNextFreeStart,
  findValidStartAtOrAfter,
  localTimeRangeToUtc,
  minuteFromTimelinePoint,
  toLocalBlockRange,
  buildTimelineGrid,
  placeTimelineRange,
  validateTimelinePlacement,
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
    version: 1,
  }
}

describe("manual scheduling UI helpers", () => {
  it("builds a full-day quarter-hour grid with start-relative emphasis", () => {
    const markers = buildTimelineGrid({ ...preference, day_start_minutes: 0, day_end_minutes: 1440 })
    expect(markers).toHaveLength(97)
    expect(markers[0]).toEqual({ minutes: 0, emphasis: "hour" })
    expect(markers[2]).toEqual({ minutes: 30, emphasis: "half" })
    expect(markers[1]).toEqual({ minutes: 15, emphasis: "quarter" })
    expect(markers[4]).toEqual({ minutes: 60, emphasis: "hour" })
    const offset = buildTimelineGrid({ ...preference, day_start_minutes: 490, day_end_minutes: 603 })
    expect(offset.at(-1)).toEqual({ minutes: 603, emphasis: "quarter" })
    expect(offset[2]).toEqual({ minutes: 520, emphasis: "half" })
  })

  it("places create and move ranges while preserving duration and clamping", () => {
    expect(placeTimelineRange("move", 570, { start: 510, end: 570 }, preference)).toEqual({ start: 540, end: 600 })
    expect(placeTimelineRange("create", 599, { start: 510, end: 570 }, preference)).toEqual({ start: 540, end: 600 })
    const offset = { ...preference, day_start_minutes: 490, day_end_minutes: 603 }
    expect(placeTimelineRange("move", 603, { start: 520, end: 550 }, offset)).toEqual({ start: 565, end: 595 })
    expect(placeTimelineRange("create", 500, { start: 500, end: 500 }, preference)).toEqual({ start: 495, end: 495 })
    expect(placeTimelineRange("move", 500, { start: 400, end: 700 }, preference)).toEqual({ start: 495, end: 795 })
  })

  it("resizes each edge without going below one slot or outside the plan", () => {
    expect(placeTimelineRange("resize-start", 555, { start: 510, end: 570 }, preference)).toEqual({ start: 555, end: 570 })
    expect(placeTimelineRange("resize-end", 510, { start: 510, end: 570 }, preference)).toEqual({ start: 510, end: 525 })
    expect(placeTimelineRange("resize-start", 599, { start: 510, end: 525 }, preference)).toEqual({ start: 510, end: 525 })
    const offset = { ...preference, day_start_minutes: 490, day_end_minutes: 603 }
    expect(placeTimelineRange("resize-end", 603, { start: 565, end: 595 }, offset)).toEqual({ start: 565, end: 595 })
  })

  it("validates boundaries, budget, DST, and half-open conflicts", () => {
    const valid = validateTimelinePlacement({ date: "2026-08-23", range: { start: 510, end: 540 }, preference, blocks: [] })
    expect(valid).toMatchObject({ ok: true, range: { start: 510, end: 540 }, interval: { startMinutes: 510, endMinutes: 540 } })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 510, end: 540 }, preference, blocks: [block("2026-08-23T00:30:00.000Z", "2026-08-23T01:00:00.000Z")] })).toMatchObject({ ok: false, code: "conflict", message: "该时间与其他时间块冲突" })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 540, end: 570 }, preference, blocks: [block("2026-08-23T00:30:00.000Z", "2026-08-23T01:00:00.000Z")] })).toMatchObject({ ok: true })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 510, end: 540 }, preference, blocks: [block("2026-08-23T00:30:00.000Z", "2026-08-23T01:00:00.000Z")] , ignoredBlockId: "2026-08-23T00:30:00.000Z-scheduled" })).toMatchObject({ ok: true })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 510, end: 540 }, preference, blocks: [], maximumDurationMinutes: 15 })).toMatchObject({ ok: false, code: "budget" })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 450, end: 540 }, preference, blocks: [] })).toMatchObject({ ok: false, code: "out-of-bounds" })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 480, end: 470 }, preference, blocks: [] })).toMatchObject({ ok: false, code: "out-of-bounds" })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 510, end: 510 }, preference, blocks: [] })).toMatchObject({ ok: false, code: "too-short" })
    expect(validateTimelinePlacement({ date: "2026-03-08", range: { start: 150, end: 180 }, preference: { ...preference, timezone: "America/New_York", day_start_minutes: 0, day_end_minutes: 600 }, blocks: [] })).toMatchObject({ ok: false, code: "invalid-local-time" })
    expect(() => validateTimelinePlacement({ date: "2026-08-23", range: { start: 481, end: 511 }, preference, blocks: [] })).toThrow("timeline range must align to 15-minute slots")
    expect(() => validateTimelinePlacement({ date: "2026-08-23", range: { start: 480, end: 510 }, preference: { ...preference, timezone: "Mars/Olympus" }, blocks: [] })).toThrow("timezone")
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 480, end: 510 }, preference, blocks: [block("bad", "2026-08-23T00:30:00.000Z")] })).toMatchObject({ ok: false, code: "conflict" })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 480, end: 510 }, preference, blocks: [block("2026-08-23T02:00:00.000Z", "2026-08-23T01:00:00.000Z")] })).toMatchObject({ ok: false, code: "conflict" })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 480, end: 510 }, preference, blocks: [block("2026-08-24T00:00:00.000Z", "2026-08-24T01:00:00.000Z")] })).toMatchObject({ ok: true })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 480, end: 510 }, preference, blocks: [block("2026-08-22T15:30:00.000Z", "2026-08-23T01:00:00.000Z")] })).toMatchObject({ ok: false, code: "conflict" })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 480, end: 510 }, preference, blocks: [block("2026-08-23T00:30:00.000Z", "2026-08-23T01:00:00.000Z", "skipped")] })).toMatchObject({ ok: true })
    expect(validateTimelinePlacement({ date: "2026-08-23", range: { start: 480, end: 510 }, preference, blocks: [block("2026-08-23T00:30:00.000Z", "2026-08-23T01:00:00.000Z", "cancelled")] })).toMatchObject({ ok: true })
  })
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

  it("uses a day-start-relative grid and floors an unaligned latest start", () => {
    const offsetPreference = {
      ...preference,
      day_start_minutes: 490,
      day_end_minutes: 603,
    }
    expect(minuteFromTimelinePoint(999, { top: 100, height: 300 }, offsetPreference, 30)).toBe(565)
    expect((565 - offsetPreference.day_start_minutes) % 15).toBe(0)
    expect(localTimeRangeToUtc("2026-08-23", "08:10", "09:10", offsetPreference)).toEqual(expect.objectContaining({
      start_at: "2026-08-23T00:10:00.000Z",
      end_at: "2026-08-23T01:10:00.000Z",
    }))
    expect(durationForCandidate(999, offsetPreference)).toBe(105)
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

  it("reports no space when the planning window is shorter than one slot", () => {
    expect(findNextFreeStart("2026-08-23", 15, {
      ...preference,
      day_start_minutes: 490,
      day_end_minutes: 500,
    }, [])).toBeNull()
  })

  it("skips nonexistent and ambiguous wall-clock slots while scanning", () => {
    expect(findNextFreeStart("2026-03-08", 30, {
      ...preference,
      timezone: "America/New_York",
      day_start_minutes: 150,
      day_end_minutes: 240,
    }, [])).toBe(180)
    expect(findNextFreeStart("2026-11-01", 30, {
      ...preference,
      timezone: "America/New_York",
      day_start_minutes: 60,
      day_end_minutes: 180,
    }, [])).toBe(120)
  })

  it("moves a preferred drop forward to a fully valid DST-safe interval", () => {
    const newYorkPreference = {
      ...preference,
      timezone: "America/New_York",
      day_start_minutes: 0,
      day_end_minutes: 600,
    }
    expect(findValidStartAtOrAfter("2026-03-08", 150, 60, newYorkPreference)).toBe(180)
    expect(findValidStartAtOrAfter("2026-11-01", 60, 60, newYorkPreference)).toBe(120)
    expect(findValidStartAtOrAfter("2026-03-08", 105, 75, newYorkPreference)).toBe(180)
    expect(findValidStartAtOrAfter("2026-03-08", 150, 30, {
      ...newYorkPreference,
      day_end_minutes: 180,
    })).toBeNull()
  })

  it("keeps checking conflicts after DST-invalid candidate slots", () => {
    const springPreference = {
      ...preference,
      timezone: "America/New_York",
      day_start_minutes: 105,
      day_end_minutes: 360,
    }
    expect(findNextFreeStart("2026-03-08", 75, springPreference, [block(
      "2026-03-08T07:00:00.000Z",
      "2026-03-08T08:15:00.000Z",
    )])).toBe(255)
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

  it("rejects intervals whose elapsed UTC duration changes across DST", () => {
    const newYorkPreference = {
      ...preference,
      timezone: "America/New_York",
      day_start_minutes: 0,
      day_end_minutes: 600,
    }
    expect(() => localTimeRangeToUtc(
      "2026-03-08",
      "01:45",
      "03:00",
      newYorkPreference,
    )).toThrow("跨夏令时转换，实际时长不一致")
    expect(() => localTimeRangeToUtc(
      "2026-11-01",
      "00:45",
      "02:00",
      newYorkPreference,
    )).toThrow("跨夏令时转换，实际时长不一致")
  })

  it("maps the next existing local-date start to minute 1440 even when DST skips midnight", () => {
    expect(toLocalBlockRange(
      "2026-03-07T14:00:00.000Z",
      "2026-03-08T05:00:00.000Z",
      "America/Havana",
      "2026-03-07",
    )).toEqual({ start: 540, end: 1440 })
    expect(toLocalBlockRange(
      "2026-08-23T01:00:00.000Z",
      "2026-08-23T16:00:00.000Z",
      "Asia/Shanghai",
      "2026-08-23",
    )).toEqual({ start: 540, end: 1440 })
    expect(() => toLocalBlockRange(
      "2026-03-07T14:00:00.000Z",
      "2026-03-08T06:00:00.000Z",
      "America/Havana",
      "2026-03-07",
    )).toThrow("时间块不能跨本地日期")
  })

  it("accepts an aligned 24:00 editor end and rejects an unaligned planning boundary", () => {
    expect(localTimeRangeToUtc("2026-08-23", "23:45", "24:00", {
      ...preference,
      day_end_minutes: 1440,
    })).toEqual(expect.objectContaining({
      start_at: "2026-08-23T15:45:00.000Z",
      end_at: "2026-08-23T16:00:00.000Z",
    }))
    expect(() => localTimeRangeToUtc("2026-08-23", "09:55", "10:03", {
      ...preference,
      day_start_minutes: 490,
      day_end_minutes: 603,
    })).toThrow("15 分钟刻度")
  })

  it("keeps ordinary and midnight-skipping 24:00 intervals at their wall-clock duration", () => {
    expect(localTimeRangeToUtc("2026-08-23", "23:45", "24:00", {
      ...preference,
      day_end_minutes: 1440,
    })).toEqual(expect.objectContaining({
      start_at: "2026-08-23T15:45:00.000Z",
      end_at: "2026-08-23T16:00:00.000Z",
    }))
    expect(localTimeRangeToUtc("2026-03-07", "23:45", "24:00", {
      ...preference,
      timezone: "America/Havana",
      day_start_minutes: 0,
      day_end_minutes: 1440,
    })).toEqual(expect.objectContaining({
      start_at: "2026-03-08T04:45:00.000Z",
      end_at: "2026-03-08T05:00:00.000Z",
    }))
  })
})
