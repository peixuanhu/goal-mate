import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const prismaMock = vi.hoisted(() => ({
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
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

import { GET, POST } from "./route"

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
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock))
    prismaMock.goal.count.mockResolvedValue(2)
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
    prismaMock.goal.aggregate.mockResolvedValue({ _max: { position: 4 } })
    prismaMock.goal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data))

    const response = await POST(request("http://localhost/api/goal", {
      method: "POST",
      body: JSON.stringify({
        name: "新目标",
        tag: "work",
        description: "说明",
        position: -99,
      }),
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1)
    expect(prismaMock.goal.aggregate).toHaveBeenCalledWith({ _max: { position: true } })
    expect(prismaMock.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "新目标",
        tag: "work",
        description: "说明",
        goal_id: expect.stringMatching(/^goal_[a-z0-9]{10}$/),
        position: 5,
      }),
    })
    expect(await response.json()).toEqual(expect.objectContaining({ position: 5 }))
  })
})
