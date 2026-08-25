import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { events, prismaMock, transactionMock } = vi.hoisted(() => ({
  events: [] as string[],
  prismaMock: {
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    goal: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  transactionMock: {
    $executeRaw: vi.fn(),
    goal: {
      aggregate: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

import { DELETE, GET, POST, PUT } from "./route"

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init)
}

const goalOrder = [
  { position: { sort: "asc", nulls: "last" } },
  { gmt_create: "desc" },
  { goal_id: "asc" },
]

describe("/api/goal", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    events.length = 0
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof transactionMock) => unknown) => callback(transactionMock))
    prismaMock.goal.count.mockResolvedValue(2)
    transactionMock.$executeRaw.mockImplementation(async () => {
      events.push("lock")
    })
    transactionMock.goal.aggregate.mockImplementation(async () => {
      events.push("aggregate")
      return { _max: { position: 4 } }
    })
    transactionMock.goal.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      events.push("create")
      return data
    })
    transactionMock.goal.delete.mockImplementation(async ({ where }: { where: { goal_id: string } }) => {
      events.push("delete")
      return where
    })
  })

  it("returns every manually ordered goal when all=true", async () => {
    const goals = [
      { goal_id: "goal_b", position: 0 },
      { goal_id: "goal_a", position: 1 },
    ]
    prismaMock.goal.findMany.mockResolvedValue(goals)

    const response = await GET(request("http://localhost/api/goal?all=true&tag=ignored&pageNum=9"))

    expect(prismaMock.goal.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: goalOrder,
    })
    expect(await response.json()).toEqual({ list: goals, total: 2 })
  })

  it("paginates tag-filtered goals in manual order", async () => {
    prismaMock.goal.findMany.mockResolvedValue([])

    await GET(request("http://localhost/api/goal?tag=work&pageNum=2&pageSize=10"))

    expect(prismaMock.goal.findMany).toHaveBeenCalledWith({
      where: { tag: "work" },
      skip: 10,
      take: 10,
      orderBy: goalOrder,
    })
  })

  it("appends a new goal after the current maximum position", async () => {
    const response = await POST(request("http://localhost/api/goal", {
      method: "POST",
      body: JSON.stringify({
        name: "新目标",
        tag: "work",
        description: "说明",
        id: 17,
        gmt_create: "2026-01-01T00:00:00.000Z",
        gmt_modified: "2026-01-02T00:00:00.000Z",
        plans: [{ plan_id: "plan_injected" }],
        position: -99,
      }),
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled()
    expect(prismaMock.goal.aggregate).not.toHaveBeenCalled()
    expect(prismaMock.goal.create).not.toHaveBeenCalled()
    expect(transactionMock.$executeRaw).toHaveBeenCalledTimes(1)
    expect(transactionMock.goal.aggregate).toHaveBeenCalledWith({ _max: { position: true } })
    expect(transactionMock.goal.create).toHaveBeenCalledWith({
      data: {
        name: "新目标",
        tag: "work",
        description: "说明",
        goal_id: expect.stringMatching(/^goal_[a-z0-9]{10}$/),
        position: 5,
      },
    })
    expect(events).toEqual(["lock", "aggregate", "create"])
    expect(await response.json()).toEqual(expect.objectContaining({ position: 5 }))
  })

  it.each([
    ["an array", []],
    ["a non-string name", { name: 1, tag: "work" }],
    ["a non-string tag", { name: "新目标", tag: 1 }],
    ["an invalid description", { name: "新目标", tag: "work", description: 1 }],
  ])("rejects %s without starting a transaction", async (_label, body) => {
    const response = await POST(request("http://localhost/api/goal", {
      method: "POST",
      body: JSON.stringify(body),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(expect.objectContaining({ error: expect.any(String) }))
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("does not forward client supplied positions when updating a goal", async () => {
    prismaMock.goal.update.mockResolvedValue({ goal_id: "goal_a" })

    const response = await PUT(request("http://localhost/api/goal", {
      method: "PUT",
      body: JSON.stringify({
        goal_id: "goal_a",
        name: "更新后目标",
        tag: "study",
        description: "更新后说明",
        position: -99,
      }),
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.goal.update).toHaveBeenCalledWith({
      where: { goal_id: "goal_a" },
      data: { name: "更新后目标", tag: "study", description: "更新后说明" },
    })
  })

  it("locks the goal collection before deleting a goal", async () => {
    const response = await DELETE(request("http://localhost/api/goal?goal_id=goal_a"))

    expect(response.status).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.goal.delete).not.toHaveBeenCalled()
    expect(transactionMock.goal.delete).toHaveBeenCalledWith({ where: { goal_id: "goal_a" } })
    expect(events).toEqual(["lock", "delete"])
    expect(await response.json()).toEqual({ success: true })
  })
})
