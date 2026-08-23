import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  prisma: { marker: "today-prisma" },
  loadTodayView: vi.fn(),
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => mocks.prisma),
}))

vi.mock("@/lib/today/query", () => ({
  loadTodayView: mocks.loadTodayView,
}))

import { GET } from "./route"

describe("GET /api/today", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the exact missing-date validation error", async () => {
    const response = await GET(new NextRequest("http://localhost/api/today"))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "date required" })
    expect(mocks.loadTodayView).not.toHaveBeenCalled()
  })

  it("returns the exact invalid-date validation error", async () => {
    const response = await GET(new NextRequest("http://localhost/api/today?date=2026-02-30"))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "date must be a valid yyyy-mm-dd value" })
    expect(mocks.loadTodayView).not.toHaveBeenCalled()
  })

  it("delegates a valid normalized date and returns the aggregate as JSON", async () => {
    const todayView = {
      date: "2026-08-23",
      preference: {
        preference_id: "default",
        timezone: "Asia/Shanghai",
        day_start_minutes: 480,
        day_end_minutes: 1320,
        high_energy_start_minutes: null,
        high_energy_end_minutes: null,
        buffer_minutes: 15,
        default_block_minutes: 60,
        capacity_warning_minutes: 480,
        version: null,
      },
      focus: null,
      candidates: [],
      blocks: [],
      checks: [],
    }
    mocks.loadTodayView.mockResolvedValue(todayView)

    const response = await GET(new NextRequest("http://localhost/api/today?date=2026-08-23"))

    expect(response.status).toBe(200)
    expect(mocks.loadTodayView).toHaveBeenCalledOnce()
    expect(mocks.loadTodayView).toHaveBeenCalledWith(mocks.prisma, "2026-08-23")
    expect(await response.json()).toEqual(todayView)
  })

  it("returns a stable 500 without exposing an internal Error message", async () => {
    const failure = new Error("password authentication failed for user internal_admin")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.loadTodayView.mockRejectedValue(failure)

    const response = await GET(new NextRequest("http://localhost/api/today?date=2026-08-23"))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "今日数据加载失败" })
    expect(consoleError).toHaveBeenCalledWith("[today] loadTodayView failed", failure)
  })

  it("returns the same stable 500 for non-Error query failures", async () => {
    const failure = "database unavailable"
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.loadTodayView.mockRejectedValue(failure)

    const response = await GET(new NextRequest("http://localhost/api/today?date=2026-08-23"))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "今日数据加载失败" })
    expect(consoleError).toHaveBeenCalledWith("[today] loadTodayView failed", failure)
  })
})
