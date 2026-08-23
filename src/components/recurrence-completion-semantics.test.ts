import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { formatGoalPlanProgress } from "./goals/goal-plan-list"
import { formatFocusPlanProgress } from "./focus-period/focus-overview"
import { isQuadrantPlanCompleted } from "./quadrant-left-sidebar"

const partialRecord = {
  gmt_create: new Date(2026, 7, 23, 9).toISOString(),
  counts_toward_recurrence: false,
}
const legacyRecord = {
  gmt_create: new Date(2026, 7, 23, 10).toISOString(),
}

function goalPlan(progressRecords: Array<typeof partialRecord | typeof legacyRecord>) {
  return {
    plan_id: "plan_daily",
    name: "每日复盘",
    difficulty: "medium",
    progress: 0,
    is_recurring: true,
    recurrence_type: "daily",
    recurrence_value: "1",
    tags: [],
    progressRecords,
  }
}

function focusPlan(progressRecords: Array<typeof partialRecord | typeof legacyRecord>) {
  return {
    plan_id: "plan_daily",
    name: "每日复盘",
    difficulty: "medium",
    progress: 0,
    is_recurring: true,
    recurrence_type: "daily",
    recurrence_value: "1",
    progressRecords,
  }
}

function quadrantPlan(progressRecords: Array<typeof partialRecord | typeof legacyRecord>) {
  return {
    plan_id: "plan_daily",
    name: "每日复盘",
    description: null,
    progress: 0,
    difficulty: "medium",
    tags: [],
    priority_quadrant: "q2",
    is_scheduled: true,
    is_recurring: true,
    recurrence_type: "daily",
    recurrence_value: "1",
    progressRecords,
  }
}

describe("recurrence completion consumers", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 23, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps a recurring plan at 0/1 when its only record is partial", () => {
    expect(formatGoalPlanProgress(goalPlan([partialRecord]))).toContain("0/1")
    expect(formatFocusPlanProgress(focusPlan([partialRecord]))).toContain("0/1")
    expect(isQuadrantPlanCompleted(quadrantPlan([partialRecord]))).toBe(false)
  })

  it("continues counting legacy records whose flag is undefined", () => {
    expect(formatGoalPlanProgress(goalPlan([legacyRecord]))).toContain("1/1")
    expect(formatFocusPlanProgress(focusPlan([legacyRecord]))).toContain("1/1")
    expect(isQuadrantPlanCompleted(quadrantPlan([legacyRecord]))).toBe(true)
  })
})
