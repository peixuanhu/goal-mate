import { describe, expect, it } from "vitest"

import {
  calculatePlanTimeBudget,
  type PlanTimeBudgetInput,
} from "./time-budget"

const start = new Date("2026-08-25T00:00:00.000Z")
const block = (
  minutes: number,
  status: "scheduled" | "completed" | "partial" | "skipped" | "cancelled",
  action_id: string | null = null,
) => ({
  block_id: `${status}-${action_id ?? "plan"}-${minutes}`,
  action_id,
  status,
  start_at: start,
  end_at: new Date(start.getTime() + minutes * 60_000),
})

describe("plan time budgets", () => {
  it("counts completed and partial blocks only", () => {
    const result = calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 300,
      default_block_minutes: 60,
      actions: [],
      blocks: [
        block(60, "completed"),
        block(45, "partial"),
        block(30, "scheduled"),
        block(30, "skipped"),
      ],
    }, 45)

    expect(result).toMatchObject({
      invested_minutes: 105,
      remaining_minutes: 195,
      unallocated_remaining_minutes: 195,
      suggested_block_minutes: null,
      budget_status: "ok",
      has_scheduled_direct_block: true,
    })
  })

  it("reserves open action remainder and releases an early-completed action", () => {
    const result = calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 300,
      default_block_minutes: 60,
      actions: [
        { action_id: "open", estimated_minutes: 120, is_completed: false },
        { action_id: "done", estimated_minutes: 90, is_completed: true },
      ],
      blocks: [block(30, "partial", "open"), block(45, "completed", "done")],
    }, 60)

    expect(result.actions.open).toMatchObject({
      invested_minutes: 30,
      remaining_minutes: 90,
      suggested_block_minutes: 60,
    })
    expect(result.actions.done).toMatchObject({
      invested_minutes: 45,
      remaining_minutes: 45,
      suggested_block_minutes: null,
    })
    expect(result.reserved_action_minutes).toBe(90)
    expect(result.unallocated_remaining_minutes).toBe(135)
  })

  it("exhausts an action after a full partial block", () => {
    const result = calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 75,
      default_block_minutes: null,
      actions: [{ action_id: "draft", estimated_minutes: 45, is_completed: false }],
      blocks: [block(45, "partial", "draft")],
    }, 30)

    expect(result.actions.draft).toMatchObject({
      remaining_minutes: 0,
      suggested_block_minutes: null,
    })
    expect(result.suggested_block_minutes).toBe(30)
  })

  it("uses per-occurrence duration for recurring plans without a total", () => {
    expect(calculatePlanTimeBudget({
      is_recurring: true,
      estimated_minutes: null,
      default_block_minutes: null,
      actions: [],
      blocks: [],
    }, 45)).toMatchObject({
      effective_default_block_minutes: 45,
      remaining_minutes: null,
      suggested_block_minutes: 45,
    })
  })

  it("does not suggest duplicate scheduled direct or action blocks", () => {
    const result = calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 180,
      default_block_minutes: 60,
      actions: [{ action_id: "write", estimated_minutes: 90, is_completed: false }],
      blocks: [block(30, "scheduled"), block(45, "scheduled", "write")],
    }, 45)

    expect(result).toMatchObject({
      has_scheduled_direct_block: true,
      suggested_block_minutes: null,
    })
    expect(result.actions.write).toMatchObject({
      has_scheduled_block: true,
      suggested_block_minutes: null,
    })
  })

  it("reports an overrun when invested or reserved time exceeds the total", () => {
    const investedOverrun = calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 30,
      default_block_minutes: 60,
      actions: [],
      blocks: [block(45, "completed")],
    }, 45)
    const reservedOverrun = calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 60,
      default_block_minutes: 45,
      actions: [{ action_id: "large", estimated_minutes: 90, is_completed: false }],
      blocks: [],
    }, 45)

    expect(investedOverrun).toMatchObject({
      remaining_minutes: 0,
      unallocated_remaining_minutes: 0,
      suggested_block_minutes: null,
      budget_status: "overrun",
    })
    expect(reservedOverrun).toMatchObject({
      reserved_action_minutes: 90,
      unallocated_remaining_minutes: 0,
      suggested_block_minutes: null,
      budget_status: "overrun",
    })
  })

  it("uses the effective plan default for actions without estimates", () => {
    const result = calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 120,
      default_block_minutes: 75,
      actions: [{ action_id: "inherited", estimated_minutes: null, is_completed: false }],
      blocks: [],
    }, 45)

    expect(result.actions.inherited).toMatchObject({
      estimated_minutes: 75,
      remaining_minutes: 75,
      suggested_block_minutes: 75,
    })
  })

  it("keeps recurring plans total-free and suppresses a second direct suggestion", () => {
    const result = calculatePlanTimeBudget({
      is_recurring: true,
      estimated_minutes: null,
      default_block_minutes: 30,
      actions: [{ action_id: "repeat", estimated_minutes: 75, is_completed: false }],
      blocks: [block(30, "scheduled"), block(15, "partial", "repeat")],
    }, 45)

    expect(result).toMatchObject({
      remaining_minutes: null,
      reserved_action_minutes: 60,
      unallocated_remaining_minutes: null,
      suggested_block_minutes: null,
      budget_status: "ok",
      has_scheduled_direct_block: true,
    })
    expect(result.actions.repeat).toMatchObject({
      invested_minutes: 15,
      remaining_minutes: 60,
      suggested_block_minutes: 30,
    })
  })

  it("rejects invalid counted intervals", () => {
    expect(() => calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 60,
      default_block_minutes: 30,
      actions: [],
      blocks: [{
        ...block(30, "completed"),
        end_at: new Date("invalid"),
      }],
    }, 30)).toThrow(/completed-plan-30.*valid dates/i)

    expect(() => calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 60,
      default_block_minutes: 30,
      actions: [],
      blocks: [{
        ...block(30, "partial"),
        end_at: start,
      }],
    }, 30)).toThrow(/partial-plan-30.*end after it starts/i)
  })

  it("normalizes invested legacy elapsed time conservatively onto the 15-minute lattice", () => {
    const result = calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 180,
      default_block_minutes: 60,
      actions: [],
      blocks: [
        {
          ...block(60, "completed"),
          block_id: "legacy-millisecond-drift",
          end_at: new Date(start.getTime() + 60 * 60_000 + 1),
        },
        {
          ...block(50, "partial"),
          block_id: "legacy-off-slot-duration",
        },
      ],
    }, 60)

    expect(result).toMatchObject({
      invested_minutes: 120,
      remaining_minutes: 60,
      unallocated_remaining_minutes: 60,
      suggested_block_minutes: 60,
    })
    expect([
      result.effective_default_block_minutes,
      result.invested_minutes,
      result.remaining_minutes,
      result.unallocated_remaining_minutes,
      result.suggested_block_minutes,
    ].every(value => value === null || value % 15 === 0)).toBe(true)
  })

  it("rejects blocks that reference an unknown action", () => {
    expect(() => calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 60,
      default_block_minutes: 30,
      actions: [],
      blocks: [block(30, "scheduled", "missing")],
    }, 30)).toThrow(/missing.*unknown action/i)
  })

  it("rejects invalid default duration candidates", () => {
    const input = {
      is_recurring: false,
      estimated_minutes: 60,
      default_block_minutes: 0,
      actions: [],
      blocks: [],
    } satisfies PlanTimeBudgetInput

    expect(() => calculatePlanTimeBudget(input, 30)).toThrow(/plan default block minutes.*positive safe integer/i)
    expect(() => calculatePlanTimeBudget({ ...input, default_block_minutes: null }, 22.5))
      .toThrow(/preference default block minutes.*positive safe integer/i)
  })

  it("rejects inherited and plan default blocks outside 15-minute increments", () => {
    const input = {
      is_recurring: false,
      estimated_minutes: 60,
      default_block_minutes: null,
      actions: [],
      blocks: [],
    } satisfies PlanTimeBudgetInput

    expect(() => calculatePlanTimeBudget(input, 50))
      .toThrow(/preference default block minutes.*15-minute increments/i)
    expect(() => calculatePlanTimeBudget({ ...input, default_block_minutes: 50 }, 60))
      .toThrow(/plan default block minutes.*15-minute increments/i)
  })

  it("rejects plan and action estimates outside the 15-minute lattice", () => {
    expect(() => calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 50,
      default_block_minutes: 60,
      actions: [],
      blocks: [],
    }, 60)).toThrow(/ordinary plan estimated minutes.*15-minute increments/i)

    expect(() => calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 120,
      default_block_minutes: 60,
      actions: [{ action_id: "off-slot", estimated_minutes: 50, is_completed: false }],
      blocks: [],
    }, 60)).toThrow(/action off-slot estimated minutes.*15-minute increments/i)
  })

  it("rejects duplicate action IDs before they can overwrite and reserve twice", () => {
    expect(() => calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 180,
      default_block_minutes: 60,
      actions: [
        { action_id: "duplicate-action", estimated_minutes: 60, is_completed: false },
        { action_id: "duplicate-action", estimated_minutes: 90, is_completed: false },
      ],
      blocks: [],
    }, 60)).toThrow(/duplicate action id.*duplicate-action/i)
  })

  it("rejects duplicate block IDs before they can count invested time twice", () => {
    const duplicateBlock = block(30, "completed")

    expect(() => calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 120,
      default_block_minutes: 60,
      actions: [],
      blocks: [duplicateBlock, { ...duplicateBlock }],
    }, 60)).toThrow(/duplicate block id.*completed-plan-30/i)
  })

  it("rejects totals that disagree with the plan recurrence type at runtime", () => {
    const ordinaryWithoutTotal = {
      is_recurring: false,
      estimated_minutes: null,
      default_block_minutes: 60,
      actions: [],
      blocks: [],
    } as unknown as PlanTimeBudgetInput
    const recurringWithTotal = {
      is_recurring: true,
      estimated_minutes: 120,
      default_block_minutes: 60,
      actions: [],
      blocks: [],
    } as unknown as PlanTimeBudgetInput

    expect(() => calculatePlanTimeBudget(ordinaryWithoutTotal, 60))
      .toThrow(/ordinary plan estimated minutes.*positive safe integer/i)
    expect(() => calculatePlanTimeBudget(recurringWithTotal, 60))
      .toThrow(/recurring plan estimated minutes.*null/i)
  })

  it("rejects unsafe or non-positive estimates", () => {
    expect(() => calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: Number.MAX_SAFE_INTEGER + 1,
      default_block_minutes: 60,
      actions: [],
      blocks: [],
    }, 60)).toThrow(/ordinary plan estimated minutes.*positive safe integer/i)

    expect(() => calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 120,
      default_block_minutes: 60,
      actions: [{ action_id: "invalid-estimate", estimated_minutes: 0, is_completed: false }],
      blocks: [],
    }, 60)).toThrow(/action invalid-estimate estimated minutes.*positive safe integer/i)
  })

  it("rejects unsafe default duration candidates", () => {
    expect(() => calculatePlanTimeBudget({
      is_recurring: false,
      estimated_minutes: 120,
      default_block_minutes: Number.MAX_SAFE_INTEGER + 1,
      actions: [],
      blocks: [],
    }, 60)).toThrow(/plan default block minutes.*positive safe integer/i)
  })
})
