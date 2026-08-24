import { describe, expect, it } from "vitest"

import { normalizePlanTiming } from "./plan-input"

describe("plan timing input", () => {
  it("defaults a new ordinary plan total and preserves block inheritance", () => {
    expect(normalizePlanTiming({}, { mode: "create" })).toEqual({
      is_recurring: false,
      estimated_minutes: 60,
    })
  })

  it("accepts aligned ordinary totals and an explicit override", () => {
    expect(
      normalizePlanTiming(
        { estimated_minutes: 300, default_block_minutes: 45 },
        { mode: "create" },
      ),
    ).toEqual({
      is_recurring: false,
      estimated_minutes: 300,
      default_block_minutes: 45,
    })
  })

  it("rejects totals on recurring plans and unaligned values", () => {
    expect(() =>
      normalizePlanTiming(
        { is_recurring: true, estimated_minutes: 60 },
        { mode: "create" },
      ),
    ).toThrow("周期计划不能设置总预计投入")
    expect(() =>
      normalizePlanTiming({ estimated_minutes: 50 }, { mode: "create" }),
    ).toThrow("15 分钟")
  })

  it("clears total when switching to recurring and creates one when switching back", () => {
    expect(
      normalizePlanTiming(
        { is_recurring: true },
        { mode: "update", currentIsRecurring: false },
      ),
    ).toEqual({ is_recurring: true, estimated_minutes: null })
    expect(
      normalizePlanTiming(
        { is_recurring: false },
        { mode: "update", currentIsRecurring: true },
      ),
    ).toEqual({ is_recurring: false, estimated_minutes: 60 })
  })

  it.each([null, [], "plan", 42, false, new Date()])(
    "rejects non-plain input %j",
    input => {
      expect(() => normalizePlanTiming(input, { mode: "create" })).toThrow(
        "计划输入必须是普通对象",
      )
    },
  )

  it.each([null, "false", 1, undefined])(
    "rejects non-boolean recurring state %j",
    is_recurring => {
      expect(() =>
        normalizePlanTiming({ is_recurring }, { mode: "create" }),
      ).toThrow("is_recurring 必须是布尔值")
    },
  )

  it("allows an inherited default block and ignores non-timing keys", () => {
    expect(
      normalizePlanTiming(
        {
          name: "准备发布",
          default_block_minutes: null,
        },
        { mode: "create" },
      ),
    ).toEqual({
      is_recurring: false,
      estimated_minutes: 60,
      default_block_minutes: null,
    })

    expect(
      normalizePlanTiming(
        { default_block_minutes: "" },
        { mode: "update", currentIsRecurring: false },
      ),
    ).toEqual({ default_block_minutes: null })
  })

  it("defaults a cleared ordinary create total but rejects clearing it on update", () => {
    expect(
      normalizePlanTiming(
        { estimated_minutes: null },
        { mode: "create" },
      ),
    ).toEqual({ is_recurring: false, estimated_minutes: 60 })
    expect(
      normalizePlanTiming(
        { estimated_minutes: "" },
        { mode: "create" },
      ),
    ).toEqual({ is_recurring: false, estimated_minutes: 60 })

    expect(() =>
      normalizePlanTiming(
        { estimated_minutes: null },
        { mode: "update", currentIsRecurring: false },
      ),
    ).toThrow("非周期计划必须设置总预计投入")
  })

  it("leaves omitted update fields untouched", () => {
    expect(
      normalizePlanTiming(
        { name: "只改名称" },
        { mode: "update", currentIsRecurring: false },
      ),
    ).toEqual({})
    expect(
      normalizePlanTiming(
        { default_block_minutes: 45 },
        { mode: "update", currentIsRecurring: false },
      ),
    ).toEqual({ default_block_minutes: 45 })
  })

  it("preserves an aligned total when switching back to ordinary", () => {
    expect(
      normalizePlanTiming(
        { is_recurring: false, estimated_minutes: 300 },
        { mode: "update", currentIsRecurring: true },
      ),
    ).toEqual({ is_recurring: false, estimated_minutes: 300 })
  })

  it("allows recurring block defaults but rejects any non-null recurring total", () => {
    expect(
      normalizePlanTiming(
        { is_recurring: true, default_block_minutes: 45 },
        { mode: "create" },
      ),
    ).toEqual({
      is_recurring: true,
      estimated_minutes: null,
      default_block_minutes: 45,
    })
    expect(
      normalizePlanTiming(
        { is_recurring: true, estimated_minutes: null },
        { mode: "create" },
      ),
    ).toEqual({ is_recurring: true, estimated_minutes: null })
    expect(
      normalizePlanTiming(
        { estimated_minutes: null },
        { mode: "update", currentIsRecurring: true },
      ),
    ).toEqual({ estimated_minutes: null })
    expect(() =>
      normalizePlanTiming(
        { estimated_minutes: 60 },
        { mode: "update", currentIsRecurring: true },
      ),
    ).toThrow("周期计划不能设置总预计投入")
  })

  it.each([
    ["estimated_minutes", 0],
    ["estimated_minutes", -15],
    ["estimated_minutes", 1.5],
    ["estimated_minutes", 2_147_483_648],
    ["estimated_minutes", 50],
    ["estimated_minutes", undefined],
    ["default_block_minutes", 0],
    ["default_block_minutes", -15],
    ["default_block_minutes", 1.5],
    ["default_block_minutes", 2_147_483_648],
    ["default_block_minutes", 50],
    ["default_block_minutes", undefined],
  ])("rejects invalid %s value %j", (field, value) => {
    expect(() =>
      normalizePlanTiming({ [field]: value }, { mode: "create" }),
    ).toThrow()
  })
})
