import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const readRootFile = (relativePath: string) => {
  const filePath = path.join(process.cwd(), relativePath)
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : ""
}

const normalizeSql = (sql: string) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),;])\s*/g, "$1")
    .trim()

type DatabaseOnlyInvariant = {
  kind: "check" | "partial_unique_index"
  table: string
  name: string
  expression: string
}

type DatabaseOnlyCheck = Omit<DatabaseOnlyInvariant, "kind">

const findClosingParenthesis = (sql: string, expressionStart: number) => {
  let depth = 1
  let quote: "single" | "double" | null = null

  for (let index = expressionStart; index < sql.length; index += 1) {
    const character = sql[index]
    const nextCharacter = sql[index + 1]

    if (quote === "single") {
      if (character === "'" && nextCharacter === "'") {
        index += 1
      } else if (character === "'") {
        quote = null
      }
      continue
    }

    if (quote === "double") {
      if (character === '"' && nextCharacter === '"') {
        index += 1
      } else if (character === '"') {
        quote = null
      }
      continue
    }

    if (character === "'") {
      quote = "single"
    } else if (character === '"') {
      quote = "double"
    } else if (character === "(") {
      depth += 1
    } else if (character === ")") {
      depth -= 1
      if (depth === 0) return index
    }
  }

  throw new Error("Unclosed CHECK expression")
}

const findOwningTable = (sql: string, invariantStart: number) => {
  const tablePattern = /(?:ALTER|CREATE)\s+TABLE\s+"([^"]+)"/gi
  const sqlBeforeInvariant = sql.slice(0, invariantStart)
  let owningTable: string | undefined

  for (
    let match = tablePattern.exec(sqlBeforeInvariant);
    match;
    match = tablePattern.exec(sqlBeforeInvariant)
  ) {
    owningTable = match[1]
  }

  if (!owningTable) throw new Error("CHECK constraint has no owning table")
  return owningTable
}

const extractDatabaseOnlyInvariants = (sql: string): DatabaseOnlyInvariant[] => {
  const uncommentedSql = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "")
  const invariants: DatabaseOnlyInvariant[] = []
  const checkPattern = /CONSTRAINT\s+"([^"]+)"\s+CHECK\s*\(/gi

  for (let match = checkPattern.exec(uncommentedSql); match; match = checkPattern.exec(uncommentedSql)) {
    const expressionEnd = findClosingParenthesis(uncommentedSql, checkPattern.lastIndex)
    invariants.push({
      kind: "check",
      table: findOwningTable(uncommentedSql, match.index),
      name: match[1],
      expression: normalizeSql(uncommentedSql.slice(checkPattern.lastIndex, expressionEnd)),
    })
    checkPattern.lastIndex = expressionEnd + 1
  }

  const partialUniqueIndexPattern =
    /CREATE\s+UNIQUE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"\s+ON\s+"([^"]+)"[\s\S]*?;/gi

  for (
    let match = partialUniqueIndexPattern.exec(uncommentedSql);
    match;
    match = partialUniqueIndexPattern.exec(uncommentedSql)
  ) {
    if (!/\bWHERE\b/i.test(match[0])) continue

    invariants.push({
      kind: "partial_unique_index",
      table: match[2],
      name: match[1],
      expression: normalizeSql(
        match[0].replace(
          /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS/i,
          "CREATE UNIQUE INDEX",
        ),
      ),
    })
  }

  const latest = new Map<string, DatabaseOnlyInvariant>()
  for (const invariant of invariants) {
    latest.set(`${invariant.kind}:${invariant.table}:${invariant.name}`, invariant)
  }

  return [...latest.values()].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  )
}

const expectExactDatabaseOnlyInvariantParity = (formalSql: string, overlaySql: string) => {
  expect(extractDatabaseOnlyInvariants(overlaySql)).toEqual(
    extractDatabaseOnlyInvariants(formalSql),
  )
}

