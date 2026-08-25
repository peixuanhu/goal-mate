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

  it("backfills a deterministic zero-based order in both database paths", () => {
    const migration = read("prisma/migrations/20260825233000_add_goal_position/migration.sql")
    const integrity = read("prisma/today-workspace-integrity.sql")

    for (const sql of [migration, integrity]) {
      expect(sql).toContain('ROW_NUMBER() OVER')
      expect(sql).toContain('"gmt_create" DESC')
      expect(sql).toContain('"goal_id" ASC')
      expect(sql).toContain('- 1 AS normalized_position')
      expect(sql).toContain('UPDATE "Goal"')
    }
  })
})
