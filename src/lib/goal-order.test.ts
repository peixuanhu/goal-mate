import { describe, expect, it } from "vitest"

import {
  buildGoalPositionUpdates,
  getNextGoalPosition,
  validateGoalOrder,
} from "./goal-order"

describe("goal-order", () => {
  it("appends after the current maximum and starts an empty collection at zero", () => {
    expect(getNextGoalPosition(null)).toBe(0)
    expect(getNextGoalPosition(undefined)).toBe(0)
    expect(getNextGoalPosition(4)).toBe(5)
  })

  it("normalizes an ordered id list into contiguous zero-based positions", () => {
    expect(buildGoalPositionUpdates(["goal_c", "goal_a", "goal_b"])).toEqual([
      { goal_id: "goal_c", position: 0 },
      { goal_id: "goal_a", position: 1 },
      { goal_id: "goal_b", position: 2 },
    ])
  })

  it("accepts the exact current goal collection", () => {
    expect(validateGoalOrder({
      ordered_goal_ids: ["goal_b", "goal_a"],
      currentGoals: [{ goal_id: "goal_a" }, { goal_id: "goal_b" }],
    })).toEqual({ ok: true })
  })

  it("rejects duplicates as invalid input", () => {
    expect(validateGoalOrder({
      ordered_goal_ids: ["goal_a", "goal_a"],
      currentGoals: [{ goal_id: "goal_a" }],
    })).toEqual({ ok: false, kind: "invalid", error: "ordered_goal_ids must not contain duplicates" })
  })

  it.each([
    [["goal_a"], [{ goal_id: "goal_a" }, { goal_id: "goal_b" }]],
    [["goal_a", "goal_unknown"], [{ goal_id: "goal_a" }, { goal_id: "goal_b" }]],
  ])("treats incomplete or unknown ids as a stale collection", (ordered_goal_ids, currentGoals) => {
    expect(validateGoalOrder({ ordered_goal_ids, currentGoals })).toEqual({
      ok: false,
      kind: "conflict",
      error: "目标集合已变化，请刷新后重试",
    })
  })
})
