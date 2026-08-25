import { describe, expect, it, vi } from "vitest"
import type { Prisma } from "@prisma/client"

import {
  buildGoalPositionUpdates,
  createGoalAtEnd,
  getNextGoalPosition,
  validateGoalOrder,
} from "./goal-order"

describe("goal-order", () => {
  it("appends after the current maximum and starts an empty collection at zero", () => {
    expect(getNextGoalPosition(null)).toBe(0)
    expect(getNextGoalPosition(undefined)).toBe(0)
    expect(getNextGoalPosition(4)).toBe(5)
  })

  it("creates an allowlisted goal after locking and reading the current maximum", async () => {
    const events: string[] = []
    const transactionMock = {
      $executeRaw: vi.fn(async () => {
        events.push("lock")
      }),
      goal: {
        aggregate: vi.fn(async () => {
          events.push("aggregate")
          return { _max: { position: 3 } }
        }),
        create: vi.fn(async ({ data }: { data: Prisma.GoalCreateInput }) => {
          events.push("create")
          return data
        }),
      },
    }
    const databaseMock = {
      $transaction: vi.fn(async (callback: (tx: typeof transactionMock) => unknown) => callback(transactionMock)),
    }

    // @ts-expect-error The focused test double provides only the Prisma methods this helper uses.
    const goal = await createGoalAtEnd(databaseMock, {
      name: "新目标",
      tag: "work",
      description: "说明",
    })

    expect(events).toEqual(["lock", "aggregate", "create"])
    expect(transactionMock.goal.aggregate).toHaveBeenCalledWith({ _max: { position: true } })
    expect(transactionMock.goal.create).toHaveBeenCalledWith({
      data: {
        goal_id: expect.stringMatching(/^goal_[a-z0-9]{10}$/),
        name: "新目标",
        tag: "work",
        description: "说明",
        position: 4,
      },
    })
    expect(goal).toEqual(expect.objectContaining({ name: "新目标", tag: "work", position: 4 }))
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
