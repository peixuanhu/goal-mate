import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  prisma: {},
  completeScheduleBlock: vi.fn(),
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => mocks.prisma),
}))

vi.mock("@/lib/today/completion-service", () => ({
  completeScheduleBlock: mocks.completeScheduleBlock,
}))

import { ScheduleServiceError } from "@/lib/today/schedule-service"

import { POST } from "./route"

const completedView = {
  block_id: "block_copy",
  plan_id: "plan_launch",
  action_id: "action_copy",
  title: "写发布说明",
  goal_id: "goal_product",
  goal_name: "发布 Goal Mate v1",
  energy_level: "medium",
  start_at: "2026-08-23T01:00:00.000Z",
  end_at: "2026-08-23T02:00:00.000Z",
  status: "completed",
  source: "manual",
  result_note: "发布完成",
  version: 2,
}

function request(body: BodyInit): NextRequest {
  return new NextRequest("http://localhost/api/schedule-block/complete", {
    method: "POST",
    body,
  })
}

async function json(response: Response) {
  return response.json()
}

describe("POST /api/schedule-block/complete", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.completeScheduleBlock.mockResolvedValue(completedView)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("delegates the strict completion body and returns the normalized block", async () => {
    const response = await POST(request(JSON.stringify({
      block_id: " block_copy ",
      expected_version: 1,
      outcome: "completed",
      content: "发布了首版",
      thinking: "保护深度工作时段",
      result_note: "发布完成",
      plan_progress: 0.75,
    })))

    expect(response.status).toBe(200)
    expect(mocks.completeScheduleBlock).toHaveBeenCalledWith(mocks.prisma, {
      block_id: "block_copy",
      expected_version: 1,
      outcome: "completed",
      content: "发布了首版",
      thinking: "保护深度工作时段",
      result_note: "发布完成",
      plan_progress: 0.75,
    })
    expect(await json(response)).toEqual(completedView)
  })

  it("accepts an empty optional text string without inventing content", async () => {
    const response = await POST(request(JSON.stringify({
      block_id: "block_copy",
      expected_version: 1,
      outcome: "partial",
      content: "",
    })))

    expect(response.status).toBe(200)
    expect(mocks.completeScheduleBlock).toHaveBeenCalledWith(mocks.prisma, {
      block_id: "block_copy",
      expected_version: 1,
      outcome: "partial",
      content: "",
    })
  })

  it("accepts the terminal max-1 version boundary", async () => {
    const response = await POST(request(JSON.stringify({
      block_id: "block_copy",
      expected_version: 2_147_483_646,
      outcome: "completed",
    })))

    expect(response.status).toBe(200)
    expect(mocks.completeScheduleBlock).toHaveBeenCalledWith(mocks.prisma, {
      block_id: "block_copy",
      expected_version: 2_147_483_646,
      outcome: "completed",
    })
  })

  it.each([
    ["malformed JSON", "{"],
    ["non-object JSON", "[]"],
    ["unexpected field", JSON.stringify({
      block_id: "block_copy",
      expected_version: 1,
      outcome: "completed",
      operation: "complete",
    })],
    ["missing block id", JSON.stringify({ expected_version: 1, outcome: "completed" })],
    ["zero version", JSON.stringify({ block_id: "block_copy", expected_version: 0, outcome: "completed" })],
    ["terminal overflow version", JSON.stringify({ block_id: "block_copy", expected_version: 2_147_483_647, outcome: "completed" })],
    ["PostgreSQL integer overflow version", JSON.stringify({ block_id: "block_copy", expected_version: 2_147_483_648, outcome: "completed" })],
    ["unsafe version", JSON.stringify({ block_id: "block_copy", expected_version: Number.MAX_SAFE_INTEGER + 1, outcome: "completed" })],
    ["unknown outcome", JSON.stringify({ block_id: "block_copy", expected_version: 1, outcome: "cancelled" })],
    ["nullable text", JSON.stringify({ block_id: "block_copy", expected_version: 1, outcome: "completed", content: null })],
    ["nullable progress", JSON.stringify({ block_id: "block_copy", expected_version: 1, outcome: "completed", plan_progress: null })],
    ["overflow progress", JSON.stringify({ block_id: "block_copy", expected_version: 1, outcome: "completed", plan_progress: 1.01 })],
  ])("rejects %s before delegation", async (_label, body) => {
    const response = await POST(request(body))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual(expect.objectContaining({ code: "VALIDATION" }))
    expect(mocks.completeScheduleBlock).not.toHaveBeenCalled()
  })

  it("rejects an infinite JSON number before delegation", async () => {
    const response = await POST(request(
      '{"block_id":"block_copy","expected_version":1e400,"outcome":"completed"}',
    ))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual(expect.objectContaining({ code: "VALIDATION" }))
    expect(mocks.completeScheduleBlock).not.toHaveBeenCalled()
  })

  it.each([
    ["VALIDATION", 400],
    ["NOT_FOUND", 404],
    ["STALE_VERSION", 409],
    ["SCHEDULE_CONFLICT", 409],
    ["ACTION_ALREADY_SCHEDULED", 409],
  ] as const)("maps %s domain failures to %i", async (code, status) => {
    mocks.completeScheduleBlock.mockRejectedValue(new ScheduleServiceError(code, "完成失败", ["block_copy"]))

    const response = await POST(request(JSON.stringify({
      block_id: "block_copy",
      expected_version: 1,
      outcome: "completed",
    })))

    expect(response.status).toBe(status)
    expect(await json(response)).toEqual({
      error: "完成失败",
      code,
      conflictIds: ["block_copy"],
    })
  })

  it("rethrows unknown failures", async () => {
    const failure = new Error("database unavailable")
    mocks.completeScheduleBlock.mockRejectedValue(failure)

    await expect(POST(request(JSON.stringify({
      block_id: "block_copy",
      expected_version: 1,
      outcome: "completed",
    })))).rejects.toBe(failure)
  })
})
