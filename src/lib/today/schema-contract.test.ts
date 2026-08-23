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

  return invariants.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  )
}

const expectExactDatabaseOnlyInvariantParity = (formalSql: string, overlaySql: string) => {
  expect(extractDatabaseOnlyInvariants(overlaySql)).toEqual(
    extractDatabaseOnlyInvariants(formalSql),
  )
}

const schema = readRootFile("prisma/schema.prisma")
const migration = readRootFile(
  "prisma/migrations/20260823090000_add_today_workspace_foundation/migration.sql",
)
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

const databaseOnlyChecks = [
  {
    table: "Plan",
    name: "Plan_estimated_minutes_check",
    expression: '"estimated_minutes" IS NULL OR "estimated_minutes" > 0',
  },
  {
    table: "Plan",
    name: "Plan_energy_level_check",
    expression: '"energy_level" IS NULL OR "energy_level" IN (\'low\', \'medium\', \'high\')',
  },
  {
    table: "ActionItem",
    name: "ActionItem_estimated_minutes_check",
    expression: '"estimated_minutes" IS NULL OR "estimated_minutes" > 0',
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

  it("records the complete database integrity contract in the formal migration", () => {
    const normalizedMigration = normalizeSql(migration)

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
  })

  it("reapplies database-only integrity rules idempotently after schema push", () => {
    expect(integrityOverlay).toContain(
      "Formal source of truth: prisma/migrations/20260823090000_add_today_workspace_foundation/migration.sql",
    )

    const normalizedOverlay = normalizeSql(integrityOverlay)

    for (const check of databaseOnlyChecks) {
      expect(normalizedOverlay).toContain(
        normalizeSql(`
          DO $$
          BEGIN
            ALTER TABLE "${check.table}"
            ADD CONSTRAINT "${check.name}" CHECK (${check.expression});
          EXCEPTION
            WHEN duplicate_object THEN NULL;
          END
          $$;
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
    expect(integrityOverlay.match(/DO \$\$/g)).toHaveLength(databaseOnlyChecks.length)
    expect(integrityOverlay.match(/EXCEPTION\s+WHEN duplicate_object THEN NULL;/g)).toHaveLength(
      databaseOnlyChecks.length,
    )
    expect(integrityOverlay.match(/ADD\s+CONSTRAINT/gi)).toHaveLength(databaseOnlyChecks.length)
    expect(integrityOverlay).not.toMatch(/CREATE\s+TABLE|ADD\s+COLUMN|FOREIGN\s+KEY/i)
    expect(integrityOverlay.match(/CREATE\s+UNIQUE\s+INDEX/gi)).toHaveLength(1)
    expect(integrityOverlay.match(/CREATE\s+(?:UNIQUE\s+)?INDEX/gi)).toHaveLength(1)
  })

  it("keeps the complete formal and deployed database-only invariant sets identical", () => {
    expectExactDatabaseOnlyInvariantParity(migration, integrityOverlay)
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
})
