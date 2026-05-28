import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const prismaMock = vi.hoisted(() => ({
  plan: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    aggregate: vi.fn(),
    delete: vi.fn(),
  },
  goal: {
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
  tags: [{ tag: "reading" }],
  goal: { goal_id: "goal_arch", name: "提升系统设计能力", tag: "study" },
  progressRecords: [],
}

describe("/api/plan", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("GET filters strictly by Plan.goal_id", async () => {
    prismaMock.plan.findMany.mockResolvedValue([basePlan])
    prismaMock.plan.count.mockResolvedValue(1)

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
          select: { gmt_create: true },
          orderBy: { gmt_create: "desc" },
        },
      },
    })
    expect(await json(response)).toEqual({
      list: [
        {
          ...basePlan,
          gmt_create: "2026-05-01T00:00:00.000Z",
          gmt_modified: "2026-05-01T00:00:00.000Z",
          tags: ["reading"],
        },
      ],
      total: 1,
    })
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
    expect(prismaMock.goal.findUnique).toHaveBeenCalledWith({ where: { goal_id: "goal_arch" } })
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_ddia" },
      data: { goal_id: "goal_arch", goal_position: 1000 },
    })
  })

  it("PUT attaches a plan when expected_goal_id matches unassigned state", async () => {
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
          expected_goal_id: null,
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_ddia" },
      data: { goal_id: "goal_arch", goal_position: 1000 },
    })
  })

  it("PUT rejects attach when expected_goal_id no longer matches unassigned state", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_ddia", goal_id: "goal_other" })

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
    expect(prismaMock.goal.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.plan.aggregate).not.toHaveBeenCalled()
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
