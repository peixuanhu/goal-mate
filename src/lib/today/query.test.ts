import { beforeEach, describe, expect, it, vi } from "vitest"

import { loadTodayView, type TodayQueryDb } from "./query"

const preferenceRow = {
  preference_id: "default",
  timezone: "Asia/Shanghai",
  day_start_minutes: 480,
  day_end_minutes: 1320,
  high_energy_start_minutes: 540,
  high_energy_end_minutes: 720,
  buffer_minutes: 15,
  default_block_minutes: 60,
  capacity_warning_minutes: 480,
  gmt_modified: new Date("2026-08-23T01:00:00.000Z"),
}

const launchGoal = {
  goal_id: "goal_product",
  name: "发布 Goal Mate v1",
  tag: "product",
}

const openPlan = {
  plan_id: "plan_launch",
  goal_id: "goal_product",
  name: "准备发布",
  progress: 0.5,
  is_recurring: false,
  due_date: new Date("2026-09-03T00:00:00.000Z"),
  estimated_minutes: 120,
  energy_level: "high",
  priority_quadrant: "q2",
  gmt_create: new Date("2026-08-20T00:00:00.000Z"),
  gmt_modified: new Date("2026-08-23T02:00:00.000Z"),
  goal: launchGoal,
  tags: [{ tag: "launch" }],
  actionItems: [
    {
      action_id: "action_copy",
      plan_id: "plan_launch",
      position: 1000,
      name: "写发布说明",
      due_date: new Date("2026-09-01T00:00:00.000Z"),
      estimated_minutes: 60,
      energy_level: "medium",
      priority_quadrant: "q1",
      is_completed: false,
      gmt_create: new Date("2026-08-21T00:00:00.000Z"),
      gmt_modified: new Date("2026-08-23T00:00:00.000Z"),
    },
  ],
}

function makeDb(overrides: {
  preference?: typeof preferenceRow | null
  periods?: Array<{
    period_id: string
    year: number
    start_date: Date
    end_date: Date
    goal_id: string
    color: string
    gmt_modified: Date
  }>
  focusGoal?: typeof launchGoal | null
  plans?: Array<typeof openPlan | Record<string, unknown>>
} = {}) {
  return {
    planningPreference: {
      findUnique: vi.fn().mockResolvedValue(
        Object.prototype.hasOwnProperty.call(overrides, "preference") ? overrides.preference : preferenceRow,
      ),
    },
    focusPeriod: {
      findMany: vi.fn().mockResolvedValue(overrides.periods ?? []),
    },
    goal: {
      findUnique: vi.fn().mockResolvedValue(
        Object.prototype.hasOwnProperty.call(overrides, "focusGoal") ? overrides.focusGoal : launchGoal,
      ),
    },
    plan: {
      findMany: vi.fn().mockResolvedValue(overrides.plans ?? [openPlan]),
    },
  } satisfies TodayQueryDb
}

