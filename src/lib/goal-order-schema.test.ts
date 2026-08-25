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

  it("serializes integrity normalization with the application goal-order lock", () => {
    const integrity = read("prisma/today-workspace-integrity.sql")
    const goalOrderSource = read("src/lib/goal-order.ts")
    const lockNamespaceMatch = goalOrderSource.match(
      /export const GOAL_ORDER_LOCK_NAMESPACE = (\d+)/,
    )

    expect(lockNamespaceMatch).not.toBeNull()
    const lockNamespace = lockNamespaceMatch?.[1]
    const preflightStart = integrity.indexOf("DO $$")
    const preflightTerminator = "END\n$$;"
    const preflightEnd = integrity.indexOf(preflightTerminator, preflightStart)
    const transactionStart = integrity.indexOf(
      "BEGIN;",
      preflightEnd + preflightTerminator.length,
    )
    const lock = integrity.indexOf(
      `SELECT pg_advisory_xact_lock(${lockNamespace}::int);`,
      transactionStart,
    )
    const rankedGoals = integrity.indexOf("WITH ranked_goals AS", lock)
    const goalUpdate = integrity.indexOf('UPDATE "Goal" AS goal', rankedGoals)
    const goalUpdateTerminator = "IS DISTINCT FROM ranked_goals.normalized_position;"
    const goalUpdateEnd = integrity.indexOf(
      goalUpdateTerminator,
      goalUpdate,
    )
    const transactionEnd = integrity.indexOf("COMMIT;", goalUpdateEnd)
    const nextIntegrityWrite = integrity.indexOf('UPDATE "Plan"', transactionEnd)

    expect(preflightStart).toBeGreaterThanOrEqual(0)
    expect(preflightEnd).toBeGreaterThan(preflightStart)
    expect(transactionStart).toBeGreaterThan(preflightEnd)
    expect(lock).toBeGreaterThan(transactionStart)
    expect(rankedGoals).toBeGreaterThan(lock)
    expect(goalUpdate).toBeGreaterThan(rankedGoals)
    expect(goalUpdateEnd).toBeGreaterThan(goalUpdate)
    expect(transactionEnd).toBeGreaterThan(goalUpdateEnd)
    expect(nextIntegrityWrite).toBeGreaterThan(transactionEnd)
    expect(
      integrity.slice(goalUpdateEnd + goalUpdateTerminator.length, transactionEnd).trim(),
    ).toBe("")
  })
})