const expectConditionalConstraintUpgrade = (
  overlaySql: string,
  check: DatabaseOnlyCheck,
) => {
  const dropStatement =
    `ALTER TABLE "${check.table}" DROP CONSTRAINT IF EXISTS "${check.name}";`
  const dropIndex = overlaySql.indexOf(dropStatement)
  expect(dropIndex).toBeGreaterThanOrEqual(0)

  const conditionalStart = overlaySql.lastIndexOf("IF NOT EXISTS (", dropIndex)
  const conditionalEnd = overlaySql.indexOf("END IF;", dropIndex)
  expect(conditionalStart).toBeGreaterThanOrEqual(0)
  expect(conditionalEnd).toBeGreaterThan(dropIndex)

  const upgradeBlock = overlaySql.slice(conditionalStart, conditionalEnd)
  const catalogDefinition =
    `check${check.expression.toLowerCase().replace(/[^a-z0-9_%><=]+/g, "")}`
  expect(upgradeBlock).toContain("FROM pg_constraint")
  expect(upgradeBlock).toContain("pg_get_constraintdef")
  expect(upgradeBlock).toContain(`= '${catalogDefinition}'`)
  expect(normalizeSql(upgradeBlock)).toContain(
    normalizeSql(`
      ALTER TABLE "${check.table}"
      ADD CONSTRAINT "${check.name}" CHECK (${check.expression});
    `),
  )
}

const rawPrismaDbPushPattern = /\b(?:npx\s+)?prisma\s+db\s+push\b/i

