import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { events, prismaMock, transactionMock } = vi.hoisted(() => ({
  events: [] as string[],
  prismaMock: {
    $transaction: vi.fn(),
    goal: {
      findMany: vi.fn(),
    },
  },
  transactionMock: {
    $executeRaw: vi.fn(),
    goal: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

import { PUT } from "./route"

function request(body: BodyInit): NextRequest {
  return new NextRequest("http://localhost/api/goal/order", { method: "PUT", body })
}

describe("/api/goal/order", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    events.length = 0
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof transactionMock) => unknown) => callback(transactionMock))
    transactionMock.$executeRaw.mockImplementation(async () => {
      events.push("lock")
    })
    transactionMock.goal.findMany.mockImplementation(async (...args: unknown[]) => {
      events.push(args.length === 0 ? "read" : "final read")
      return []
    })
    transactionMock.goal.updateMany.mockImplementation(async ({ data }: { data: { position: number } }) => {
      events.push(`write ${data.position}`)
      return { count: 1 }
    })
  })

  it("reorders the complete goal collection transactionally", async () => {
    const finalGoals = [
      { goal_id: "goal_b", position: 0, name: "第二个目标" },
      { goal_id: "goal_a", position: 1, name: "第一个目标" },
    ]
    transactionMock.goal.findMany
      .mockImplementationOnce(async () => {
        events.push("read")
        return [{ goal_id: "goal_a" }, { goal_id: "goal_b" }]
      })
      .mockImplementationOnce(async () => {
        events.push("final read")
        return finalGoals
      })

    const response = await PUT(request(JSON.stringify({ ordered_goal_ids: ["goal_b", "goal_a"] })))

    expect(response.status).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(transactionMock.$executeRaw).toHaveBeenCalledTimes(1)
    expect(transactionMock.goal.updateMany).toHaveBeenNthCalledWith(1, {
      where: { goal_id: "goal_b" },
      data: { position: 0 },
    })
    expect(transactionMock.goal.updateMany).toHaveBeenNthCalledWith(2, {
      where: { goal_id: "goal_a" },
      data: { position: 1 },
    })
    expect(transactionMock.goal.findMany).toHaveBeenNthCalledWith(1, {
      select: { goal_id: true },
    })
    expect(transactionMock.goal.findMany).toHaveBeenNthCalledWith(2, {
      orderBy: [
        { position: { sort: "asc", nulls: "last" } },
        { gmt_create: "desc" },
        { goal_id: "asc" },
      ],
    })
    expect(events).toEqual(["lock", "read", "write 0", "write 1", "final read"])
    expect(await response.json()).toEqual({ list: finalGoals, total: 2 })
  })

  it("accepts an empty ordered collection when the database collection is empty", async () => {
    transactionMock.goal.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const response = await PUT(request(JSON.stringify({ ordered_goal_ids: [] })))

    expect(response.status).toBe(200)
    expect(transactionMock.goal.updateMany).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({ list: [], total: 0 })
  })

  it.each([
    ["a null body", null, "请求体必须是有效 JSON 对象"],
    ["a non-array ordered id field", { ordered_goal_ids: "goal_a" }, "ordered_goal_ids must be a string array"],
    ["an empty id", { ordered_goal_ids: [""] }, "ordered_goal_ids must be a string array"],
    ["duplicate ids", { ordered_goal_ids: ["goal_a", "goal_a"] }, "ordered_goal_ids must not contain duplicates"],
  ])("rejects %s without writes", async (_label, body, error) => {
    const response = await PUT(request(JSON.stringify(body)))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error })
    expect(transactionMock.goal.updateMany).not.toHaveBeenCalled()
  })

  it("rejects malformed JSON before starting a transaction", async () => {
    const response = await PUT(request("{"))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "请求体必须是有效 JSON 对象" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(transactionMock.goal.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    ["an incomplete collection", ["goal_a"], [{ goal_id: "goal_a" }, { goal_id: "goal_b" }]],
    ["an unknown goal", ["goal_a", "goal_unknown"], [{ goal_id: "goal_a" }, { goal_id: "goal_b" }]],
  ])("rejects %s as a stale collection", async (_label, ordered_goal_ids, currentGoals) => {
    transactionMock.goal.findMany.mockResolvedValueOnce(currentGoals)

    const response = await PUT(request(JSON.stringify({ ordered_goal_ids })))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "目标集合已变化，请刷新后重试" })
    expect(transactionMock.goal.updateMany).not.toHaveBeenCalled()
  })

  it("rejects when a goal disappears during the writes", async () => {
    transactionMock.goal.findMany.mockResolvedValueOnce([{ goal_id: "goal_a" }, { goal_id: "goal_b" }])
    transactionMock.goal.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const response = await PUT(request(JSON.stringify({ ordered_goal_ids: ["goal_b", "goal_a"] })))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "目标集合已变化，请刷新后重试" })
    expect(transactionMock.goal.updateMany).toHaveBeenCalledTimes(2)
  })

  it("rethrows unexpected transaction errors", async () => {
    const failure = new Error("database unavailable")
    prismaMock.$transaction.mockRejectedValueOnce(failure)

    await expect(PUT(request(JSON.stringify({ ordered_goal_ids: [] })))).rejects.toBe(failure)
  })
})
