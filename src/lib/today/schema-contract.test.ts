import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8")

describe("today workspace Prisma contract", () => {
  it("adds planning fields and schedulable entities", () => {
    expect(schema).toMatch(/due_date\s+DateTime\?\s+@db\.Date/)
    expect(schema).toMatch(/estimated_minutes\s+Int\?/)
    expect(schema).toMatch(/energy_level\s+String\?/)
    expect(schema).toContain("model ActionItem")
    expect(schema).toContain("model ScheduleBlock")
    expect(schema).toContain("model PlanningPreference")
  })

  it("links schedule-generated progress exactly once", () => {
    expect(schema).toMatch(/schedule_block_id\s+String\?\s+@unique/)
    expect(schema).toMatch(/counts_toward_recurrence\s+Boolean\s+@default\(true\)/)
  })
})