const findUnapprovedTrackedRawPushes = () => {
  const result = spawnSync(
    "git",
    [
      "grep",
      "-n",
      "-I",
      "-i",
      "-E",
      "(npx[[:space:]]+)?prisma[[:space:]]+db[[:space:]]+push",
      "--",
      ".",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  )

  if (result.error) throw result.error
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git grep failed: ${result.stderr}`)
  }

  const allowedPackageInternals = new Set([
    '"db:push:schema": "prisma db push",',
    '"db:reset": "prisma db push --force-reset && npm run db:integrity",',
  ])

  return result.stdout
    .split("\n")
    .filter(Boolean)
    .filter((occurrence) => {
      const match = occurrence.match(/^(.*?):(\d+):(.*)$/)
      if (!match) throw new Error(`Unexpected git grep output: ${occurrence}`)

      const [, filePath, , content] = match
      if (filePath === "src/lib/today/schema-contract.test.ts") return false
      if (filePath.startsWith("docs/superpowers/plans/")) return false
      if (filePath === "package.json" && allowedPackageInternals.has(content.trim())) return false
      if (
        filePath === "prisma/today-workspace-integrity.sql" &&
        content.trim() ===
          "-- Idempotent database-only integrity overlay for Prisma db push deployments."
      ) {
        return false
      }
      return true
    })
}

const schema = readRootFile("prisma/schema.prisma")
const migration = readRootFile(
  "prisma/migrations/20260823090000_add_today_workspace_foundation/migration.sql",
)
const timeBudgetMigration = readRootFile(
  "prisma/migrations/20260825120000_add_plan_time_budget/migration.sql",
)
const formalIntegritySql = `${migration}\n${timeBudgetMigration}`
const integrityOverlay = readRootFile("prisma/today-workspace-integrity.sql")
const packageJson = JSON.parse(readRootFile("package.json")) as {
  scripts: Record<string, string>
}
const dockerfile = readRootFile("Dockerfile")
const dockerCompose = readRootFile("docker-compose.yml")
const readme = readRootFile("README.md")
const directDeployScript = readRootFile("deploy-direct.sh")
const setupGuide = readRootFile("setup.md")
const chinaDeployGuide = readRootFile("DEPLOY-CHINA.md")

const databaseOnlyChecks: DatabaseOnlyCheck[] = [
  {
    table: "Plan",
    name: "Plan_estimated_minutes_check",
    expression:
      '"estimated_minutes" IS NULL OR ("estimated_minutes" > 0 AND "estimated_minutes" % 15 = 0)',
  },
  {
    table: "Plan",
    name: "Plan_default_block_minutes_check",
    expression:
      '"default_block_minutes" IS NULL OR ("default_block_minutes" > 0 AND "default_block_minutes" % 15 = 0)',
  },
  {
    table: "Plan",
    name: "Plan_energy_level_check",
    expression: '"energy_level" IS NULL OR "energy_level" IN (\'low\', \'medium\', \'high\')',
  },
  {
    table: "ActionItem",
    name: "ActionItem_estimated_minutes_check",
    expression:
      '"estimated_minutes" IS NULL OR ("estimated_minutes" > 0 AND "estimated_minutes" % 15 = 0)',
  },
  {
    table: "ActionItem",
    name: "ActionItem_energy_level_check",
    expression: '"energy_level" IS NULL OR "energy_level" IN (\'low\', \'medium\', \'high\')',
  },
  {
    table: "ActionItem",
    name: "ActionItem_priority_quadrant_check",
    expression: '"priority_quadrant" IS NULL OR "priority_quadrant" IN (\'q1\', \'q2\', \'q3\', \'q4\')',
  },
  {
    table: "ScheduleBlock",
    name: "ScheduleBlock_time_range_check",
    expression: '"end_at" > "start_at"',
  },
  {
    table: "ScheduleBlock",
    name: "ScheduleBlock_status_check",
    expression:
      '"status" IN (\'scheduled\', \'completed\', \'partial\', \'skipped\', \'cancelled\')',
  },
  {
    table: "ScheduleBlock",
    name: "ScheduleBlock_source_check",
    expression: '"source" IN (\'manual\', \'ai_check\', \'ai_chat\')',
  },
  {
    table: "PlanningPreference",
    name: "PlanningPreference_day_bounds_check",
    expression:
      '0 <= "day_start_minutes" AND "day_start_minutes" < "day_end_minutes" AND "day_end_minutes" <= 1440',
  },
  {
    table: "PlanningPreference",
    name: "PlanningPreference_high_energy_bounds_check",
    expression: `
      ("high_energy_start_minutes" IS NULL AND "high_energy_end_minutes" IS NULL)
      OR (
        "high_energy_start_minutes" IS NOT NULL
        AND "high_energy_end_minutes" IS NOT NULL
        AND "day_start_minutes" <= "high_energy_start_minutes"
        AND "high_energy_start_minutes" < "high_energy_end_minutes"
        AND "high_energy_end_minutes" <= "day_end_minutes"
      )
    `,
  },
  {
    table: "PlanningPreference",
    name: "PlanningPreference_buffer_minutes_check",
    expression: '"buffer_minutes" >= 0',
  },
  {
    table: "PlanningPreference",
    name: "PlanningPreference_default_block_minutes_check",
    expression: '"default_block_minutes" > 0',
  },
  {
    table: "PlanningPreference",
    name: "PlanningPreference_capacity_warning_minutes_check",
    expression: '"capacity_warning_minutes" > 0',
  },
]

const replacedMinuteChecks = databaseOnlyChecks.filter((check) =>
  [
    "Plan_estimated_minutes_check",
    "Plan_default_block_minutes_check",
    "ActionItem_estimated_minutes_check",
  ].includes(check.name),
)

describe("today workspace Prisma contract", () => {
  it("adds planning fields and schedulable entities", () => {
    expect(schema).toMatch(/due_date\s+DateTime\?\s+@db\.Date/)
    expect(schema).toMatch(/estimated_minutes\s+Int\?/)
    expect(schema).toMatch(/default_block_minutes\s+Int\?/)
    expect(schema).toMatch(/energy_level\s+String\?/)
    expect(schema).toContain("model ActionItem")
    expect(schema).toContain("model ScheduleBlock")
    expect(schema).toContain("model PlanningPreference")
    expect(schema).toMatch(/create_fingerprint\s+String\?/)
  })

  it("links schedule-generated progress exactly once", () => {
    expect(schema).toMatch(/schedule_block_id\s+String\?\s+@unique/)
    expect(schema).toMatch(/counts_toward_recurrence\s+Boolean\s+@default\(true\)/)
  })

  it("records the complete database integrity contract in the formal migration", () => {
    const normalizedMigration = normalizeSql(formalIntegritySql)

    for (const check of databaseOnlyChecks) {
      expect(normalizedMigration).toContain(
        normalizeSql(`CONSTRAINT "${check.name}" CHECK (${check.expression})`),
      )
    }

    expect(normalizedMigration).toContain(
      normalizeSql(`
        CREATE UNIQUE INDEX "ScheduleBlock_one_scheduled_per_action_idx"
        ON "ScheduleBlock"("action_id")
        WHERE "action_id" IS NOT NULL AND "status" = 'scheduled';
      `),
    )
    expect(normalizedMigration).toContain(
      normalizeSql(`
        CREATE UNIQUE INDEX "ScheduleBlock_one_scheduled_direct_per_plan_idx"
        ON "ScheduleBlock"("plan_id")
        WHERE "action_id" IS NULL AND "status" = 'scheduled';
      `),
    )
    expect(normalizedMigration).toContain(
      normalizeSql(`
        CREATE UNIQUE INDEX "ProgressRecord_schedule_block_id_key"
        ON "ProgressRecord"("schedule_block_id");
      `),
    )

    const requiredForeignKeys = [
      `ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("plan_id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      `ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("plan_id") ON DELETE CASCADE ON UPDATE CASCADE;`,
      `ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "ActionItem"("action_id") ON DELETE SET NULL ON UPDATE CASCADE;`,
      `ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_schedule_block_id_fkey" FOREIGN KEY ("schedule_block_id") REFERENCES "ScheduleBlock"("block_id") ON DELETE SET NULL ON UPDATE CASCADE;`,
    ]

    for (const foreignKey of requiredForeignKeys) {
      expect(normalizedMigration).toContain(normalizeSql(foreignKey))
    }

    const normalizedTimeBudgetMigration = normalizeSql(timeBudgetMigration)
    expect(normalizedTimeBudgetMigration).toContain(
      normalizeSql(
        'ALTER TABLE "Plan" DROP CONSTRAINT IF EXISTS "Plan_estimated_minutes_check";',
      ),
    )
    expect(normalizedTimeBudgetMigration).toContain(
      normalizeSql(
        'ALTER TABLE "ActionItem" DROP CONSTRAINT IF EXISTS "ActionItem_estimated_minutes_check";',
      ),
    )
  })

  it("applies the time budget migration atomically after safe preflight checks", () => {
    const trimmedMigration = timeBudgetMigration.trim()
    expect(trimmedMigration).toMatch(/^BEGIN;/)
    expect(trimmedMigration).toMatch(/COMMIT;$/)

    const firstMutationIndex = timeBudgetMigration.search(/\b(?:ALTER\s+TABLE|UPDATE)\b/i)
    const duplicatePreflightIndex = timeBudgetMigration.indexOf("duplicate_plan_ids")
    const planOverflowPreflightIndex = timeBudgetMigration.search(
      /FROM\s+"Plan"\s+WHERE\s+"estimated_minutes"\s*>\s*2147483640/i,
    )
    const actionOverflowPreflightIndex = timeBudgetMigration.search(
      /FROM\s+"ActionItem"\s+WHERE\s+"estimated_minutes"\s*>\s*2147483640/i,
    )

    expect(firstMutationIndex).toBeGreaterThanOrEqual(0)
    expect(duplicatePreflightIndex).toBeGreaterThanOrEqual(0)
    expect(planOverflowPreflightIndex).toBeGreaterThanOrEqual(0)
    expect(actionOverflowPreflightIndex).toBeGreaterThanOrEqual(0)
    expect(duplicatePreflightIndex).toBeLessThan(firstMutationIndex)
    expect(planOverflowPreflightIndex).toBeLessThan(firstMutationIndex)
    expect(actionOverflowPreflightIndex).toBeLessThan(firstMutationIndex)
    expect(timeBudgetMigration).toContain(
      "Plan.estimated_minutes exceeds maximum safe 15-minute rounding value",
    )
    expect(timeBudgetMigration).toContain(
      "ActionItem.estimated_minutes exceeds maximum safe 15-minute rounding value",
    )

    const normalizedTimeBudgetMigration = normalizeSql(timeBudgetMigration)
    const safeRoundingExpression =
      '((("estimated_minutes"::bigint + 14) / 15) * 15)::integer'
    expect(normalizedTimeBudgetMigration.split(normalizeSql(safeRoundingExpression))).toHaveLength(
      4,
    )
  })

  it("reapplies database-only integrity rules idempotently after schema push", () => {
    expect(integrityOverlay).toContain(
      "Formal source of truth: prisma/migrations/20260823090000_add_today_workspace_foundation/migration.sql",
    )
    expect(integrityOverlay).toContain(
      "prisma/migrations/20260825120000_add_plan_time_budget/migration.sql",
    )

    const normalizedOverlay = normalizeSql(integrityOverlay)

    for (const check of databaseOnlyChecks) {
      expect(normalizedOverlay).toContain(
        normalizeSql(`
          ALTER TABLE "${check.table}"
          ADD CONSTRAINT "${check.name}" CHECK (${check.expression});
        `),
      )
    }

    expect(normalizedOverlay).toContain(
      normalizeSql(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleBlock_one_scheduled_per_action_idx"
        ON "ScheduleBlock"("action_id")
        WHERE "action_id" IS NOT NULL AND "status" = 'scheduled';
      `),
    )
    expect(normalizedOverlay).toContain(
      normalizeSql(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleBlock_one_scheduled_direct_per_plan_idx"
        ON "ScheduleBlock"("plan_id")
        WHERE "action_id" IS NULL AND "status" = 'scheduled';
      `),
    )
    expect(normalizedOverlay).toContain(
      normalizeSql(`
        UPDATE "Plan"
        SET "estimated_minutes" = ((("estimated_minutes"::bigint + 14) / 15) * 15)::integer
        WHERE "is_recurring" = false
          AND "estimated_minutes" IS NOT NULL
          AND "estimated_minutes" % 15 <> 0;
      `),
    )
    expect(normalizedOverlay).toContain(
      normalizeSql(`
        UPDATE "ActionItem"
        SET "estimated_minutes" = ((("estimated_minutes"::bigint + 14) / 15) * 15)::integer
        WHERE "estimated_minutes" IS NOT NULL
          AND "estimated_minutes" % 15 <> 0;
      `),
    )

    const firstMutationIndex = integrityOverlay.search(/\b(?:ALTER\s+TABLE|UPDATE)\b/i)
    const planOverflowPreflightIndex = integrityOverlay.search(
      /FROM\s+"Plan"\s+WHERE\s+"estimated_minutes"\s*>\s*2147483640/i,
    )
    const actionOverflowPreflightIndex = integrityOverlay.search(
      /FROM\s+"ActionItem"\s+WHERE\s+"estimated_minutes"\s*>\s*2147483640/i,
    )
    expect(planOverflowPreflightIndex).toBeGreaterThanOrEqual(0)
    expect(actionOverflowPreflightIndex).toBeGreaterThanOrEqual(0)
    expect(planOverflowPreflightIndex).toBeLessThan(firstMutationIndex)
    expect(actionOverflowPreflightIndex).toBeLessThan(firstMutationIndex)
    expect(integrityOverlay).toContain(
      "Plan.estimated_minutes exceeds maximum safe 15-minute rounding value",
    )
    expect(integrityOverlay).toContain(
      "ActionItem.estimated_minutes exceeds maximum safe 15-minute rounding value",
    )

    for (const check of replacedMinuteChecks) {
      expectConditionalConstraintUpgrade(integrityOverlay, check)
    }

    expect(integrityOverlay.match(/DO \$\$/g)).toHaveLength(databaseOnlyChecks.length - 1)
    expect(integrityOverlay.match(/EXCEPTION\s+WHEN duplicate_object THEN NULL;/g)).toHaveLength(
      databaseOnlyChecks.length - 3,
    )
    expect(integrityOverlay.match(/ADD\s+CONSTRAINT/gi)).toHaveLength(databaseOnlyChecks.length)
    expect(integrityOverlay).not.toMatch(/CREATE\s+TABLE|ADD\s+COLUMN|FOREIGN\s+KEY/i)
    expect(integrityOverlay.match(/CREATE\s+UNIQUE\s+INDEX/gi)).toHaveLength(2)
    expect(integrityOverlay.match(/CREATE\s+(?:UNIQUE\s+)?INDEX/gi)).toHaveLength(2)
  })

  it("keeps the complete formal and deployed database-only invariant sets identical", () => {
    expectExactDatabaseOnlyInvariantParity(formalIntegritySql, integrityOverlay)
  })

  it("rejects a migration-only invariant in synthetic SQL", () => {
    const sharedSql = `
      ALTER TABLE "Plan"
      ADD CONSTRAINT "shared_check" CHECK ("estimated_minutes" > 0);
    `
    const migrationWithExtraInvariant = `
      ${sharedSql}
      ALTER TABLE "Plan"
      ADD CONSTRAINT "migration_only_check" CHECK ("estimated_minutes" < 10000);
    `

    expect(() =>
      expectExactDatabaseOnlyInvariantParity(migrationWithExtraInvariant, sharedSql),
    ).toThrow()
  })

  it("rejects an identical check assigned to a different table", () => {
    const planCheck = `
      ALTER TABLE "Plan"
      ADD CONSTRAINT "shared_check" CHECK ("estimated_minutes" > 0);
    `
    const actionItemCheck = `
      ALTER TABLE "ActionItem"
      ADD CONSTRAINT "shared_check" CHECK ("estimated_minutes" > 0);
    `

    expect(() => expectExactDatabaseOnlyInvariantParity(planCheck, actionItemCheck)).toThrow()
  })

  it("routes every schema deployment path through the integrity overlay", () => {
    expect(packageJson.scripts["db:generate"]).toBe("prisma generate")
    expect(packageJson.scripts["db:push:schema"]).toBe("prisma db push")
    expect(packageJson.scripts["db:integrity"]).toBe(
      "prisma db execute --file prisma/today-workspace-integrity.sql --schema prisma/schema.prisma",
    )
    expect(packageJson.scripts["db:push"]).toBe(
      "npm run db:push:schema && npm run db:integrity",
    )
    expect(packageJson.scripts["db:deploy"]).toBe("npm run db:push")
    expect(packageJson.scripts["db:reset"]).toBe(
      "prisma db push --force-reset && npm run db:integrity",
    )
    expect(packageJson.scripts.setup).toBe(
      "npm install && npm run db:generate && npm run db:push",
    )

    expect(dockerfile).toContain(
      'CMD ["sh", "-c", "npm run db:deploy && node server.js"]',
    )
    expect(dockerfile).not.toMatch(/\b(?:npx\s+)?prisma\s+db\s+push\b/)
    expect(dockerCompose).toMatch(/npm run db:deploy\s+&&/)
    expect(dockerCompose).not.toMatch(/\b(?:npx\s+)?prisma\s+db\s+push\b/)
    expect(readme).toContain("npm run db:push")
    expect(readme).not.toMatch(/\b(?:npx\s+)?prisma\s+db\s+push\b/)
  })

  it("routes the direct deployment script through the integrity overlay", () => {
    expect(directDeployScript).toContain("npm run db:deploy")
    expect(directDeployScript).not.toMatch(/\b(?:npx\s+)?prisma\s+db\s+push\b/)
  })

  it("routes the setup guide through the integrity overlay", () => {
    expect(setupGuide).toMatch(/npm run db:(?:push|deploy)/)
    expect(setupGuide).not.toMatch(/\b(?:npx\s+)?prisma\s+db\s+push\b/)
  })

  it("routes the China Docker deployment guide through the integrity overlay", () => {
    expect(chinaDeployGuide).toContain("docker exec goal-mate-app npm run db:deploy")
    expect(chinaDeployGuide).not.toMatch(/\b(?:npx\s+)?prisma\s+db\s+push\b/)
  })

  it("rejects unapproved raw Prisma schema pushes in every tracked file", () => {
    expect(findUnapprovedTrackedRawPushes()).toEqual([])
  })

  it("recognizes uppercase and mixed-case raw schema push commands", () => {
    expect(rawPrismaDbPushPattern.test("PRISMA DB PUSH")).toBe(true)
    expect(rawPrismaDbPushPattern.test("nPx\tPrIsMa   dB\tPuSh")).toBe(true)
  })
})
