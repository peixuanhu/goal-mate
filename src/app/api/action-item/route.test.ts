import { createHash } from "node:crypto"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { getGoalRouteLockKey } from "@/lib/plan-goal-utils"

const prismaMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
  plan: {
    findUnique: vi.fn(),
  },
  actionItem: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  scheduleBlock: {
    count: vi.fn(),
  },
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

import { DELETE, GET, POST, PUT } from "./route"

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(url, init)
}

async function json(response: Response) {
  return response.json()
}

function getRawSqlTemplate(call: unknown[]): string {
  const template = call[0]
  return Array.isArray(template) ? template.join("?") : ""
}

function actionIdFor(key: string): string {
  return `action_${createHash("sha256").update(key).digest("hex").slice(0, 10)}`
}

const baseAction = {
  id: 1,
  gmt_create: new Date("2026-08-23T01:00:00.000Z"),
  gmt_modified: new Date("2026-08-23T01:00:00.000Z"),
  action_id: "action_copy",
  plan_id: "plan_launch",
  position: 2000,
  name: "写发布说明",
  description: null,
  completed_at: null,
  due_date: null,
  estimated_minutes: null,
  energy_level: null,
  priority_quadrant: null,
  is_completed: false,
}

describe("/api/action-item", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("GET requires plan_id", async () => {
    const response = await GET(request("http://localhost/api/action-item"))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "plan_id required" })
    expect(prismaMock.actionItem.findMany).not.toHaveBeenCalled()
  })

  it("GET returns actions in stable plan order", async () => {
    prismaMock.actionItem.findMany.mockResolvedValue([baseAction])

    const response = await GET(request("http://localhost/api/action-item?plan_id=plan_launch"))

    expect(response.status).toBe(200)
    expect(prismaMock.actionItem.findMany).toHaveBeenCalledWith({
      where: { plan_id: "plan_launch" },
      orderBy: [{ position: "asc" }, { gmt_create: "asc" }],
    })
    expect(await json(response)).toEqual({
      list: [{
        ...baseAction,
        gmt_create: "2026-08-23T01:00:00.000Z",
        gmt_modified: "2026-08-23T01:00:00.000Z",
      }],
      total: 1,
    })
  })

  it.each([
    ["missing", undefined],
    ["empty", "   "],
    ["oversized", "x".repeat(129)],
  ])("POST rejects a %s idempotency key", async (_label, idempotencyKey) => {
    const headers = idempotencyKey === undefined ? undefined : { "Idempotency-Key": idempotencyKey }
    const response = await POST(request("http://localhost/api/action-item", {
      method: "POST",
      headers,
      body: JSON.stringify({ plan_id: "plan_launch", name: "写发布说明" }),
    }))

    expect(response.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("POST rejects malformed JSON before opening a transaction", async () => {
    const response = await POST(request("http://localhost/api/action-item", {
      method: "POST",
      headers: { "Idempotency-Key": "action-copy-v1" },
      body: "{",
    }))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "请求体必须是有效 JSON 对象" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("POST rejects non-object JSON and unknown fields", async () => {
    const nonObjectResponse = await POST(request("http://localhost/api/action-item", {
      method: "POST",
      headers: { "Idempotency-Key": "action-copy-list" },
      body: JSON.stringify([]),
    }))
    const unknownFieldResponse = await POST(request("http://localhost/api/action-item", {
      method: "POST",
      headers: { "Idempotency-Key": "action-copy-unknown" },
      body: JSON.stringify({ plan_id: "plan_launch", name: "写发布说明", position: 9000 }),
    }))

    expect(nonObjectResponse.status).toBe(400)
    expect(unknownFieldResponse.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("POST rejects missing plans", async () => {
    prismaMock.plan.findUnique.mockResolvedValue(null)

    const response = await POST(request("http://localhost/api/action-item", {
      method: "POST",
      headers: { "Idempotency-Key": "action-missing-plan" },
      body: JSON.stringify({ plan_id: "plan_missing", name: "写发布说明" }),
    }))

    expect(response.status).toBe(404)
    expect(await json(response)).toEqual({ error: "计划不存在" })
    expect(prismaMock.actionItem.create).not.toHaveBeenCalled()
  })

  it("POST rejects actions under recurring plans", async () => {
    prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_run", is_recurring: true })

    const response = await POST(request("http://localhost/api/action-item", {
      method: "POST",
      headers: { "Idempotency-Key": "action-run-v1" },
      body: JSON.stringify({ plan_id: "plan_run", name: "跑 5K" }),
    }))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "周期性计划不能创建行动项" })
    expect(prismaMock.actionItem.create).not.toHaveBeenCalled()
  })

  it("POST creates the next action position idempotently for a non-recurring plan", async () => {
    const key = "action-copy-v1"
    const expectedId = actionIdFor(key)
    prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_launch", is_recurring: false })
    prismaMock.actionItem.findUnique.mockResolvedValue(null)
    prismaMock.actionItem.aggregate.mockResolvedValue({ _max: { position: 1000 } })
    prismaMock.actionItem.create.mockResolvedValue({
      ...baseAction,
      action_id: expectedId,
      description: "面向内测用户",
      due_date: new Date("2026-09-01T00:00:00.000Z"),
      estimated_minutes: 60,
      energy_level: "medium",
      priority_quadrant: "q1",
    })

    const response = await POST(request("http://localhost/api/action-item", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        plan_id: " plan_launch ",
        name: "  写发布说明  ",
        description: "  面向内测用户  ",
        due_date: "2026-09-01",
        estimated_minutes: 60,
        energy_level: "medium",
        priority_quadrant: "q1",
      }),
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1)
    expect(getRawSqlTemplate(prismaMock.$executeRaw.mock.calls[0])).toBe("SELECT pg_advisory_xact_lock(?::int, ?::int)")
    expect(prismaMock.$executeRaw.mock.calls[0][2]).toBe(getGoalRouteLockKey("plan_launch"))
    expect(prismaMock.actionItem.aggregate).toHaveBeenCalledWith({
      where: { plan_id: "plan_launch" },
      _max: { position: true },
    })
    expect(prismaMock.actionItem.create).toHaveBeenCalledWith({
      data: {
        action_id: expectedId,
        plan_id: "plan_launch",
        position: 2000,
        name: "写发布说明",
        description: "面向内测用户",
        due_date: new Date("2026-09-01T00:00:00.000Z"),
        estimated_minutes: 60,
        energy_level: "medium",
        priority_quadrant: "q1",
      },
    })
  })

  it("POST rejects estimated_minutes outside the PostgreSQL Int range", async () => {
    const response = await POST(request("http://localhost/api/action-item", {
      method: "POST",
      headers: { "Idempotency-Key": "action-too-large" },
      body: JSON.stringify({
        plan_id: "plan_launch",
        name: "写发布说明",
        estimated_minutes: 2_147_483_648,
      }),
    }))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "estimated_minutes must be a positive PostgreSQL Int or null" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("POST returns an existing action for the same normalized immutable payload", async () => {
    const key = "action-copy-repeat"
    const existing = {
      ...baseAction,
      action_id: actionIdFor(key),
      description: "面向内测用户",
      due_date: new Date("2026-09-01T00:00:00.000Z"),
      estimated_minutes: 60,
      energy_level: "medium",
      priority_quadrant: "q1",
    }
    prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_launch", is_recurring: false })
    prismaMock.actionItem.findUnique.mockResolvedValue(existing)

    const response = await POST(request("http://localhost/api/action-item", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        plan_id: "plan_launch",
        name: "  写发布说明  ",
        description: "  面向内测用户  ",
        due_date: "2026-09-01",
        estimated_minutes: 60,
        energy_level: "medium",
        priority_quadrant: "q1",
      }),
    }))

    expect(response.status).toBe(200)
    expect((await json(response)).action_id).toBe(existing.action_id)
    expect(prismaMock.actionItem.aggregate).not.toHaveBeenCalled()
    expect(prismaMock.actionItem.create).not.toHaveBeenCalled()
  })

  it("POST returns 409 when an idempotency key maps to a different immutable payload", async () => {
    const key = "action-copy-collision"
    prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_launch", is_recurring: false })
    prismaMock.actionItem.findUnique.mockResolvedValue({
      ...baseAction,
      action_id: actionIdFor(key),
      due_date: new Date("2026-09-01T00:00:00.000Z"),
    })

    const response = await POST(request("http://localhost/api/action-item", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ plan_id: "plan_launch", name: "另一项工作", due_date: "2026-09-01" }),
    }))

    expect(response.status).toBe(409)
    expect(prismaMock.actionItem.aggregate).not.toHaveBeenCalled()
    expect(prismaMock.actionItem.create).not.toHaveBeenCalled()
  })

  it("POST serializes two creates under one plan before calculating their positions", async () => {
    const positions = [1000]
    let lockHeld = false
    const lockWaiters: Array<() => void> = []
    const rawCalls: unknown[][] = []

    prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_launch", is_recurring: false })
    prismaMock.actionItem.findUnique.mockResolvedValue(null)
    prismaMock.actionItem.aggregate.mockImplementation(async () => ({
      _max: { position: Math.max(...positions) },
    }))
    prismaMock.actionItem.create.mockImplementation(async ({ data }: { data: typeof baseAction }) => {
      await new Promise(resolve => setTimeout(resolve, 10))
      positions.push(data.position)
      return { ...baseAction, ...data }
    })
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => {
      let acquired = false
      const tx = {
        ...prismaMock,
        $executeRaw: vi.fn(async (...args: unknown[]) => {
          rawCalls.push(args)
          if (lockHeld) {
            await new Promise<void>(resolve => lockWaiters.push(resolve))
          }
          lockHeld = true
          acquired = true
        }),
      }

      try {
        return await callback(tx)
      } finally {
        if (acquired) {
          lockHeld = false
          lockWaiters.shift()?.()
        }
      }
    })

    const responses = await Promise.all([
      POST(request("http://localhost/api/action-item", {
        method: "POST",
        headers: { "Idempotency-Key": "action-concurrent-a" },
        body: JSON.stringify({ plan_id: "plan_launch", name: "行动 A" }),
      })),
      POST(request("http://localhost/api/action-item", {
        method: "POST",
        headers: { "Idempotency-Key": "action-concurrent-b" },
        body: JSON.stringify({ plan_id: "plan_launch", name: "行动 B" }),
      })),
    ])

    expect(responses.map(response => response.status)).toEqual([200, 200])
    expect(positions.slice(1).sort((a, b) => a - b)).toEqual([2000, 3000])
    expect(rawCalls).toHaveLength(2)
    expect(rawCalls.map(call => call[2])).toEqual([
      getGoalRouteLockKey("plan_launch"),
      getGoalRouteLockKey("plan_launch"),
    ])
  })

  it("PUT requires action_id and rejects non-editable fields", async () => {
    const missingIdResponse = await PUT(request("http://localhost/api/action-item", {
      method: "PUT",
      body: JSON.stringify({ name: "写发布说明" }),
    }))
    const immutableFieldResponse = await PUT(request("http://localhost/api/action-item", {
      method: "PUT",
      body: JSON.stringify({ action_id: "action_copy", plan_id: "plan_other", name: "写发布说明" }),
    }))

    expect(missingIdResponse.status).toBe(400)
    expect(immutableFieldResponse.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("PUT strictly normalizes editable fields and stamps completion", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-23T08:30:00.000Z"))
    prismaMock.actionItem.findUnique.mockResolvedValue(baseAction)
    prismaMock.actionItem.update.mockResolvedValue({
      ...baseAction,
      name: "更新发布说明",
      is_completed: true,
      completed_at: new Date("2026-08-23T08:30:00.000Z"),
    })

    const response = await PUT(request("http://localhost/api/action-item", {
      method: "PUT",
      body: JSON.stringify({
        action_id: " action_copy ",
        name: "  更新发布说明  ",
        description: "  ",
        due_date: "",
        estimated_minutes: "",
        energy_level: "",
        priority_quadrant: "",
        is_completed: true,
      }),
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.actionItem.update).toHaveBeenCalledWith({
      where: { action_id: "action_copy" },
      data: {
        name: "更新发布说明",
        description: "",
        due_date: null,
        estimated_minutes: null,
        energy_level: null,
        priority_quadrant: null,
        is_completed: true,
        completed_at: new Date("2026-08-23T08:30:00.000Z"),
      },
    })
  })

  it("PUT clears completed_at when reopening", async () => {
    prismaMock.actionItem.findUnique.mockResolvedValue({ ...baseAction, is_completed: true })
    prismaMock.actionItem.update.mockResolvedValue(baseAction)

    const response = await PUT(request("http://localhost/api/action-item", {
      method: "PUT",
      body: JSON.stringify({ action_id: "action_copy", is_completed: false }),
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.actionItem.update).toHaveBeenCalledWith({
      where: { action_id: "action_copy" },
      data: { is_completed: false, completed_at: null },
    })
  })

  it("PUT returns 404 for a missing action", async () => {
    prismaMock.actionItem.findUnique.mockResolvedValue(null)

    const response = await PUT(request("http://localhost/api/action-item", {
      method: "PUT",
      body: JSON.stringify({ action_id: "action_missing", name: "工作" }),
    }))

    expect(response.status).toBe(404)
    expect(await json(response)).toEqual({ error: "行动项不存在" })
    expect(prismaMock.actionItem.update).not.toHaveBeenCalled()
  })

  it("DELETE requires action_id", async () => {
    const response = await DELETE(request("http://localhost/api/action-item", { method: "DELETE" }))

    expect(response.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("DELETE returns 404 for a missing action", async () => {
    prismaMock.actionItem.findUnique.mockResolvedValue(null)

    const response = await DELETE(request("http://localhost/api/action-item?action_id=action_missing", { method: "DELETE" }))

    expect(response.status).toBe(404)
    expect(prismaMock.scheduleBlock.count).not.toHaveBeenCalled()
    expect(prismaMock.actionItem.delete).not.toHaveBeenCalled()
  })

  it("DELETE blocks deletion while a future scheduled block exists", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-23T08:30:00.000Z"))
    prismaMock.actionItem.findUnique.mockResolvedValue(baseAction)
    prismaMock.scheduleBlock.count.mockResolvedValue(1)

    const response = await DELETE(request("http://localhost/api/action-item?action_id=action_copy", { method: "DELETE" }))

    expect(response.status).toBe(409)
    expect(prismaMock.scheduleBlock.count).toHaveBeenCalledWith({
      where: {
        action_id: "action_copy",
        status: "scheduled",
        start_at: { gt: new Date("2026-08-23T08:30:00.000Z") },
      },
    })
    expect(prismaMock.actionItem.delete).not.toHaveBeenCalled()
  })

  it("DELETE removes an unprotected action in a transaction", async () => {
    prismaMock.actionItem.findUnique.mockResolvedValue(baseAction)
    prismaMock.scheduleBlock.count.mockResolvedValue(0)
    prismaMock.actionItem.delete.mockResolvedValue(baseAction)

    const response = await DELETE(request("http://localhost/api/action-item?action_id=action_copy", { method: "DELETE" }))

    expect(response.status).toBe(200)
    expect(await json(response)).toEqual({ success: true })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.actionItem.delete).toHaveBeenCalledWith({ where: { action_id: "action_copy" } })
  })

  it("DELETE maps a raced record-not-found result to 404", async () => {
    prismaMock.actionItem.findUnique.mockResolvedValue(baseAction)
    prismaMock.scheduleBlock.count.mockResolvedValue(0)
    prismaMock.actionItem.delete.mockRejectedValue({ code: "P2025" })

    const response = await DELETE(request("http://localhost/api/action-item?action_id=action_copy", { method: "DELETE" }))

    expect(response.status).toBe(404)
    expect(await json(response)).toEqual({ error: "行动项不存在" })
  })
})
