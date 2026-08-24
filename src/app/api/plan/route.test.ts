import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const prismaMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  plan: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    aggregate: vi.fn(),
    delete: vi.fn(),
  },
  goal: {
    findUnique: vi.fn(),
  },
  actionItem: {
    count: vi.fn(),
  },
  scheduleBlock: {
    count: vi.fn(),
  },
  progressRecord: {
    count: vi.fn(),
  },
  planningPreference: {
    findUnique: vi.fn(),
  },
  planTagAssociation: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

import { GET, POST, PUT } from "./route"

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(url, init)
}

async function json(response: Response) {
  return response.json()
}

const basePlan = {
  id: 1,
  gmt_create: new Date("2026-05-01T00:00:00.000Z"),
  gmt_modified: new Date("2026-05-01T00:00:00.000Z"),
  plan_id: "plan_ddia",
  name: "读完 DDIA",
  description: "",
  difficulty: "hard",
  progress: 0,
  is_recurring: false,
  recurrence_type: null,
  recurrence_value: null,
  goal_id: "goal_arch",
  goal_position: 1000,
  priority_quadrant: null,
  is_scheduled: false,
  estimated_minutes: 300,
  default_block_minutes: null,
  tags: [{ tag: "reading" }],
  goal: { goal_id: "goal_arch", name: "提升系统设计能力", tag: "study" },
  progressRecords: [],
  actionItems: [],
  scheduleBlocks: [],
}

const defaultPreference = {
  id: 1,
  gmt_create: new Date("2026-05-01T00:00:00.000Z"),
  gmt_modified: new Date("2026-05-01T00:00:00.000Z"),
  preference_id: "default",
  timezone: "Asia/Shanghai",
  day_start_minutes: 480,
  day_end_minutes: 1320,
  high_energy_start_minutes: null,
  high_energy_end_minutes: null,
  buffer_minutes: 15,
  default_block_minutes: 60,
  capacity_warning_minutes: 480,
}

