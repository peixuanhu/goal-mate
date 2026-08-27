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
  position: 3,
  tag: "product",
}

const openPlan = {
  plan_id: "plan_launch",
  goal_id: "goal_product",
  name: "准备发布",
  progress: 0.5,
  is_recurring: false,
  recurrence_type: null,
  recurrence_value: null,
  due_date: new Date("2026-09-03T00:00:00.000Z"),
  estimated_minutes: 120,
  default_block_minutes: null,
  energy_level: "high",
  priority_quadrant: "q2",
  gmt_create: new Date("2026-08-20T00:00:00.000Z"),
  gmt_modified: new Date("2026-08-23T02:00:00.000Z"),
  goal: launchGoal,
  tags: [{ tag: "launch" }],
  progressRecords: [],
  scheduleBlocks: [],
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
      scheduleBlocks: [],
      gmt_create: new Date("2026-08-21T00:00:00.000Z"),
      gmt_modified: new Date("2026-08-23T00:00:00.000Z"),
    },
  ],
}

const scheduledCopyBlock = {
  block_id: "block_copy",
  plan_id: "plan_launch",
  action_id: "action_copy",
  start_at: new Date("2026-08-23T01:00:00.000Z"),
  end_at: new Date("2026-08-23T02:00:00.000Z"),
  status: "scheduled",
  source: "manual",
  create_fingerprint: "copy-fingerprint",
  version: 2,
  plan: {
    plan_id: "plan_launch",
    name: "准备发布",
    energy_level: "high",
    goal: launchGoal,
  },
  action: {
    action_id: "action_copy",
    plan_id: "plan_launch",
    name: "写发布说明",
    energy_level: "medium",
    is_completed: false,
  },
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
  blocks?: Array<typeof scheduledCopyBlock | Record<string, unknown>>
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
    scheduleBlock: {
      findMany: vi.fn().mockResolvedValue(overrides.blocks ?? []),
    },
  } satisfies TodayQueryDb
}

