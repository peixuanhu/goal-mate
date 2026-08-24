import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const prismaMock = vi.hoisted(() => ({
  planningPreference: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

import { GET, PUT } from "./route"

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/planning-preference", {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

function rawRequest(body: string): NextRequest {
  return new NextRequest("http://localhost/api/planning-preference", {
    method: "PUT",
    body,
  })
}

async function json(response: Response) {
  return response.json()
}

const preferenceFields = {
  timezone: "Asia/Shanghai",
  day_start_minutes: 480,
  day_end_minutes: 1320,
  high_energy_start_minutes: null,
  high_energy_end_minutes: null,
  buffer_minutes: 15,
  default_block_minutes: 60,
  capacity_warning_minutes: 480,
}

const savedPreference = {
  id: 1,
  gmt_create: new Date("2026-08-01T00:00:00.000Z"),
  gmt_modified: new Date("2026-08-23T00:00:00.000Z"),
  preference_id: "default",
  ...preferenceFields,
}

describe("/api/planning-preference", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("GET returns defaults without writing when the singleton is absent", async () => {
    prismaMock.planningPreference.findUnique.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(prismaMock.planningPreference.findUnique).toHaveBeenCalledWith({
      where: { preference_id: "default" },
    })
    expect(await json(response)).toEqual({
      preference_id: "default",
      timezone: expect.any(String),
      day_start_minutes: 480,
      day_end_minutes: 1320,
      high_energy_start_minutes: null,
      high_energy_end_minutes: null,
      buffer_minutes: 15,
      default_block_minutes: 60,
      capacity_warning_minutes: 480,
      version: null,
    })
    expect(prismaMock.planningPreference.upsert).not.toHaveBeenCalled()
  })

  it("GET maps a saved row to its public API version without DB metadata", async () => {
    prismaMock.planningPreference.findUnique.mockResolvedValue(savedPreference)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await json(response)).toEqual({
      preference_id: "default",
      ...preferenceFields,
      version: "2026-08-23T00:00:00.000Z",
    })
  })

  it("PUT upserts only persisted fields under the fixed singleton key", async () => {
    const updatedFields = {
      ...preferenceFields,
      default_block_minutes: 45,
      capacity_warning_minutes: 420,
    }
    prismaMock.planningPreference.upsert.mockResolvedValue({
      ...savedPreference,
      ...updatedFields,
      gmt_modified: new Date("2026-08-23T01:02:03.000Z"),
    })

    const response = await PUT(request({
      preference_id: "caller-controlled",
      ...updatedFields,
      version: "stale-client-version",
      id: 999,
      gmt_create: "2000-01-01T00:00:00.000Z",
      gmt_modified: "2000-01-01T00:00:00.000Z",
      arbitrary_field: "must-not-reach-prisma",
    }))

    expect(response.status).toBe(200)
    expect(prismaMock.planningPreference.upsert).toHaveBeenCalledWith({
      where: { preference_id: "default" },
      create: {
        preference_id: "default",
        ...updatedFields,
      },
      update: updatedFields,
    })
    expect(await json(response)).toEqual({
      preference_id: "default",
      ...updatedFields,
      version: "2026-08-23T01:02:03.000Z",
    })
  })

  it("PUT returns the plain-object validator message for malformed JSON", async () => {
    const response = await PUT(rawRequest("{"))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "planning preference must be a plain object" })
    expect(prismaMock.planningPreference.upsert).not.toHaveBeenCalled()
  })

  it.each([null, [], "preference"])(
    "PUT rejects non-object JSON %j with the validator message",
    async body => {
      const response = await PUT(request(body))

      expect(response.status).toBe(400)
      expect(await json(response)).toEqual({ error: "planning preference must be a plain object" })
      expect(prismaMock.planningPreference.upsert).not.toHaveBeenCalled()
    },
  )

  it("PUT returns a validator failure before persistence", async () => {
    const response = await PUT(request({ ...preferenceFields, timezone: "Not/A_Timezone" }))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: "timezone must be a valid IANA timezone" })
    expect(prismaMock.planningPreference.upsert).not.toHaveBeenCalled()
  })

  it("PUT rejects a default block outside the 15-minute lattice before persistence", async () => {
    const response = await PUT(request({ ...preferenceFields, default_block_minutes: 50 }))

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({
      error: "default_block_minutes must use 15-minute increments",
    })
    expect(prismaMock.planningPreference.upsert).not.toHaveBeenCalled()
  })

  it("PUT does not misclassify persistence failures as validation errors", async () => {
    prismaMock.planningPreference.upsert.mockRejectedValue(new Error("database unavailable"))

    await expect(PUT(request(preferenceFields))).rejects.toThrow("database unavailable")
  })

  it.each([
    ["day_start_minutes", 2_147_483_648],
    ["day_end_minutes", 2_147_483_648],
    ["high_energy_start_minutes", 2_147_483_648],
    ["high_energy_end_minutes", 2_147_483_648],
    ["buffer_minutes", 2_147_483_648],
    ["default_block_minutes", 2_147_483_648],
    ["capacity_warning_minutes", 2_147_483_648],
  ])("PUT rejects %s above the PostgreSQL Int maximum", async (field, value) => {
    const response = await PUT(request({ ...preferenceFields, [field]: value }))

    expect(response.status).toBe(400)
    expect(prismaMock.planningPreference.upsert).not.toHaveBeenCalled()
  })
})