describe("/api/plan", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock))
    prismaMock.$queryRaw.mockResolvedValue([{ plan_id: "plan_ddia", is_recurring: false }])
    prismaMock.actionItem.count.mockResolvedValue(0)
    prismaMock.scheduleBlock.count.mockResolvedValue(0)
    prismaMock.progressRecord.count.mockResolvedValue(0)
    prismaMock.planningPreference.findUnique.mockResolvedValue(defaultPreference)
  })

  it("GET filters strictly by Plan.goal_id", async () => {
    prismaMock.plan.findMany.mockResolvedValue([basePlan])
    prismaMock.plan.count.mockResolvedValue(1)
    const {
      actionItems: _ignoredActions,
      scheduleBlocks: _ignoredBlocks,
      ...publicBasePlan
    } = basePlan

    const response = await GET(request("http://localhost/api/plan?goal_id=goal_arch&pageSize=1000"))

    expect(response.status).toBe(200)
    expect(prismaMock.goal.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.plan.findMany).toHaveBeenCalledWith({
      where: { goal_id: "goal_arch" },
      skip: 0,
      take: 1000,
      orderBy: [{ goal_position: "asc" }, { gmt_create: "asc" }],
      include: {
        tags: true,
        goal: { select: { goal_id: true, name: true, tag: true } },
        progressRecords: {
          select: { gmt_create: true, counts_toward_recurrence: true },
          orderBy: { gmt_create: "desc" },
        },
        actionItems: {
          select: { action_id: true, estimated_minutes: true, is_completed: true },
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
    })
    expect(await json(response)).toEqual({
      list: [
        {
          ...publicBasePlan,
          gmt_create: "2026-05-01T00:00:00.000Z",
          gmt_modified: "2026-05-01T00:00:00.000Z",
          tags: ["reading"],
          has_execution_history: false,
          time_budget: {
            effective_default_block_minutes: 60,
            invested_minutes: 0,
            remaining_minutes: 300,
            reserved_action_minutes: 0,
            unallocated_remaining_minutes: 300,
            suggested_block_minutes: 60,
            budget_status: "ok",
            has_scheduled_direct_block: false,
            actions: {},
          },
        },
      ],
      total: 1,
    })
    expect(prismaMock.planningPreference.findUnique).toHaveBeenCalledTimes(1)
  })

  it("GET preserves the recurrence-counting flag in its response shape", async () => {
    const partialRecord = {
      gmt_create: new Date("2026-08-23T01:00:00.000Z"),
      counts_toward_recurrence: false,
    }
    prismaMock.plan.findMany.mockResolvedValue([{
      ...basePlan,
      is_recurring: true,
      recurrence_type: "daily",
      recurrence_value: "1",
      progressRecords: [partialRecord],
    }])
    prismaMock.plan.count.mockResolvedValue(1)

    const response = await GET(request("http://localhost/api/plan?goal_id=goal_arch&pageSize=1000"))
    const data = await json(response)

    expect(data.list[0].progressRecords).toEqual([{
      gmt_create: "2026-08-23T01:00:00.000Z",
      counts_toward_recurrence: false,
    }])
    expect(data.list[0].has_execution_history).toBe(true)
  })

  it("GET exposes a time budget summary without leaking raw budget relations", async () => {
    prismaMock.plan.findMany.mockResolvedValue([{
      ...basePlan,
      actionItems: [{
        action_id: "action_outline",
        estimated_minutes: 120,
        is_completed: false,
      }],
      scheduleBlocks: [
        {
          block_id: "block_direct",
          action_id: null,
          start_at: new Date("2026-08-24T01:00:00.000Z"),
          end_at: new Date("2026-08-24T02:00:00.000Z"),
          status: "completed",
        },
        {
          block_id: "block_outline",
          action_id: "action_outline",
          start_at: new Date("2026-08-24T03:00:00.000Z"),
          end_at: new Date("2026-08-24T03:45:00.000Z"),
          status: "partial",
        },
      ],
    }])
    prismaMock.plan.count.mockResolvedValue(1)

    const response = await GET(request("http://localhost/api/plan?pageSize=1000"))
    const data = await json(response)

    expect(response.status).toBe(200)
    expect(data.list[0]).toEqual(expect.objectContaining({
      time_budget: expect.objectContaining({
        effective_default_block_minutes: 60,
        invested_minutes: 105,
        remaining_minutes: 195,
        reserved_action_minutes: 75,
        unallocated_remaining_minutes: 120,
        budget_status: "ok",
      }),
      has_execution_history: true,
    }))
    expect(data.list[0]).not.toHaveProperty("actionItems")
    expect(data.list[0]).not.toHaveProperty("scheduleBlocks")
    expect(prismaMock.planningPreference.findUnique).toHaveBeenCalledTimes(1)
  })

  it("GET safely applies the ordinary create default to a legacy null total", async () => {
    prismaMock.plan.findMany.mockResolvedValue([{
      ...basePlan,
      estimated_minutes: null,
    }])
    prismaMock.plan.count.mockResolvedValue(1)

    const response = await GET(request("http://localhost/api/plan?pageSize=1000"))
    const data = await json(response)

    expect(response.status).toBe(200)
    expect(data.list[0].time_budget.remaining_minutes).toBe(60)
  })

  it("GET supports unassigned plans", async () => {
    prismaMock.plan.findMany.mockResolvedValue([])
    prismaMock.plan.count.mockResolvedValue(0)

    const response = await GET(request("http://localhost/api/plan?unassigned=true&pageSize=1000"))

    expect(response.status).toBe(200)
    expect(prismaMock.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { goal_id: null },
    }))
  })

  it("POST defaults an ordinary total and keeps global block inheritance", async () => {
    prismaMock.plan.create.mockResolvedValue(basePlan)

    const response = await POST(request("http://localhost/api/plan", {
      method: "POST",
      body: JSON.stringify({ name: "写方案", tags: [] }),
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.plan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ is_recurring: false, estimated_minutes: 60 }),
    })
    expect(prismaMock.plan.create.mock.calls[0][0].data).not.toHaveProperty("default_block_minutes")
  })

  it("POST rejects a recurring plan with a total estimate", async () => {
    const response = await POST(request("http://localhost/api/plan", {
      method: "POST",
      body: JSON.stringify({
        name: "每日复盘",
        is_recurring: true,
        estimated_minutes: 60,
        tags: [],
      }),
    }))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "周期计划不能设置总预计投入" })
    expect(prismaMock.plan.create).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("POST rejects unknown request fields before opening a transaction", async () => {
    const response = await POST(request("http://localhost/api/plan", {
      method: "POST",
      body: JSON.stringify({ name: "写方案", tags: [], server_only: true }),
    }))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "unexpected field: server_only" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.plan.create).not.toHaveBeenCalled()
  })

  it("POST rejects missing goals", async () => {
    prismaMock.goal.findUnique.mockResolvedValue(null)

    const response = await POST(
      request("http://localhost/api/plan", {
        method: "POST",
        body: JSON.stringify({
          name: "读完 DDIA",
          difficulty: "hard",
          tags: ["reading"],
          goal_id: "goal_missing",
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "目标不存在" })
    expect(prismaMock.plan.create).not.toHaveBeenCalled()
  })

  it("POST creates a goal-bound plan at the end of the route", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({ goal_id: "goal_arch" })
    prismaMock.plan.aggregate.mockResolvedValue({ _max: { goal_position: 2000 } })
    prismaMock.plan.create.mockResolvedValue({ ...basePlan, goal_position: 3000 })
    prismaMock.planTagAssociation.create.mockResolvedValue({})

    const response = await POST(
      request("http://localhost/api/plan", {
        method: "POST",
        body: JSON.stringify({
          name: "读完 DDIA",
          difficulty: "hard",
          tags: ["reading"],
          goal_id: "goal_arch",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1)
    expect(prismaMock.goal.findUnique).toHaveBeenCalledWith({ where: { goal_id: "goal_arch" } })
    expect(prismaMock.plan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "读完 DDIA",
        difficulty: "hard",
        goal_id: "goal_arch",
        goal_position: 3000,
        plan_id: expect.stringMatching(/^plan_[a-f0-9]{10}$/),
      }),
    })
    expect(prismaMock.planTagAssociation.create).toHaveBeenCalledWith({
      data: { plan_id: "plan_ddia", tag: "reading" },
    })
  })

  it("PUT rejects recurrence changes after schedule execution history", async () => {
    prismaMock.scheduleBlock.count.mockResolvedValue(1)

    const response = await PUT(request("http://localhost/api/plan", {
      method: "PUT",
      body: JSON.stringify({ plan_id: "plan_ddia", is_recurring: true }),
    }))

    expect(response.status).toBe(409)
    expect(await json(response)).toEqual({ error: "已有执行记录，不能切换周期类型" })
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1)
    expect(prismaMock.scheduleBlock.count).toHaveBeenCalledWith({ where: { plan_id: "plan_ddia" } })
    expect(prismaMock.progressRecord.count).toHaveBeenCalledWith({ where: { plan_id: "plan_ddia" } })
    expect(prismaMock.actionItem.count).not.toHaveBeenCalled()
    expect(prismaMock.plan.update).not.toHaveBeenCalled()
    expect(prismaMock.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.$queryRaw.mock.invocationCallOrder[0],
    )
  })

  it("PUT rejects recurrence changes after progress execution history", async () => {
    prismaMock.progressRecord.count.mockResolvedValue(1)

    const response = await PUT(request("http://localhost/api/plan", {
      method: "PUT",
      body: JSON.stringify({ plan_id: "plan_ddia", is_recurring: true }),
    }))

    expect(response.status).toBe(409)
    expect(await json(response)).toEqual({ error: "已有执行记录，不能切换周期类型" })
    expect(prismaMock.plan.update).not.toHaveBeenCalled()
  })

  it("PUT rejects switching an ordinary plan with actions to recurring", async () => {
    prismaMock.actionItem.count.mockResolvedValue(1)

    const response = await PUT(request("http://localhost/api/plan", {
      method: "PUT",
      body: JSON.stringify({ plan_id: "plan_ddia", is_recurring: true }),
    }))

    expect(response.status).toBe(409)
    expect(await json(response)).toEqual({ error: "已有行动项，不能切换为周期计划" })
    expect(prismaMock.actionItem.count).toHaveBeenCalledWith({ where: { plan_id: "plan_ddia" } })
    expect(prismaMock.plan.update).not.toHaveBeenCalled()
  })

  it("PUT switches a history-free ordinary plan to recurring and clears its total", async () => {
    prismaMock.plan.update.mockResolvedValue({
      ...basePlan,
      is_recurring: true,
      estimated_minutes: null,
    })

    const response = await PUT(request("http://localhost/api/plan", {
      method: "PUT",
      body: JSON.stringify({ plan_id: "plan_ddia", is_recurring: true }),
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_ddia" },
      data: { is_recurring: true, estimated_minutes: null },
    })
  })

  it("PUT switches a history-free recurring plan to ordinary with the default total", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ plan_id: "plan_ddia", is_recurring: true }])
    prismaMock.plan.update.mockResolvedValue({
      ...basePlan,
      is_recurring: false,
      estimated_minutes: 60,
    })

    const response = await PUT(request("http://localhost/api/plan", {
      method: "PUT",
      body: JSON.stringify({ plan_id: "plan_ddia", is_recurring: false }),
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_ddia" },
      data: { is_recurring: false, estimated_minutes: 60 },
    })
    expect(prismaMock.actionItem.count).not.toHaveBeenCalled()
  })

  it("PUT returns 404 when the locked plan does not exist", async () => {
    prismaMock.$queryRaw.mockResolvedValue([])

    const response = await PUT(request("http://localhost/api/plan", {
      method: "PUT",
      body: JSON.stringify({ plan_id: "plan_missing", name: "新名称" }),
    }))

    expect(response.status).toBe(404)
    expect(await json(response)).toEqual({ error: "计划不存在" })
    expect(prismaMock.plan.update).not.toHaveBeenCalled()
  })

  it("PUT rejects unknown fields before locking the plan", async () => {
    const response = await PUT(request("http://localhost/api/plan", {
      method: "PUT",
      body: JSON.stringify({ plan_id: "plan_ddia", goal_position: 9000 }),
    }))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "unexpected field: goal_position" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled()
  })

  it("PUT moves a plan to a new goal and assigns the next position", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_ddia", goal_id: null })
    prismaMock.goal.findUnique.mockResolvedValue({ goal_id: "goal_arch" })
    prismaMock.plan.aggregate.mockResolvedValue({ _max: { goal_position: null } })
    prismaMock.plan.update.mockResolvedValue({ ...basePlan, goal_position: 1000 })

    const response = await PUT(
      request("http://localhost/api/plan", {
        method: "PUT",
        body: JSON.stringify({
          plan_id: "plan_ddia",
          goal_id: "goal_arch",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1)
    expect(prismaMock.goal.findUnique).toHaveBeenCalledWith({ where: { goal_id: "goal_arch" } })
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_ddia" },
      data: { goal_id: "goal_arch", goal_position: 1000 },
    })
    expect(prismaMock.scheduleBlock.count).not.toHaveBeenCalled()
    expect(prismaMock.progressRecord.count).not.toHaveBeenCalled()
    expect(prismaMock.actionItem.count).not.toHaveBeenCalled()
  })

  it("PUT attaches a plan when expected_goal_id matches unassigned state", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({ ...basePlan, goal_position: 1000 })
    prismaMock.goal.findUnique.mockResolvedValue({ goal_id: "goal_arch" })
    prismaMock.plan.aggregate.mockResolvedValue({ _max: { goal_position: null } })
    prismaMock.plan.updateMany.mockResolvedValue({ count: 1 })

    const response = await PUT(
      request("http://localhost/api/plan", {
        method: "PUT",
        body: JSON.stringify({
          plan_id: "plan_ddia",
          goal_id: "goal_arch",
          expected_goal_id: null,
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1)
    expect(prismaMock.plan.updateMany).toHaveBeenCalledWith({
      where: { plan_id: "plan_ddia", goal_id: null },
      data: { goal_id: "goal_arch", goal_position: 1000 },
    })
    expect(prismaMock.plan.update).not.toHaveBeenCalled()
    expect(prismaMock.plan.findUnique).toHaveBeenCalledWith({ where: { plan_id: "plan_ddia" } })
  })

  it("PUT rejects attach when expected_goal_id no longer matches unassigned state", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({ goal_id: "goal_arch" })
    prismaMock.plan.aggregate.mockResolvedValue({ _max: { goal_position: null } })
    prismaMock.plan.updateMany.mockResolvedValue({ count: 0 })

    const response = await PUT(
      request("http://localhost/api/plan", {
        method: "PUT",
        body: JSON.stringify({
          plan_id: "plan_ddia",
          goal_id: "goal_arch",
          expected_goal_id: null,
        }),
      }),
    )

    expect(response.status).toBe(409)
    expect(await json(response)).toEqual({ error: "计划归属已变化，请刷新后重试" })
    expect(prismaMock.plan.updateMany).toHaveBeenCalledWith({
      where: { plan_id: "plan_ddia", goal_id: null },
      data: { goal_id: "goal_arch", goal_position: 1000 },
    })
    expect(prismaMock.plan.update).not.toHaveBeenCalled()
  })

  it("PUT clears goal ownership and position", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_ddia", goal_id: "goal_arch" })
    prismaMock.plan.update.mockResolvedValue({ ...basePlan, goal_id: null, goal_position: null })

    const response = await PUT(
      request("http://localhost/api/plan", {
        method: "PUT",
        body: JSON.stringify({
          plan_id: "plan_ddia",
          goal_id: null,
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_ddia" },
      data: { goal_id: null, goal_position: null },
    })
  })
})