describe("loadTodayView", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("loads the singleton preference before timezone-bounded aggregate rows", async () => {
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
      where: {
        OR: [
          { is_recurring: true },
          { is_recurring: false, progress: { lt: 1 } },
        ],
      },
      include: {
        goal: { select: { goal_id: true, name: true, position: true } },
        tags: true,
        progressRecords: {
          select: { gmt_create: true, counts_toward_recurrence: true },
          orderBy: { gmt_create: "desc" },
        },
        actionItems: {
          where: { is_completed: false },
          orderBy: [{ position: "asc" }, { gmt_create: "asc" }, { action_id: "asc" }],
        },
        scheduleBlocks: {
          select: {
            block_id: true,
            action_id: true,
            start_at: true,
            end_at: true,
            status: true,
          },
        },
      },
      orderBy: [{ goal_position: "asc" }, { gmt_create: "asc" }, { plan_id: "asc" }],
    })
    expect(db.scheduleBlock.findMany).toHaveBeenCalledWith({
      where: {
        start_at: { lt: new Date("2026-08-23T16:00:00.000Z") },
        end_at: { gt: new Date("2026-08-22T16:00:00.000Z") },
      },
      include: {
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
      },
      orderBy: [{ start_at: "asc" }, { block_id: "asc" }],
    })
    expect(view.focus).toEqual({
      goal_id: "goal_product",
      name: "发布 Goal Mate v1",
      tag: "product",
      color: "#4f46e5",
      version: "2026-08-23T03:00:00.000Z",
    })
  })

  it("does not query timezone-dependent rows until the saved preference is known", async () => {
    let resolvePreference!: (value: typeof preferenceRow) => void
    const preferencePromise = new Promise<typeof preferenceRow>(resolve => {
      resolvePreference = resolve
    })
    const db = makeDb()
    db.planningPreference.findUnique.mockReturnValue(preferencePromise)

    const pending = loadTodayView(db, "2026-08-23")
    await Promise.resolve()

    expect(db.focusPeriod.findMany).not.toHaveBeenCalled()
    expect(db.plan.findMany).not.toHaveBeenCalled()
    expect(db.scheduleBlock.findMany).not.toHaveBeenCalled()

    resolvePreference(preferenceRow)
    await pending

    expect(db.focusPeriod.findMany).toHaveBeenCalledOnce()
    expect(db.plan.findMany).toHaveBeenCalledOnce()
    expect(db.scheduleBlock.findMany).toHaveBeenCalledOnce()
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
      goal_position: 3,
      name: "写发布说明",
      due_date: "2026-09-01",
      estimated_minutes: 60,
      effective_default_block_minutes: 60,
      invested_minutes: 0,
      remaining_minutes: 60,
      reserved_action_minutes: 120,
      available_minutes: 60,
      scheduled_block_count: 0,
      scheduled_minutes: 0,
      suggested_block_minutes: 60,
      budget_status: "ok",
      can_schedule: true,
      schedule_reason: null,
      energy_level: "medium",
      effective_quadrant: "q1",
      is_recurring: false,
      version: "2026-08-23T00:00:00.000Z",
    })
    expect(view.candidates[1]).toEqual(expect.objectContaining({
      due_date: null,
      estimated_minutes: 60,
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
      goal_position: 3,
      name: "准备发布",
      due_date: "2026-09-03",
      estimated_minutes: 120,
      effective_default_block_minutes: 60,
      invested_minutes: 0,
      remaining_minutes: 120,
      reserved_action_minutes: 120,
      available_minutes: 0,
      scheduled_block_count: 0,
      scheduled_minutes: 0,
      suggested_block_minutes: null,
      budget_status: "ok",
      can_schedule: false,
      schedule_reason: "剩余时间已预留给行动项",
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
      estimated_minutes: null,
      actionItems: [{ ...openPlan.actionItems[0], action_id: "action_should_not_leak", plan_id: "plan_daily" }],
    }
    const db = makeDb({ plans: [recurringPlan] })

    const view = await loadTodayView(db, "2026-08-23")

    expect(view.candidates).toHaveLength(1)
    expect(view.candidates[0]).toEqual(expect.objectContaining({
      kind: "plan",
      id: "plan_daily",
      is_recurring: true,
      estimated_minutes: null,
      effective_default_block_minutes: 60,
      remaining_minutes: null,
      available_minutes: null,
      suggested_block_minutes: 60,
      budget_status: "ok",
      can_schedule: true,
      schedule_reason: null,
    }))
  })

  it("hides a recurring plan after its current period target is complete", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-24T08:00:00.000Z"))
    const completedRecurringPlan = {
      ...openPlan,
      plan_id: "plan_daily",
      name: "每日复盘",
      is_recurring: true,
      recurrence_type: "daily",
      recurrence_value: "1",
      progressRecords: [{
        gmt_create: new Date("2026-08-24T01:00:00.000Z"),
        counts_toward_recurrence: true,
      }],
      actionItems: [],
    }
    const db = makeDb({ plans: [completedRecurringPlan] })

    expect((await loadTodayView(db, "2026-08-24")).candidates).toEqual([])
    vi.useRealTimers()
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
        estimated_minutes: 60,
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
      where: {
        OR: [
          { is_recurring: true },
          { is_recurring: false, progress: { lt: 1 } },
        ],
      },
      include: expect.objectContaining({
        actionItems: expect.objectContaining({ where: { is_completed: false } }),
      }),
    }))
  })

  it("returns only blocks overlapping the requested timezone day with exact normalized fields", async () => {
    const crossesIntoDay = {
      ...scheduledCopyBlock,
      block_id: "block_crosses_start",
      action_id: null,
      start_at: new Date("2026-08-22T15:30:00.000Z"),
      end_at: new Date("2026-08-22T16:30:00.000Z"),
      plan: {
        ...scheduledCopyBlock.plan,
        goal: null,
      },
      action: null,
    }
    const touchesStartOutside = {
      ...scheduledCopyBlock,
      block_id: "block_before",
      start_at: new Date("2026-08-22T15:00:00.000Z"),
      end_at: new Date("2026-08-22T16:00:00.000Z"),
    }
    const touchesEndOutside = {
      ...scheduledCopyBlock,
      block_id: "block_after",
      start_at: new Date("2026-08-23T16:00:00.000Z"),
      end_at: new Date("2026-08-23T17:00:00.000Z"),
    }
    const db = makeDb({
      blocks: [touchesEndOutside, scheduledCopyBlock, touchesStartOutside, crossesIntoDay],
    })

    const view = await loadTodayView(db, "2026-08-23")

    expect(view.blocks).toEqual([
      {
        block_id: "block_crosses_start",
        plan_id: "plan_launch",
        action_id: null,
        title: "准备发布",
        goal_id: null,
        goal_name: null,
        energy_level: "high",
        start_at: "2026-08-22T15:30:00.000Z",
        end_at: "2026-08-22T16:30:00.000Z",
        status: "scheduled",
        source: "manual",
        version: 2,
      },
      expect.objectContaining({
        block_id: "block_copy",
        title: "写发布说明",
        goal_id: "goal_product",
        goal_name: "发布 Goal Mate v1",
        energy_level: "medium",
        version: 2,
      }),
    ])
    expect(view.checks).toEqual([])
    expect(JSON.parse(JSON.stringify(view))).toEqual(view)
  })

  it.each([
    ["completed", 30],
    ["partial", 30],
    ["skipped", 0],
    ["cancelled", 0],
  ] as const)(
    "keeps an action candidate when its only block is %s",
    async (status, expectedInvestedMinutes) => {
      const db = makeDb({
        plans: [{
          ...openPlan,
          scheduleBlocks: [{
            block_id: `block_${status}`,
            action_id: "action_copy",
            start_at: new Date("2026-08-20T00:00:00.000Z"),
            end_at: new Date("2026-08-20T00:30:00.000Z"),
            status,
          }],
        }],
      })

      const candidates = (await loadTodayView(db, "2026-08-23")).candidates
      expect(candidates.map(item => item.id)).toEqual([
        "action_copy",
        "plan_launch",
      ])
      expect(candidates[0]).toEqual(expect.objectContaining({
        invested_minutes: expectedInvestedMinutes,
        remaining_minutes: 60 - expectedInvestedMinutes,
        suggested_block_minutes: 60 - expectedInvestedMinutes,
      }))
      expect(candidates[1]).toEqual(expect.objectContaining({
        invested_minutes: expectedInvestedMinutes,
        remaining_minutes: 120 - expectedInvestedMinutes,
      }))
    },
  )

  it("keeps an action with a globally active scheduled block visible and schedulable within budget", async () => {
    const sibling = {
      ...openPlan.actionItems[0],
      action_id: "action_design",
      name: "完成封面",
      position: 2000,
      scheduleBlocks: [{ block_id: "block_finished", status: "completed" }],
    }
    const planScheduledOutsideDay = {
      ...scheduledCopyBlock,
      block_id: "block_plan_tomorrow",
      action_id: null,
      start_at: new Date("2026-08-24T01:00:00.000Z"),
      end_at: new Date("2026-08-24T02:00:00.000Z"),
      action: null,
    }
    const actionScheduledOutsideDay = {
      ...scheduledCopyBlock,
      block_id: "block_copy_tomorrow",
      start_at: new Date("2026-08-24T02:00:00.000Z"),
      end_at: new Date("2026-08-24T03:00:00.000Z"),
    }
    const db = makeDb({
      plans: [{
        ...openPlan,
        actionItems: [
          {
            ...openPlan.actionItems[0],
            scheduleBlocks: [{ block_id: "block_copy_tomorrow", status: "scheduled" }],
          },
          sibling,
        ],
        scheduleBlocks: [{
          block_id: "block_copy_tomorrow",
          action_id: "action_copy",
          start_at: new Date("2026-08-24T02:00:00.000Z"),
          end_at: new Date("2026-08-24T02:30:00.000Z"),
          status: "scheduled",
        }],
      }],
      blocks: [planScheduledOutsideDay, actionScheduledOutsideDay],
    })

    const view = await loadTodayView(db, "2026-08-23")

    expect(view.blocks).toEqual([])
    expect(view.candidates.map(item => item.id)).toEqual(["action_copy", "action_design", "plan_launch"])
    expect(view.candidates.find(item => item.id === "action_copy")).toEqual(expect.objectContaining({
      can_schedule: true,
      available_minutes: 30,
      scheduled_block_count: 1,
      scheduled_minutes: 30,
      suggested_block_minutes: 30,
      schedule_reason: null,
    }))
  })

  it("returns ordinary-plan budget, reservation, and suggestion fields", async () => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        estimated_minutes: 300,
        default_block_minutes: 60,
        actionItems: [
          { ...openPlan.actionItems[0], action_id: "action_one", estimated_minutes: 45 },
          { ...openPlan.actionItems[0], action_id: "action_two", estimated_minutes: 45, position: 2000 },
        ],
        scheduleBlocks: [
          {
            block_id: "block_completed",
            action_id: null,
            start_at: new Date("2026-08-20T00:00:00.000Z"),
            end_at: new Date("2026-08-20T00:30:00.000Z"),
            status: "completed",
          },
          {
            block_id: "block_partial",
            action_id: null,
            start_at: new Date("2026-08-21T00:00:00.000Z"),
            end_at: new Date("2026-08-21T00:30:00.000Z"),
            status: "partial",
          },
        ],
      }],
    })

    const plan = (await loadTodayView(db, "2026-08-23")).candidates.find(
      candidate => candidate.id === "plan_launch",
    )

    expect(plan).toEqual(expect.objectContaining({
      estimated_minutes: 300,
      effective_default_block_minutes: 60,
      invested_minutes: 60,
      remaining_minutes: 240,
      reserved_action_minutes: 90,
      available_minutes: 150,
      suggested_block_minutes: 60,
      budget_status: "ok",
      can_schedule: true,
      schedule_reason: null,
    }))
  })

  it("exposes an inherited action estimate consistently with its budget remainder", async () => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        default_block_minutes: 75,
        actionItems: [{ ...openPlan.actionItems[0], estimated_minutes: null }],
      }],
    })

    const action = (await loadTodayView(db, "2026-08-23")).candidates.find(
      candidate => candidate.id === "action_copy",
    )

    expect(action).toEqual(expect.objectContaining({
      kind: "action",
      estimated_minutes: 75,
      remaining_minutes: 75,
    }))
  })

  it("shortens the direct suggestion to the final remainder", async () => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        estimated_minutes: 90,
        actionItems: [],
        scheduleBlocks: [{
          block_id: "block_completed",
          action_id: null,
          start_at: new Date("2026-08-20T00:00:00.000Z"),
          end_at: new Date("2026-08-20T01:00:00.000Z"),
          status: "completed",
        }],
      }],
    })

    expect((await loadTodayView(db, "2026-08-23")).candidates[0]).toEqual(
      expect.objectContaining({ suggested_block_minutes: 30, can_schedule: true }),
    )
  })

  it("uses plan override or preference duration for recurring candidates without a total", async () => {
    const recurring = {
      ...openPlan,
      is_recurring: true,
      estimated_minutes: null,
      actionItems: [],
    }
    const db = makeDb({
      plans: [
        { ...recurring, plan_id: "recurring_override", default_block_minutes: 45 },
        { ...recurring, plan_id: "recurring_preference", default_block_minutes: null },
      ],
    })

    const view = await loadTodayView(db, "2026-08-23")

    expect(view.candidates).toEqual([
      expect.objectContaining({
        id: "recurring_override",
        estimated_minutes: null,
        effective_default_block_minutes: 45,
        remaining_minutes: null,
        available_minutes: null,
        suggested_block_minutes: 45,
        budget_status: "ok",
      }),
      expect.objectContaining({
        id: "recurring_preference",
        estimated_minutes: null,
        effective_default_block_minutes: 60,
        suggested_block_minutes: 60,
      }),
    ])
  })

  it("keeps a direct candidate with a scheduled block visible and schedulable within budget", async () => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        actionItems: [],
        scheduleBlocks: [{
          block_id: "block_scheduled",
          action_id: null,
          start_at: new Date("2026-08-26T00:00:00.000Z"),
          end_at: new Date("2026-08-26T01:00:00.000Z"),
          status: "scheduled",
        }],
      }],
    })

    expect((await loadTodayView(db, "2026-08-23")).candidates[0]).toEqual(expect.objectContaining({
      can_schedule: true,
      available_minutes: 60,
      scheduled_block_count: 1,
      scheduled_minutes: 60,
      suggested_block_minutes: 60,
      schedule_reason: null,
    }))
  })

  it("disables a direct candidate when scheduled blocks consume its available budget", async () => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        estimated_minutes: 60,
        actionItems: [],
        scheduleBlocks: [{
          block_id: "block_scheduled",
          action_id: null,
          start_at: new Date("2026-08-26T00:00:00.000Z"),
          end_at: new Date("2026-08-26T01:00:00.000Z"),
          status: "scheduled",
        }],
      }],
    })

    expect((await loadTodayView(db, "2026-08-23")).candidates[0]).toEqual(expect.objectContaining({
      can_schedule: false,
      available_minutes: 0,
      scheduled_block_count: 1,
      scheduled_minutes: 60,
      suggested_block_minutes: null,
      schedule_reason: "剩余时间已全部安排",
    }))
  })

  it("keeps an action whose estimate is consumed visible but disabled", async () => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        actionItems: [{ ...openPlan.actionItems[0], estimated_minutes: 45 }],
        scheduleBlocks: [{
          block_id: "block_action_partial",
          action_id: "action_copy",
          start_at: new Date("2026-08-20T00:00:00.000Z"),
          end_at: new Date("2026-08-20T00:45:00.000Z"),
          status: "partial",
        }],
      }],
    })

    expect((await loadTodayView(db, "2026-08-23")).candidates[0]).toEqual(expect.objectContaining({
      kind: "action",
      invested_minutes: 45,
      remaining_minutes: 0,
      available_minutes: 0,
      suggested_block_minutes: null,
      can_schedule: false,
      schedule_reason: "行动项预计投入已用尽",
    }))
  })

  it("counts blocks from completed actions omitted by the candidate query", async () => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        estimated_minutes: 120,
        actionItems: [],
        scheduleBlocks: [{
          block_id: "block_completed_action",
          action_id: "action_already_completed",
          start_at: new Date("2026-08-20T00:00:00.000Z"),
          end_at: new Date("2026-08-20T00:45:00.000Z"),
          status: "completed",
        }],
      }],
    })

    expect((await loadTodayView(db, "2026-08-23")).candidates).toEqual([
      expect.objectContaining({
        kind: "plan",
        invested_minutes: 45,
        remaining_minutes: 75,
        reserved_action_minutes: 0,
        suggested_block_minutes: 60,
      }),
    ])
  })

  it("keeps scheduled siblings from a completed Action committed in the parent candidate", async () => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        estimated_minutes: 120,
        actionItems: [],
        scheduleBlocks: [
          {
            block_id: "block_completed_action",
            action_id: "action_already_completed",
            start_at: new Date("2026-08-20T00:00:00.000Z"),
            end_at: new Date("2026-08-20T00:30:00.000Z"),
            status: "completed",
          },
          {
            block_id: "block_scheduled_sibling",
            action_id: "action_already_completed",
            start_at: new Date("2026-08-24T00:00:00.000Z"),
            end_at: new Date("2026-08-24T00:30:00.000Z"),
            status: "scheduled",
          },
        ],
      }],
    })

    expect((await loadTodayView(db, "2026-08-23")).candidates).toEqual([
      expect.objectContaining({
        kind: "plan",
        invested_minutes: 30,
        remaining_minutes: 90,
        reserved_action_minutes: 0,
        available_minutes: 60,
        suggested_block_minutes: 60,
      }),
    ])
  })

  it("keeps a fully reserved parent visible but disables direct scheduling", async () => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        estimated_minutes: 90,
        actionItems: [{ ...openPlan.actionItems[0], estimated_minutes: 90 }],
      }],
    })

    const plan = (await loadTodayView(db, "2026-08-23")).candidates.find(
      candidate => candidate.kind === "plan",
    )
    expect(plan).toEqual(expect.objectContaining({
      remaining_minutes: 90,
      reserved_action_minutes: 90,
      available_minutes: 0,
      can_schedule: false,
      schedule_reason: "剩余时间已预留给行动项",
    }))
  })

  it.each([
    ["overrun", 30, 45, "总预计投入已超支"],
    ["exhausted", 45, 45, "总预计投入已用尽"],
  ])("reports a deterministic %s direct-plan reason", async (budget_status, total, invested, reason) => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        estimated_minutes: total,
        actionItems: [],
        scheduleBlocks: [{
          block_id: `block_${budget_status}`,
          action_id: null,
          start_at: new Date("2026-08-20T00:00:00.000Z"),
          end_at: new Date(new Date("2026-08-20T00:00:00.000Z").getTime() + invested * 60_000),
          status: "completed",
        }],
      }],
    })

    expect((await loadTodayView(db, "2026-08-23")).candidates[0]).toEqual(expect.objectContaining({
      budget_status,
      remaining_minutes: 0,
      can_schedule: false,
      schedule_reason: reason,
    }))
  })

  it("allows an unfinished action to schedule even when its parent budget is overrun", async () => {
    const db = makeDb({
      plans: [{
        ...openPlan,
        estimated_minutes: 60,
        actionItems: [{ ...openPlan.actionItems[0], estimated_minutes: 90 }],
      }],
    })

    expect((await loadTodayView(db, "2026-08-23")).candidates[0]).toEqual(expect.objectContaining({
      kind: "action",
      budget_status: "overrun",
      remaining_minutes: 90,
      suggested_block_minutes: 60,
      can_schedule: true,
      schedule_reason: null,
    }))
  })
})
