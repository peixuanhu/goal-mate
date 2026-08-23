import { describe, expect, it } from "vitest"

import { SCHEDULE_BLOCK_RELATIONS, toScheduleBlockView } from "./schedule-block-view"

describe("schedule block view projection", () => {
  it("exports the shared narrow relation shape", () => {
    expect(SCHEDULE_BLOCK_RELATIONS).toEqual({
      plan: {
        select: {
          plan_id: true,
          name: true,
          energy_level: true,
          goal: { select: { goal_id: true, name: true } },
        },
      },
      action: {
        select: {
          action_id: true,
          plan_id: true,
          name: true,
          energy_level: true,
          is_completed: true,
        },
      },
    })
  })

  it("projects normalized rendering data without mutation dependencies", () => {
    expect(toScheduleBlockView({
      block_id: "block_1",
      plan_id: "plan_1",
      action_id: "action_1",
      start_at: new Date("2026-08-23T01:00:00.000Z"),
      end_at: new Date("2026-08-23T02:00:00.000Z"),
      status: "scheduled",
      source: "manual",
      result_note: null,
      version: 3,
      plan: {
        plan_id: "plan_1",
        name: "计划",
        energy_level: "low",
        goal: { goal_id: "goal_1", name: "目标" },
      },
      action: {
        action_id: "action_1",
        plan_id: "plan_1",
        name: "行动",
        energy_level: "high",
        is_completed: false,
      },
    })).toEqual(expect.objectContaining({
      block_id: "block_1",
      title: "行动",
      goal_name: "目标",
      energy_level: "high",
      start_at: "2026-08-23T01:00:00.000Z",
      version: 3,
    }))
  })
})
