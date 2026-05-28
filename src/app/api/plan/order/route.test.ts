import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  goal: {
    findUnique: vi.fn(),
  },
  plan: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

import { PUT } from "./route"

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(url, init)
}

async function json(response: Response) {
  return response.json()
}

describe("/api/plan/order", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    prismaMock.$transaction.mockImplementation(async (operations: unknown[]) => operations)
  })

  it("reorders every plan under a goal", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({ goal_id: "goal_arch" })
    prismaMock.plan.findMany
      .mockResolvedValueOnce([
        { plan_id: "plan_a", goal_id: "goal_arch" },
        { plan_id: "plan_b", goal_id: "goal_arch" },
      ])
      .mockResolvedValueOnce([
        {
          plan_id: "plan_b",
          name: "第二步",
          goal_id: "goal_arch",
          goal_position: 1000,
          tags: [{ tag: "study" }],
          goal: { goal_id: "goal_arch", name: "系统设计", tag: "study" },
          progressRecords: [],
        },
        {
          plan_id: "plan_a",
          name: "第一步",
          goal_id: "goal_arch",
          goal_position: 2000,
          tags: [{ tag: "study" }],
          goal: { goal_id: "goal_arch", name: "系统设计", tag: "study" },
          progressRecords: [],
        },
      ])
    prismaMock.plan.update.mockResolvedValue({})

    const response = await PUT(
      request("http://localhost/api/plan/order", {
        method: "PUT",
        body: JSON.stringify({
          goal_id: "goal_arch",
          ordered_plan_ids: ["plan_b", "plan_a"],
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_b" },
      data: { goal_position: 1000 },
    })
    expect(prismaMock.plan.update).toHaveBeenCalledWith({
      where: { plan_id: "plan_a" },
      data: { goal_position: 2000 },
    })
    expect(await json(response)).toEqual({
      list: [
        expect.objectContaining({ plan_id: "plan_b", tags: ["study"] }),
        expect.objectContaining({ plan_id: "plan_a", tags: ["study"] }),
      ],
      total: 2,
    })
  })

  it("rejects missing goals", async () => {
    prismaMock.goal.findUnique.mockResolvedValue(null)

    const response = await PUT(
      request("http://localhost/api/plan/order", {
        method: "PUT",
        body: JSON.stringify({
          goal_id: "goal_missing",
          ordered_plan_ids: ["plan_a"],
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "目标不存在" })
    expect(prismaMock.plan.update).not.toHaveBeenCalled()
  })

  it("rejects incomplete ordering", async () => {
    prismaMock.goal.findUnique.mockResolvedValue({ goal_id: "goal_arch" })
    prismaMock.plan.findMany.mockResolvedValue([
      { plan_id: "plan_a", goal_id: "goal_arch" },
      { plan_id: "plan_b", goal_id: "goal_arch" },
    ])

    const response = await PUT(
      request("http://localhost/api/plan/order", {
        method: "PUT",
        body: JSON.stringify({
          goal_id: "goal_arch",
          ordered_plan_ids: ["plan_a"],
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "ordered_plan_ids must include every plan for this goal" })
    expect(prismaMock.plan.update).not.toHaveBeenCalled()
  })
})
