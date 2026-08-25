import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function read(relativePath: string): string {
  const absolutePath = path.join(root, relativePath)
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : ""
}

describe("goal order database contract", () => {
  it("declares the nullable goal position and its index", () => {
    const schema = read("prisma/schema.prisma")
    expect(schema).toContain("position     Int?")
    expect(schema).toContain("@@index([position])")
  })

  it("backfills a deterministic zero-based order in the formal migration", () => {
    const migration = read("prisma/migrations/20260825233000_add_goal_position/migration.sql")

    expect(migration).toContain("BEGIN;")
    expect(migration).toContain("COMMIT;")
    expect(migration).toContain('ALTER TABLE "Goal" ADD COLUMN "position" INTEGER;')
    expect(migration).toContain('CREATE INDEX "Goal_position_idx"')
    expect(migration).toContain('ROW_NUMBER() OVER')
    expect(migration).toContain('"gmt_create" DESC')
    expect(migration).toContain('"goal_id" ASC')
    expect(migration).toContain('- 1 AS normalized_position')
    expect(migration).toContain('UPDATE "Goal"')
  })

  it("normalizes existing positions safely in the integrity overlay", () => {
    const integrity = read("prisma/today-workspace-integrity.sql")

    expect(integrity).toContain(
      "-- Extended by: prisma/migrations/20260825233000_add_goal_position/migration.sql",
    )
    expect(integrity).toContain('ROW_NUMBER() OVER')
    expect(integrity).toContain('"position" ASC NULLS LAST')
    expect(integrity).toContain('"gmt_create" DESC')
    expect(integrity).toContain('"goal_id" ASC')
    expect(integrity).toContain('- 1 AS normalized_position')
    expect(integrity).toContain('UPDATE "Goal"')
    expect(integrity).toContain('IS DISTINCT FROM ranked_goals.normalized_position')
  })
})
