import { describe, expect, it } from "vitest"

import {
  GOAL_POSITION_STEP,
  buildGoalPositionUpdates,
  getNextGoalPosition,
  validateGoalPlanOrder,
} from "./plan-goal-utils"

describe("plan-goal-utils", () => {
  it("calculates the first and next sparse positions", () => {
    expect(GOAL_POSITION_STEP).toBe(1000)
    expect(getNextGoalPosition(null)).toBe(1000)
    expect(getNextGoalPosition(undefined)).toBe(1000)
    expect(getNextGoalPosition(3000)).toBe(4000)
  })

  it("builds stable sparse position updates from ordered plan ids", () => {
    expect(buildGoalPositionUpdates(["plan_a", "plan_b", "plan_c"])).toEqual([
      { plan_id: "plan_a", goal_position: 1000 },
      { plan_id: "plan_b", goal_position: 2000 },
      { plan_id: "plan_c", goal_position: 3000 },
    ])
  })

  it("accepts a complete same-goal ordering", () => {
    const result = validateGoalPlanOrder({
      goal_id: "goal_music",
      ordered_plan_ids: ["plan_a", "plan_b"],
      currentPlans: [
        { plan_id: "plan_a", goal_id: "goal_music" },
        { plan_id: "plan_b", goal_id: "goal_music" },
      ],
    })

    expect(result).toEqual({ ok: true })
  })

  it("rejects duplicate plan ids", () => {
    const result = validateGoalPlanOrder({
      goal_id: "goal_music",
      ordered_plan_ids: ["plan_a", "plan_a"],
      currentPlans: [{ plan_id: "plan_a", goal_id: "goal_music" }],
    })

    expect(result).toEqual({ ok: false, error: "ordered_plan_ids must not contain duplicates" })
  })

  it("rejects incomplete ordering lists", () => {
    const result = validateGoalPlanOrder({
      goal_id: "goal_music",
      ordered_plan_ids: ["plan_a"],
      currentPlans: [
        { plan_id: "plan_a", goal_id: "goal_music" },
        { plan_id: "plan_b", goal_id: "goal_music" },
      ],
    })

    expect(result).toEqual({ ok: false, error: "ordered_plan_ids must include every plan for this goal" })
  })

  it("rejects plan ids that do not belong to the goal", () => {
    const result = validateGoalPlanOrder({
      goal_id: "goal_music",
      ordered_plan_ids: ["plan_a", "plan_other"],
      currentPlans: [{ plan_id: "plan_a", goal_id: "goal_music" }],
    })

    expect(result).toEqual({ ok: false, error: "ordered_plan_ids contains a plan outside this goal" })
  })
})
