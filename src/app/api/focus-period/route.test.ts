import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const prismaMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(prismaMock)),
  focusPeriod: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  goal: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
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

describe("/api/focus-period", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("GET returns periods and marks deleted goals as null", async () => {
    prismaMock.focusPeriod.findMany.mockResolvedValue([
      {
        period_id: "period_music",
        year: 2026,
        start_date: new Date("2026-05-01T00:00:00.000Z"),
        end_date: new Date("2026-06-30T00:00:00.000Z"),
        goal_id: "goal_music",
        color: "#0f766e",
      },
      {
        period_id: "period_old",
        year: 2026,
        start_date: new Date("2026-07-01T00:00:00.000Z"),
        end_date: new Date("2026-07-31T00:00:00.000Z"),
        goal_id: "goal_deleted",
        color: "#ea580c",
      },
    ])
    prismaMock.focusPeriod.count.mockResolvedValue(2)
    prismaMock.goal.findMany.mockResolvedValue([
      { goal_id: "goal_music", name: "学习吉他与编曲", tag: "音乐" },
    ])

    const response = await GET(request("http://localhost/api/focus-period?year=2026"))

    expect(response.status).toBe(200)
    expect(await json(response)).toEqual({
      list: [
        {
          period_id: "period_music",
          year: 2026,
          start_date: "2026-05-01",
          end_date: "2026-06-30",
          goal_id: "goal_music",
          color: "#0f766e",
          goal: { goal_id: "goal_music", name: "学习吉他与编曲", tag: "音乐" },
        },
        {
          period_id: "period_old",
          year: 2026,
          start_date: "2026-07-01",
          end_date: "2026-07-31",
          goal_id: "goal_deleted",
          color: "#ea580c",
          goal: null,
        },
      ],
      total: 2,
    })
    expect(prismaMock.focusPeriod.findMany).toHaveBeenCalledWith({
      where: { year: 2026 },
      orderBy: { start_date: "asc" },
    })
    expect(prismaMock.goal.findMany).toHaveBeenCalledWith({
      where: { goal_id: { in: ["goal_music", "goal_deleted"] } },
      select: { goal_id: true, name: true, tag: true },
    })
  })

  it("GET rejects non-integer years", async () => {
    const response = await GET(request("http://localhost/api/focus-period?year=2026.5"))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "year must be an integer" })
    expect(prismaMock.focusPeriod.findMany).not.toHaveBeenCalled()
  })

  it("POST rejects overlapping periods before creating", async () => {
    prismaMock.focusPeriod.findMany.mockResolvedValue([
      {
        period_id: "period_music",
        start_date: new Date("2026-05-01T00:00:00.000Z"),
        end_date: new Date("2026-06-30T00:00:00.000Z"),
      },
    ])

    const response = await POST(
      request("http://localhost/api/focus-period", {
        method: "POST",
        body: JSON.stringify({
          year: 2026,
          start_date: "2026-06-01",
          end_date: "2026-07-31",
          goal_id: "goal_music",
          color: "#0f766e",
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "同一年内的专注阶段不能重叠" })
    expect(prismaMock.goal.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.focusPeriod.create).not.toHaveBeenCalled()
  })

  it("POST rejects invalid years before querying Prisma", async () => {
    const response = await POST(
      request("http://localhost/api/focus-period", {
        method: "POST",
        body: JSON.stringify({
          year: "2026",
          start_date: "2026-07-01",
          end_date: "2026-08-31",
          goal_id: "goal_music",
          color: "#ea580c",
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "年份必须是整数" })
    expect(prismaMock.focusPeriod.findMany).not.toHaveBeenCalled()
    expect(prismaMock.focusPeriod.create).not.toHaveBeenCalled()
  })

  it("POST rejects malformed JSON with a validation error", async () => {
    const response = await POST(
      request("http://localhost/api/focus-period", {
        method: "POST",
        body: "{",
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "请求体必须是有效 JSON 对象" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("POST rejects missing goals", async () => {
    prismaMock.focusPeriod.findMany.mockResolvedValue([])
    prismaMock.goal.findUnique.mockResolvedValue(null)

    const response = await POST(
      request("http://localhost/api/focus-period", {
        method: "POST",
        body: JSON.stringify({
          year: 2026,
          start_date: "2026-07-01",
          end_date: "2026-08-31",
          goal_id: "goal_missing",
          color: "#ea580c",
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "目标不存在" })
    expect(prismaMock.focusPeriod.create).not.toHaveBeenCalled()
  })

  it("POST creates and returns a mapped focus period", async () => {
    prismaMock.focusPeriod.findMany.mockResolvedValue([])
    prismaMock.goal.findUnique.mockResolvedValue({
      goal_id: "goal_music",
      name: "学习吉他与编曲",
      tag: "音乐",
    })
    prismaMock.focusPeriod.create.mockResolvedValue({
      period_id: "focus_created",
      year: 2026,
      start_date: new Date("2026-07-01T00:00:00.000Z"),
      end_date: new Date("2026-08-31T00:00:00.000Z"),
      goal_id: "goal_music",
      color: "#ea580c",
    })

    const response = await POST(
      request("http://localhost/api/focus-period", {
        method: "POST",
        body: JSON.stringify({
          year: 2026,
          start_date: "2026-07-01",
          end_date: "2026-08-31",
          goal_id: "goal_music",
          color: "#ea580c",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1)
    expect(prismaMock.focusPeriod.create).toHaveBeenCalledWith({
      data: {
        period_id: expect.stringMatching(/^focus_[a-f0-9]{10}$/),
        year: 2026,
        start_date: new Date("2026-07-01T00:00:00.000Z"),
        end_date: new Date("2026-08-31T00:00:00.000Z"),
        goal_id: "goal_music",
        color: "#ea580c",
      },
    })
    expect(await json(response)).toEqual({
      period_id: "focus_created",
      year: 2026,
      start_date: "2026-07-01",
      end_date: "2026-08-31",
      goal_id: "goal_music",
      color: "#ea580c",
      goal: { goal_id: "goal_music", name: "学习吉他与编曲", tag: "音乐" },
    })
  })

  it("PUT validates while ignoring the updated period and returns the mapped record", async () => {
    prismaMock.focusPeriod.findUnique.mockResolvedValue({
      period_id: "period_music",
      year: 2026,
    })
    prismaMock.focusPeriod.findMany.mockResolvedValue([
      {
        period_id: "period_music",
        start_date: new Date("2026-05-01T00:00:00.000Z"),
        end_date: new Date("2026-06-30T00:00:00.000Z"),
      },
    ])
    prismaMock.goal.findUnique.mockResolvedValue({
      goal_id: "goal_music",
      name: "学习吉他与编曲",
      tag: "音乐",
    })
    prismaMock.focusPeriod.update.mockResolvedValue({
      period_id: "period_music",
      year: 2026,
      start_date: new Date("2026-05-15T00:00:00.000Z"),
      end_date: new Date("2026-06-15T00:00:00.000Z"),
      goal_id: "goal_music",
      color: "#0f766e",
    })

    const response = await PUT(
      request("http://localhost/api/focus-period", {
        method: "PUT",
        body: JSON.stringify({
          period_id: "period_music",
          year: 2026,
          start_date: "2026-05-15",
          end_date: "2026-06-15",
          goal_id: "goal_music",
          color: "#0f766e",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1)
    expect(prismaMock.focusPeriod.update).toHaveBeenCalledWith({
      where: { period_id: "period_music" },
      data: {
        year: 2026,
        start_date: new Date("2026-05-15T00:00:00.000Z"),
        end_date: new Date("2026-06-15T00:00:00.000Z"),
        goal_id: "goal_music",
        color: "#0f766e",
      },
    })
    expect(await json(response)).toMatchObject({
      period_id: "period_music",
      start_date: "2026-05-15",
      end_date: "2026-06-15",
      goal: { goal_id: "goal_music", name: "学习吉他与编曲", tag: "音乐" },
    })
  })

  it("PUT rejects nonexistent periods", async () => {
    prismaMock.focusPeriod.findUnique.mockResolvedValue(null)

    const response = await PUT(
      request("http://localhost/api/focus-period", {
        method: "PUT",
        body: JSON.stringify({
          period_id: "period_missing",
          year: 2026,
          start_date: "2026-05-15",
          end_date: "2026-06-15",
          goal_id: "goal_music",
          color: "#0f766e",
        }),
      }),
    )

    expect(response.status).toBe(404)
    expect(await json(response)).toEqual({ success: false, message: "专注阶段不存在" })
    expect(prismaMock.focusPeriod.findMany).not.toHaveBeenCalled()
    expect(prismaMock.focusPeriod.update).not.toHaveBeenCalled()
  })

  it("PUT rejects invalid years before querying Prisma", async () => {
    const response = await PUT(
      request("http://localhost/api/focus-period", {
        method: "PUT",
        body: JSON.stringify({
          period_id: "period_music",
          year: "2026",
          start_date: "2026-05-15",
          end_date: "2026-06-15",
          goal_id: "goal_music",
          color: "#0f766e",
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "年份必须是整数" })
    expect(prismaMock.focusPeriod.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.focusPeriod.findMany).not.toHaveBeenCalled()
    expect(prismaMock.focusPeriod.update).not.toHaveBeenCalled()
  })

  it("PUT rejects null JSON bodies with a validation error", async () => {
    const response = await PUT(
      request("http://localhost/api/focus-period", {
        method: "PUT",
        body: "null",
      }),
    )

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "请求体必须是有效 JSON 对象" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("DELETE requires period_id and deletes matching periods", async () => {
    const missingResponse = await DELETE(request("http://localhost/api/focus-period"))

    expect(missingResponse.status).toBe(400)
    expect(await json(missingResponse)).toEqual({ error: "period_id required" })

    prismaMock.focusPeriod.findUnique.mockResolvedValue({
      period_id: "period_music",
    })

    const response = await DELETE(request("http://localhost/api/focus-period?period_id=period_music"))

    expect(response.status).toBe(200)
    expect(await json(response)).toEqual({ success: true })
    expect(prismaMock.focusPeriod.delete).toHaveBeenCalledWith({
      where: { period_id: "period_music" },
    })
  })

  it("DELETE rejects nonexistent periods", async () => {
    prismaMock.focusPeriod.findUnique.mockResolvedValue(null)

    const response = await DELETE(request("http://localhost/api/focus-period?period_id=period_missing"))

    expect(response.status).toBe(404)
    expect(await json(response)).toEqual({ success: false, message: "专注阶段不存在" })
    expect(prismaMock.focusPeriod.delete).not.toHaveBeenCalled()
  })
})