describe("loadTodayView", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("loads the singleton preference, bounded focus periods, and incomplete plans in parallel", async () => {
    const period = {
      period_id: "focus_launch",
      year: 2026,
      start_date: new Date("2026-08-23T00:00:00.000Z"),
      end_date: new Date("2026-09-30T00:00:00.000Z"),
      goal_id: "goal_product",
      color: "#4f46e5",
      gmt_modified: new Date("2026-08-23T03:00:00.000Z"),
    }
    const db = makeDb({ periods: [period] })

    const view = await loadTodayView(db, "2026-08-23")

    expect(db.planningPreference.findUnique).toHaveBeenCalledWith({
      where: { preference_id: "default" },
    })
    expect(db.focusPeriod.findMany).toHaveBeenCalledWith({
      where: {
        year: 2026,
        start_date: { lte: new Date("2026-08-23T00:00:00.000Z") },
        end_date: { gte: new Date("2026-08-23T00:00:00.000Z") },
      },
      orderBy: [{ start_date: "asc" }, { period_id: "asc" }],
    })
    expect(db.goal.findUnique).toHaveBeenCalledWith({
      where: { goal_id: "goal_product" },
      select: { goal_id: true, name: true, tag: true },
    })
    expect(db.plan.findMany).toHaveBeenCalledWith({
      where: { progress: { lt: 1 } },
      include: {
        goal: { select: { goal_id: true, name: true } },
        tags: true,
        actionItems: {
          where: { is_completed: false },
          orderBy: [{ position: "asc" }, { gmt_create: "asc" }, { action_id: "asc" }],
        },
      },
      orderBy: [{ goal_position: "asc" }, { gmt_create: "asc" }, { plan_id: "asc" }],
    })
    expect(view.focus).toEqual({
      goal_id: "goal_product",
      name: "发布 Goal Mate v1",
      tag: "product",
      color: "#4f46e5",
      version: "2026-08-23T03:00:00.000Z",
    })
  })

  it.each([
    ["start", "2026-08-23"],
    ["end", "2026-09-30"],
  ])("includes a focus period on its %s boundary", async (_label, dateKey) => {
    const db = makeDb({
      periods: [{
        period_id: "focus_launch",
        year: 2026,
        start_date: new Date("2026-08-23T00:00:00.000Z"),
        end_date: new Date("2026-09-30T00:00:00.000Z"),
        goal_id: "goal_product",
        color: "#4f46e5",
        gmt_modified: new Date("2026-08-23T03:00:00.000Z"),
      }],
    })

    expect((await loadTodayView(db, dateKey)).focus?.goal_id).toBe("goal_product")
  })

  it("returns no focus and skips the goal lookup when no period contains the date", async () => {
    const db = makeDb({
      periods: [{
        period_id: "stale_period",
        year: 2026,
        start_date: new Date("2026-01-01T00:00:00.000Z"),
        end_date: new Date("2026-02-01T00:00:00.000Z"),
        goal_id: "goal_old",
        color: "#000000",
        gmt_modified: new Date("2026-01-01T00:00:00.000Z"),
      }],
    })

    expect((await loadTodayView(db, "2026-08-23")).focus).toBeNull()
    expect(db.goal.findUnique).not.toHaveBeenCalled()
  })

  it("returns no focus when the selected focus goal no longer exists", async () => {
    const db = makeDb({
      focusGoal: null,
      periods: [{
        period_id: "focus_orphaned",
        year: 2026,
        start_date: new Date("2026-08-01T00:00:00.000Z"),
        end_date: new Date("2026-08-31T00:00:00.000Z"),
        goal_id: "goal_missing",
        color: "#be123c",
        gmt_modified: new Date("2026-08-22T00:00:00.000Z"),
      }],
    })

    expect((await loadTodayView(db, "2026-08-23")).focus).toBeNull()
  })

  it("maps persisted preferences and falls back to runtime defaults without writing", async () => {
    const persistedDb = makeDb()
    const persisted = await loadTodayView(persistedDb, "2026-08-23")
    expect(persisted.preference).toEqual({
      preference_id: "default",
      timezone: "Asia/Shanghai",
      day_start_minutes: 480,
      day_end_minutes: 1320,
      high_energy_start_minutes: 540,
      high_energy_end_minutes: 720,
      buffer_minutes: 15,
      default_block_minutes: 60,
      capacity_warning_minutes: 480,
      version: "2026-08-23T01:00:00.000Z",
    })

    const defaultDb = makeDb({ preference: null })
    const fallback = await loadTodayView(defaultDb, "2026-08-23")
    expect(fallback.preference).toEqual(expect.objectContaining({
      preference_id: "default",
      timezone: expect.any(String),
      version: null,
    }))
    expect(defaultDb.planningPreference).not.toHaveProperty("upsert")
  })

  it("places ordered open actions before their non-recurring parent plan and maps exact candidate fields", async () => {
    const secondAction = {
      ...openPlan.actionItems[0],
      action_id: "action_design",
      name: "完成封面",
      position: 2000,
      due_date: null,
      estimated_minutes: null,
      energy_level: null,
      priority_quadrant: null,
      gmt_create: new Date("2026-08-22T00:00:00.000Z"),
      gmt_modified: new Date("2026-08-23T00:30:00.000Z"),
    }
    const db = makeDb({ plans: [{ ...openPlan, actionItems: [openPlan.actionItems[0], secondAction] }] })

    const view = await loadTodayView(db, "2026-08-23")

    expect(view.candidates.map(candidate => candidate.id)).toEqual([
      "action_copy",
      "action_design",
      "plan_launch",
    ])
    expect(view.candidates[0]).toEqual({
      kind: "action",
      id: "action_copy",
      action_id: "action_copy",
      plan_id: "plan_launch",
      goal_id: "goal_product",
      goal_name: "发布 Goal Mate v1",
      name: "写发布说明",
      due_date: "2026-09-01",
      estimated_minutes: 60,
      energy_level: "medium",
      effective_quadrant: "q1",
      is_recurring: false,
      version: "2026-08-23T00:00:00.000Z",
    })
    expect(view.candidates[1]).toEqual(expect.objectContaining({
      due_date: null,
      estimated_minutes: null,
      energy_level: null,
      effective_quadrant: "q2",
    }))
    expect(view.candidates[2]).toEqual({
      kind: "plan",
      id: "plan_launch",
      action_id: null,
      plan_id: "plan_launch",
      goal_id: "goal_product",
      goal_name: "发布 Goal Mate v1",
      name: "准备发布",
      due_date: "2026-09-03",
      estimated_minutes: 120,
      energy_level: "high",
      effective_quadrant: "q2",
      is_recurring: false,
      version: "2026-08-23T02:00:00.000Z",
    })
  })

  it("keeps recurring plans direct and never exposes their action rows", async () => {
    const recurringPlan = {
      ...openPlan,
      plan_id: "plan_daily",
      name: "每日复盘",
      is_recurring: true,
      actionItems: [{ ...openPlan.actionItems[0], action_id: "action_should_not_leak", plan_id: "plan_daily" }],
    }
    const db = makeDb({ plans: [recurringPlan] })

    const view = await loadTodayView(db, "2026-08-23")

    expect(view.candidates).toHaveLength(1)
    expect(view.candidates[0]).toEqual(expect.objectContaining({
      kind: "plan",
      id: "plan_daily",
      is_recurring: true,
    }))
  })

  it("preserves open plans with no goal or planning metadata", async () => {
    const unassigned = {
      ...openPlan,
      plan_id: "plan_unassigned",
      goal_id: null,
      goal: null,
      due_date: null,
      estimated_minutes: null,
      energy_level: null,
      priority_quadrant: null,
      actionItems: [],
    }
    const db = makeDb({ plans: [unassigned] })

    expect((await loadTodayView(db, "2026-08-23")).candidates).toEqual([
      expect.objectContaining({
        id: "plan_unassigned",
        goal_id: null,
        goal_name: null,
        due_date: null,
        estimated_minutes: null,
        energy_level: null,
        effective_quadrant: null,
      }),
    ])
  })

  it("defensively excludes completed plans and actions even if the database adapter leaks them", async () => {
    const leakedCompletedAction = {
      ...openPlan.actionItems[0],
      action_id: "action_done",
      is_completed: true,
    }
    const leakedCompletedPlan = {
      ...openPlan,
      plan_id: "plan_done",
      progress: 1,
      actionItems: [],
    }
    const db = makeDb({
      plans: [
        { ...openPlan, actionItems: [leakedCompletedAction, openPlan.actionItems[0]] },
        leakedCompletedPlan,
      ],
    })

    const view = await loadTodayView(db, "2026-08-23")

    expect(view.candidates.map(candidate => candidate.id)).toEqual(["action_copy", "plan_launch"])
    expect(db.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { progress: { lt: 1 } },
      include: expect.objectContaining({
        actionItems: expect.objectContaining({ where: { is_completed: false } }),
      }),
    }))
  })

  it("always returns API-safe phase-one empty blocks and checks", async () => {
    const db = makeDb()

    const view = await loadTodayView(db, "2026-08-23")

    expect(view).toEqual(expect.objectContaining({
      date: "2026-08-23",
      blocks: [],
      checks: [],
    }))
    expect(db).not.toHaveProperty("scheduleBlock")
    expect(JSON.parse(JSON.stringify(view))).toEqual(view)
  })
})
