import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  plan: {
    findMany: vi.fn(),
  },
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

import { GET } from "./route"

describe("GET /api/plan/priority", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("selects and preserves recurrence-counting flags", async () => {
    prismaMock.plan.findMany.mockResolvedValue([{
      plan_id: "plan_daily",
      name: "每日复盘",
      priority_quadrant: "q2",
      tags: [],
      progressRecords: [{
        gmt_create: new Date("2026-08-23T01:00:00.000Z"),
        counts_toward_recurrence: false,
      }],
    }])

    const response = await GET()
    const data = await response.json()

    expect(prismaMock.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        tags: true,
        progressRecords: {
          select: { gmt_create: true, counts_toward_recurrence: true },
          orderBy: { gmt_create: "desc" },
        },
      },
    }))
    expect(data.q2[0].progressRecords).toEqual([{
      gmt_create: "2026-08-23T01:00:00.000Z",
      counts_toward_recurrence: false,
    }])
  })
})
