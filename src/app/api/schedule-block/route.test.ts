import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  prisma: {
    planningPreference: { findUnique: vi.fn() },
    scheduleBlock: { findMany: vi.fn() },
  },
  createScheduleBlock: vi.fn(),
  updateScheduleBlock: vi.fn(),
  cancelScheduleBlock: vi.fn(),
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => mocks.prisma),
}))

vi.mock("@/lib/today/schedule-service", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/today/schedule-service")>()
  return {
    ...actual,
    createScheduleBlock: mocks.createScheduleBlock,
    updateScheduleBlock: mocks.updateScheduleBlock,
    cancelScheduleBlock: mocks.cancelScheduleBlock,
  }
})

import { ScheduleServiceError } from "@/lib/today/schedule-service"

import { GET, POST, PUT } from "./route"

const preference = {
  preference_id: "default",
  timezone: "Asia/Shanghai",
  day_start_minutes: 480,
  day_end_minutes: 1320,
  high_energy_start_minutes: null,
  high_energy_end_minutes: null,
  buffer_minutes: 15,
  default_block_minutes: 60,
  capacity_warning_minutes: 480,
  gmt_modified: new Date("2026-08-23T00:00:00.000Z"),
}

const blockRow = {
  block_id: "block_copy",
  plan_id: "plan_launch",
  action_id: "action_copy",
  start_at: new Date("2026-08-23T01:00:00.000Z"),
  end_at: new Date("2026-08-23T02:00:00.000Z"),
  status: "scheduled",
  source: "manual",
  result_note: null,
  create_fingerprint: "9930edd769cea86f31678beeceac2849b4ace6677e439077a668bd588b146620",
  version: 1,
  plan: {
    plan_id: "plan_launch",
    name: "准备发布",
    energy_level: "high",
    goal: { goal_id: "goal_product", name: "发布 Goal Mate v1" },
  },
  action: {
    action_id: "action_copy",
    plan_id: "plan_launch",
    name: "写发布说明",
    energy_level: "medium",
    is_completed: false,
  },
}

const blockView = {
  block_id: "block_copy",
  plan_id: "plan_launch",
  action_id: "action_copy",
  title: "写发布说明",
  goal_id: "goal_product",
  goal_name: "发布 Goal Mate v1",
  energy_level: "medium",
  start_at: "2026-08-23T01:00:00.000Z",
  end_at: "2026-08-23T02:00:00.000Z",
  status: "scheduled",
  source: "manual",
  result_note: null,
  version: 1,
}

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(url, init)
}

async function json(response: Response) {
  return response.json()
}

describe("/api/schedule-block", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.prisma.planningPreference.findUnique.mockResolvedValue(preference)
    mocks.prisma.scheduleBlock.findMany.mockResolvedValue([blockRow])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ["missing", "http://localhost/api/schedule-block"],
    ["invalid", "http://localhost/api/schedule-block?date=2026-02-30"],
  ])("GET rejects a %s date", async (_label, url) => {
    const response = await GET(request(url))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual(expect.objectContaining({ code: "VALIDATION" }))
    expect(mocks.prisma.planningPreference.findUnique).not.toHaveBeenCalled()
  })

  it("GET uses the saved timezone server-side and returns normalized overlapping blocks", async () => {
    const response = await GET(request(
      "http://localhost/api/schedule-block?date=2026-08-23&timezone=America%2FNew_York",
    ))

    expect(response.status).toBe(200)
    expect(mocks.prisma.planningPreference.findUnique).toHaveBeenCalledWith({
      where: { preference_id: "default" },
    })
    expect(mocks.prisma.scheduleBlock.findMany).toHaveBeenCalledWith({
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
    expect(await json(response)).toEqual({ list: [blockView], total: 1 })
  })

  it("GET uses a server default preference when no row exists", async () => {
    mocks.prisma.planningPreference.findUnique.mockResolvedValue(null)
    mocks.prisma.scheduleBlock.findMany.mockResolvedValue([])

    const response = await GET(request("http://localhost/api/schedule-block?date=2026-08-23"))

    expect(response.status).toBe(200)
    expect(mocks.prisma.scheduleBlock.findMany).toHaveBeenCalledOnce()
  })

  it.each([
    ["missing", undefined],
    ["empty", "   "],
    ["oversized", "x".repeat(129)],
  ])("POST rejects a %s Idempotency-Key", async (_label, key) => {
    const response = await POST(request("http://localhost/api/schedule-block", {
      method: "POST",
      headers: key === undefined ? undefined : { "Idempotency-Key": key },
      body: JSON.stringify({
        plan_id: "plan_launch",
        action_id: "action_copy",
        start_at: "2026-08-23T01:00:00.000Z",
        end_at: "2026-08-23T02:00:00.000Z",
        source: "manual",
      }),
    }))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual(expect.objectContaining({ code: "VALIDATION" }))
    expect(mocks.createScheduleBlock).not.toHaveBeenCalled()
  })

  it("POST passes the header key and strict body to the service", async () => {
    mocks.createScheduleBlock.mockResolvedValue(blockView)

    const response = await POST(request("http://localhost/api/schedule-block", {
      method: "POST",
      headers: { "Idempotency-Key": " schedule-copy-v1 " },
      body: JSON.stringify({
        plan_id: "plan_launch",
        action_id: "action_copy",
        start_at: "2026-08-23T01:00:00.000Z",
        end_at: "2026-08-23T02:00:00.000Z",
        status: "scheduled",
        source: "manual",
      }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.createScheduleBlock).toHaveBeenCalledWith(mocks.prisma, {
      idempotency_key: "schedule-copy-v1",
      plan_id: "plan_launch",
      action_id: "action_copy",
      start_at: "2026-08-23T01:00:00.000Z",
      end_at: "2026-08-23T02:00:00.000Z",
      status: "scheduled",
      source: "manual",
    })
    expect(await json(response)).toEqual(blockView)
  })

  it.each([
    ["malformed JSON", "{", "Idempotency-Key", "schedule-copy-v1"],
    ["non-object JSON", "[]", "Idempotency-Key", "schedule-copy-v1"],
    ["caller timezone", JSON.stringify({ plan_id: "plan_launch", timezone: "UTC" }), "Idempotency-Key", "schedule-copy-v1"],
  ])("POST rejects %s before delegation", async (_label, body, headerName, headerValue) => {
    const response = await POST(request("http://localhost/api/schedule-block", {
      method: "POST",
      headers: { [headerName]: headerValue },
      body,
    }))

    expect(response.status).toBe(400)
    expect(mocks.createScheduleBlock).not.toHaveBeenCalled()
  })

  it("PUT delegates update and cancel operations with only their allowed fields", async () => {
    mocks.updateScheduleBlock.mockResolvedValue({ ...blockView, version: 2 })
    mocks.cancelScheduleBlock.mockResolvedValue({ ...blockView, status: "cancelled", version: 2 })

    const updateResponse = await PUT(request("http://localhost/api/schedule-block", {
      method: "PUT",
      body: JSON.stringify({
        operation: "update",
        block_id: "block_copy",
        expected_version: 1,
        start_at: "2026-08-23T02:00:00.000Z",
        end_at: "2026-08-23T03:00:00.000Z",
      }),
    }))
    const cancelResponse = await PUT(request("http://localhost/api/schedule-block", {
      method: "PUT",
      body: JSON.stringify({
        operation: "cancel",
        block_id: "block_copy",
        expected_version: 1,
      }),
    }))

    expect(updateResponse.status).toBe(200)
    expect(cancelResponse.status).toBe(200)
    expect(mocks.updateScheduleBlock).toHaveBeenCalledWith(mocks.prisma, {
      block_id: "block_copy",
      expected_version: 1,
      start_at: "2026-08-23T02:00:00.000Z",
      end_at: "2026-08-23T03:00:00.000Z",
    })
    expect(mocks.cancelScheduleBlock).toHaveBeenCalledWith(mocks.prisma, {
      block_id: "block_copy",
      expected_version: 1,
    })
  })

  it.each([
    ["missing operation", { block_id: "block_copy", expected_version: 1 }],
    ["unknown operation", { operation: "delete", block_id: "block_copy", expected_version: 1 }],
    ["missing update version", { operation: "update", block_id: "block_copy", start_at: "x", end_at: "y" }],
    ["cancel extras", { operation: "cancel", block_id: "block_copy", expected_version: 1, now: "2020-01-01" }],
  ])("PUT rejects %s before delegation", async (_label, body) => {
    const response = await PUT(request("http://localhost/api/schedule-block", {
      method: "PUT",
      body: JSON.stringify(body),
    }))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual(expect.objectContaining({ code: "VALIDATION" }))
    expect(mocks.updateScheduleBlock).not.toHaveBeenCalled()
    expect(mocks.cancelScheduleBlock).not.toHaveBeenCalled()
  })

  it.each([
    ["VALIDATION", 400],
    ["NOT_FOUND", 404],
    ["SCHEDULE_CONFLICT", 409],
    ["ACTION_ALREADY_SCHEDULED", 409],
    ["STALE_VERSION", 409],
  ] as const)("maps %s to %i", async (code, status) => {
    mocks.createScheduleBlock.mockRejectedValue(new ScheduleServiceError(code, "domain failure", ["busy"]))

    const response = await POST(request("http://localhost/api/schedule-block", {
      method: "POST",
      headers: { "Idempotency-Key": "schedule-copy-v1" },
      body: JSON.stringify({
        plan_id: "plan_launch",
        action_id: "action_copy",
        start_at: "2026-08-23T01:00:00.000Z",
        end_at: "2026-08-23T02:00:00.000Z",
      }),
    }))

    expect(response.status).toBe(status)
    expect(await json(response)).toEqual({
      error: "domain failure",
      code,
      conflictIds: ["busy"],
    })
  })
})
