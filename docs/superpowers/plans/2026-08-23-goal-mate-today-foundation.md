# Goal Mate Today Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the schema, read APIs, action-item management, planning preferences, and a read-only three-column Today homepage without changing existing scheduling behavior.

**Architecture:** Keep Goal, Plan, ProgressRecord, FocusPeriod, and management routes intact. Add focused `src/lib/today` domain modules, thin App Router handlers, and a `TodayWorkspace` that consumes one aggregate endpoint; later plans add schedule mutations and AI behavior behind these boundaries.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma 6/PostgreSQL, Vitest, Tailwind CSS, local shadcn-style components.

---

## Prerequisites and baseline

- Work in the isolated feature worktree.
- Prepend `/Users/peixuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` to `PATH`; system Node 18.17.1 is below Prisma's minimum.
- Baseline at plan creation: `npm test` passed 10 files and 90 tests.

## File structure

- Modify `prisma/schema.prisma`: add Plan planning fields, ActionItem, ScheduleBlock, PlanningPreference, and ProgressRecord schedule metadata.
- Create `prisma/migrations/20260823090000_add_today_workspace_foundation/migration.sql`: additive constraints and indexes.
- Create `src/lib/today/types.ts`: shared unions and API view types.
- Create `src/lib/today/validation.ts` and `.test.ts`: JSON, date, planning-field, and action validators.
- Create `src/lib/today/planning-preference.ts` and `.test.ts`: singleton defaults and validation.
- Create `src/app/api/action-item/route.ts` and `.test.ts`: ActionItem CRUD.
- Create `src/app/api/planning-preference/route.ts` and `.test.ts`: singleton settings API.
- Create `src/lib/today/query.ts` and `.test.ts`: aggregate read query and candidate normalization.
- Create `src/app/api/today/route.ts` and `.test.ts`: validated aggregate GET.
- Create `src/components/today/today-workspace.tsx`: homepage data owner.
- Create `src/components/today/goal-candidate-panel.tsx`: read-only target/quadrant/inbox tabs.
- Create `src/components/today/day-timeline.tsx`: read-only day shell.
- Create `src/components/today/ai-workspace.tsx`: Check/Chat tabs with ChatWrapper kept mounted.
- Create `src/components/today/today-workspace-regression.test.ts`: layout contract.
- Modify `src/app/page.tsx`: render TodayWorkspace after the existing server auth check.

Do not remove the legacy quadrant sidebar in this plan. Management routes still use MainLayout; `/` stops using it and owns its layout.

---

### Task 1: Lock the additive database contract

**Files:**
- Create: `src/lib/today/schema-contract.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260823090000_add_today_workspace_foundation/migration.sql`

- [ ] **Step 1: Write the failing schema contract test**

```ts
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
```

- [ ] **Step 2: Prove the test is red**

Run `npm test -- src/lib/today/schema-contract.test.ts`.

Expected: FAIL because the new fields/models are absent.

- [ ] **Step 3: Extend Prisma models**

Add these exact fields and relations inside the existing `Plan` model:

```prisma
due_date          DateTime?       @db.Date
estimated_minutes Int?
energy_level      String?
actionItems       ActionItem[]
scheduleBlocks    ScheduleBlock[]
```

Add these exact fields and relation inside the existing `ProgressRecord` model:

```prisma
schedule_block_id        String?        @unique
outcome                  String?
counts_toward_recurrence Boolean        @default(true)
scheduleBlock            ScheduleBlock? @relation(fields: [schedule_block_id], references: [block_id], onDelete: SetNull)
```

Then add these three complete models:

```prisma

model ActionItem {
  id                Int             @id @default(autoincrement())
  gmt_create        DateTime        @default(now())
  gmt_modified      DateTime        @updatedAt
  action_id         String          @unique
  plan_id           String
  position          Int
  name              String
  description       String?
  is_completed      Boolean         @default(false)
  completed_at      DateTime?
  due_date          DateTime?       @db.Date
  estimated_minutes Int?
  energy_level      String?
  priority_quadrant String?
  plan              Plan            @relation(fields: [plan_id], references: [plan_id], onDelete: Cascade)
  scheduleBlocks    ScheduleBlock[]

  @@index([plan_id, position])
}

model ScheduleBlock {
  id             Int             @id @default(autoincrement())
  gmt_create     DateTime        @default(now())
  gmt_modified   DateTime        @updatedAt
  block_id       String          @unique
  plan_id        String
  action_id      String?
  start_at       DateTime
  end_at         DateTime
  status         String          @default("scheduled")
  source         String          @default("manual")
  result_note    String?
  version        Int             @default(1)
  plan           Plan            @relation(fields: [plan_id], references: [plan_id], onDelete: Cascade)
  action         ActionItem?     @relation(fields: [action_id], references: [action_id], onDelete: SetNull)
  progressRecord ProgressRecord?

  @@index([start_at, end_at])
  @@index([plan_id, start_at])
  @@index([action_id, status])
}

model PlanningPreference {
  id                        Int      @id @default(autoincrement())
  gmt_create                DateTime @default(now())
  gmt_modified              DateTime @updatedAt
  preference_id             String   @unique
  timezone                  String
  day_start_minutes         Int
  day_end_minutes           Int
  high_energy_start_minutes Int?
  high_energy_end_minutes   Int?
  buffer_minutes            Int      @default(15)
  default_block_minutes     Int      @default(60)
  capacity_warning_minutes  Int      @default(480)
}
```

- [ ] **Step 4: Create the additive SQL migration**

Create the migration with these operations:

```sql
ALTER TABLE "Plan" ADD COLUMN "due_date" DATE, ADD COLUMN "estimated_minutes" INTEGER, ADD COLUMN "energy_level" TEXT;
ALTER TABLE "ProgressRecord" ADD COLUMN "schedule_block_id" TEXT, ADD COLUMN "outcome" TEXT, ADD COLUMN "counts_toward_recurrence" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ActionItem" (
  "id" SERIAL PRIMARY KEY,
  "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gmt_modified" TIMESTAMP(3) NOT NULL,
  "action_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_completed" BOOLEAN NOT NULL DEFAULT false,
  "completed_at" TIMESTAMP(3),
  "due_date" DATE,
  "estimated_minutes" INTEGER,
  "energy_level" TEXT,
  "priority_quadrant" TEXT,
  CONSTRAINT "ActionItem_estimated_minutes_check" CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" > 0),
  CONSTRAINT "ActionItem_energy_level_check" CHECK ("energy_level" IS NULL OR "energy_level" IN ('low','medium','high')),
  CONSTRAINT "ActionItem_quadrant_check" CHECK ("priority_quadrant" IS NULL OR "priority_quadrant" IN ('q1','q2','q3','q4'))
);

CREATE TABLE "ScheduleBlock" (
  "id" SERIAL PRIMARY KEY,
  "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gmt_modified" TIMESTAMP(3) NOT NULL,
  "block_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "action_id" TEXT,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "result_note" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ScheduleBlock_time_check" CHECK ("end_at" > "start_at"),
  CONSTRAINT "ScheduleBlock_status_check" CHECK ("status" IN ('scheduled','completed','partial','skipped','cancelled')),
  CONSTRAINT "ScheduleBlock_source_check" CHECK ("source" IN ('manual','ai_check','ai_chat'))
);

CREATE TABLE "PlanningPreference" (
  "id" SERIAL PRIMARY KEY,
  "gmt_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gmt_modified" TIMESTAMP(3) NOT NULL,
  "preference_id" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "day_start_minutes" INTEGER NOT NULL,
  "day_end_minutes" INTEGER NOT NULL,
  "high_energy_start_minutes" INTEGER,
  "high_energy_end_minutes" INTEGER,
  "buffer_minutes" INTEGER NOT NULL DEFAULT 15,
  "default_block_minutes" INTEGER NOT NULL DEFAULT 60,
  "capacity_warning_minutes" INTEGER NOT NULL DEFAULT 480,
  CONSTRAINT "PlanningPreference_day_check" CHECK ("day_start_minutes" >= 0 AND "day_end_minutes" <= 1440 AND "day_end_minutes" > "day_start_minutes"),
  CONSTRAINT "PlanningPreference_high_energy_check" CHECK (("high_energy_start_minutes" IS NULL AND "high_energy_end_minutes" IS NULL) OR ("high_energy_start_minutes" IS NOT NULL AND "high_energy_end_minutes" IS NOT NULL AND "high_energy_start_minutes" >= "day_start_minutes" AND "high_energy_end_minutes" <= "day_end_minutes" AND "high_energy_end_minutes" > "high_energy_start_minutes")),
  CONSTRAINT "PlanningPreference_duration_check" CHECK ("buffer_minutes" >= 0 AND "default_block_minutes" > 0 AND "capacity_warning_minutes" > 0)
);

CREATE UNIQUE INDEX "ActionItem_action_id_key" ON "ActionItem"("action_id");
CREATE INDEX "ActionItem_plan_id_position_idx" ON "ActionItem"("plan_id", "position");
CREATE UNIQUE INDEX "ScheduleBlock_block_id_key" ON "ScheduleBlock"("block_id");
CREATE INDEX "ScheduleBlock_start_at_end_at_idx" ON "ScheduleBlock"("start_at", "end_at");
CREATE INDEX "ScheduleBlock_plan_id_start_at_idx" ON "ScheduleBlock"("plan_id", "start_at");
CREATE INDEX "ScheduleBlock_action_id_status_idx" ON "ScheduleBlock"("action_id", "status");
CREATE UNIQUE INDEX "ScheduleBlock_one_scheduled_action_key" ON "ScheduleBlock"("action_id") WHERE "action_id" IS NOT NULL AND "status" = 'scheduled';
CREATE UNIQUE INDEX "PlanningPreference_preference_id_key" ON "PlanningPreference"("preference_id");
CREATE UNIQUE INDEX "ProgressRecord_schedule_block_id_key" ON "ProgressRecord"("schedule_block_id");

ALTER TABLE "Plan" ADD CONSTRAINT "Plan_estimated_minutes_check" CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" > 0);
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_energy_level_check" CHECK ("energy_level" IS NULL OR "energy_level" IN ('low','medium','high'));
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("plan_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("plan_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "ActionItem"("action_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_schedule_block_id_fkey" FOREIGN KEY ("schedule_block_id") REFERENCES "ScheduleBlock"("block_id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Validate, test, and commit**

```bash
npx prisma format
npx prisma validate
npm test -- src/lib/today/schema-contract.test.ts
git add prisma/schema.prisma prisma/migrations/20260823090000_add_today_workspace_foundation/migration.sql src/lib/today/schema-contract.test.ts
git commit -m "feat: add today workspace data model"
```

Expected: validation and test pass; commit contains only schema artifacts.

---

### Task 2: Add shared Today types and validation

**Files:**
- Create: `src/lib/today/types.ts`
- Create: `src/lib/today/validation.ts`
- Create: `src/lib/today/validation.test.ts`
- Create: `src/lib/today/planning-preference.ts`
- Create: `src/lib/today/planning-preference.test.ts`

- [ ] **Step 1: Write failing pure tests**

```ts
import { describe, expect, it } from "vitest"
import { parseActionItemInput, parseDateKey, parsePlanningFields } from "./validation"
import { getDefaultPlanningPreference, normalizePlanningPreference } from "./planning-preference"

describe("today validation", () => {
  it("accepts real dates and rejects rollover dates", () => {
    expect(parseDateKey("2026-08-23")).toBe("2026-08-23")
    expect(() => parseDateKey("2026-02-30")).toThrow("date must be a valid yyyy-mm-dd value")
  })

  it("normalizes optional planning fields", () => {
    expect(parsePlanningFields({ due_date: "2026-09-01", estimated_minutes: 90, energy_level: "high" })).toEqual({
      due_date: new Date("2026-09-01T00:00:00.000Z"), estimated_minutes: 90, energy_level: "high",
    })
    expect(() => parsePlanningFields({ estimated_minutes: 0 })).toThrow("estimated_minutes must be a positive integer")
  })

  it("requires an action name and supported quadrant", () => {
    expect(parseActionItemInput({ name: "写发布说明", priority_quadrant: "q1" }).name).toBe("写发布说明")
    expect(() => parseActionItemInput({ name: "" })).toThrow("name required")
  })

  it("does not invent a high-energy window", () => {
    expect(getDefaultPlanningPreference("Asia/Shanghai")).toMatchObject({ preference_id: "default", timezone: "Asia/Shanghai", high_energy_start_minutes: null, high_energy_end_minutes: null })
    expect(normalizePlanningPreference({ timezone: "Asia/Shanghai", day_start_minutes: 480, day_end_minutes: 1320, high_energy_start_minutes: null, high_energy_end_minutes: null, buffer_minutes: 15, default_block_minutes: 60, capacity_warning_minutes: 480 }).day_end_minutes).toBe(1320)
  })
})
```

- [ ] **Step 2: Prove the tests are red**

Run `npm test -- src/lib/today/validation.test.ts src/lib/today/planning-preference.test.ts`.

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement shared types**

```ts
export type EnergyLevel = "low" | "medium" | "high"
export type QuadrantId = "q1" | "q2" | "q3" | "q4"
export type ScheduleBlockStatus = "scheduled" | "completed" | "partial" | "skipped" | "cancelled"
export type ScheduleBlockSource = "manual" | "ai_check" | "ai_chat"
export type CandidateKind = "plan" | "action"

export type PlanningPreferenceView = {
  preference_id: "default"
  timezone: string
  day_start_minutes: number
  day_end_minutes: number
  high_energy_start_minutes: number | null
  high_energy_end_minutes: number | null
  buffer_minutes: number
  default_block_minutes: number
  capacity_warning_minutes: number
  version: string | null
}

export type SchedulableCandidate = {
  kind: CandidateKind
  id: string
  plan_id: string
  action_id: string | null
  goal_id: string | null
  goal_name: string | null
  name: string
  due_date: string | null
  estimated_minutes: number | null
  energy_level: EnergyLevel | null
  effective_quadrant: QuadrantId | null
  is_recurring: boolean
  version: string
}

export type TodayView = {
  date: string
  preference: PlanningPreferenceView
  focus: { goal_id: string; name: string; tag: string; color: string; version: string } | null
  candidates: SchedulableCandidate[]
  blocks: []
  checks: []
}
```

- [ ] **Step 4: Implement validators and preference normalization**

Implement `parseDateKey` by calling existing `parseDateOnly`; accept `string | null`, returning `date required` for null. `parsePlanningFields` must reject non-positive minutes and unsupported energy/quadrant values. `parseActionItemInput` must trim name/description and reuse planning-field validation.

Export a default factory so the unsaved singleton follows the deployment runtime's IANA timezone rather than hard-coding a user location:

```ts
export function getDefaultPlanningPreference(
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): PlanningPreferenceView {
  return normalizePlanningPreference({
    preference_id: "default",
    timezone,
    day_start_minutes: 480,
    day_end_minutes: 1320,
    high_energy_start_minutes: null,
    high_energy_end_minutes: null,
    buffer_minutes: 15,
    default_block_minutes: 60,
    capacity_warning_minutes: 480,
    version: null,
  })
}
```

`normalizePlanningPreference` must retain the fixed `preference_id: "default"`, validate timezone via `Intl.DateTimeFormat`, require `0 <= start < end <= 1440`, require both high-energy bounds or neither, keep a configured high-energy window inside the schedulable day, require `buffer_minutes >= 0`, and require positive default/capacity minutes. Export `toPlanningPreferenceView(row)` so persisted rows map `gmt_modified.toISOString()` to `version` and omit the numeric ID/database timestamps; an unsaved default has `version: null`. `getDefaultPlanningPreference()` uses the deployment runtime timezone; the management editor added in Phase 4 lets the user persist a browser/user timezone explicitly.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/lib/today/validation.test.ts src/lib/today/planning-preference.test.ts
npx tsc --noEmit
git add src/lib/today
git commit -m "feat: add today domain validation"
```

Expected: tests and type-check pass.

---

### Task 3: Implement ActionItem CRUD

**Files:**
- Create: `src/app/api/action-item/route.test.ts`
- Create: `src/app/api/action-item/route.ts`

- [ ] **Step 1: Write failing route tests**

Use the repository's hoisted Prisma mock pattern and cover these cases:

```ts
it("creates the next action position idempotently for a non-recurring plan", async () => {
  prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_launch", is_recurring: false })
  prismaMock.actionItem.findUnique.mockResolvedValue(null)
  prismaMock.actionItem.aggregate.mockResolvedValue({ _max: { position: 1000 } })
  prismaMock.actionItem.create.mockResolvedValue({ action_id: "action_copy", plan_id: "plan_launch", position: 2000, name: "写发布说明" })
  const response = await POST(request("http://localhost/api/action-item", { method: "POST", headers: { "Idempotency-Key": "action-copy-v1" }, body: JSON.stringify({ plan_id: "plan_launch", name: "写发布说明" }) }))
  expect(response.status).toBe(200)
  expect(prismaMock.actionItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ plan_id: "plan_launch", position: 2000, action_id: expect.stringMatching(/^action_[a-f0-9]{10}$/) }) })
})

it("rejects actions under recurring plans", async () => {
  prismaMock.plan.findUnique.mockResolvedValue({ plan_id: "plan_run", is_recurring: true })
  const response = await POST(request("http://localhost/api/action-item", { method: "POST", body: JSON.stringify({ plan_id: "plan_run", name: "跑 5K" }) }))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: "周期性计划不能创建行动项" })
})

it("blocks deletion while a future scheduled block exists", async () => {
  prismaMock.scheduleBlock.count.mockResolvedValue(1)
  const response = await DELETE(request("http://localhost/api/action-item?action_id=action_copy", { method: "DELETE" }))
  expect(response.status).toBe(409)
  expect(prismaMock.actionItem.delete).not.toHaveBeenCalled()
})
```

Also test GET ordering, missing/oversized idempotency key, a repeated identical POST returning the existing row, a key collision with different payload returning 409, two creates under one Plan being serialized before next-position calculation, invalid JSON, missing Plan/ActionItem, PUT completion timestamps, and successful deletion.

- [ ] **Step 2: Prove the route tests are red**

Run `npm test -- src/app/api/action-item/route.test.ts`.

Expected: FAIL because route.ts is missing.

- [ ] **Step 3: Implement the route**

- GET requires `plan_id` and returns actions ordered by `position`, then `gmt_create`.
- POST requires a 1–128 character `Idempotency-Key`, validates JSON, rejects missing/recurring Plan, and derives `action_<10 hex>` from a SHA-256 hash of the key. Inside the create transaction, take a PostgreSQL advisory lock derived from `plan_id` before calculating `(_max.position ?? 0) + 1000`, matching the repository's existing goal-position lock pattern. If the derived action already exists, return it only when the immutable create payload matches; otherwise return 409.
- PUT accepts `action_id`, editable fields, and `is_completed`; set `completed_at` to now on completion and null on reopen.
- DELETE counts future `status: "scheduled"` blocks and returns 409 before deletion when non-zero.
- Wrap create/update/delete in transactions; map validation to 400, missing records to 404, protected deletion to 409.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/app/api/action-item/route.test.ts
npm test
git add src/app/api/action-item/route.ts src/app/api/action-item/route.test.ts
git commit -m "feat: add action item api"
```

Expected: focused and full suites pass.

---

### Task 4: Implement singleton planning preferences

**Files:**
- Create: `src/app/api/planning-preference/route.test.ts`
- Create: `src/app/api/planning-preference/route.ts`

- [ ] **Step 1: Write failing tests**

```ts
const savedPreference = {
  id: 1,
  gmt_create: new Date("2026-08-23T00:00:00Z"),
  gmt_modified: new Date("2026-08-23T00:00:00Z"),
  preference_id: "default",
  timezone: "Asia/Shanghai",
  day_start_minutes: 480,
  day_end_minutes: 1320,
  high_energy_start_minutes: null,
  high_energy_end_minutes: null,
  buffer_minutes: 15,
  default_block_minutes: 60,
  capacity_warning_minutes: 480,
}

it("returns defaults without writing when absent", async () => {
  prismaMock.planningPreference.findUnique.mockResolvedValue(null)
  const response = await GET()
  expect(await response.json()).toMatchObject({ preference_id: "default", high_energy_start_minutes: null })
  expect(prismaMock.planningPreference.upsert).not.toHaveBeenCalled()
})

it("maps a saved row to an API version", async () => {
  prismaMock.planningPreference.findUnique.mockResolvedValue(savedPreference)
  const response = await GET()
  expect(await response.json()).toMatchObject({ preference_id: "default", version: "2026-08-23T00:00:00.000Z" })
})

it("upserts only the default singleton", async () => {
  prismaMock.planningPreference.upsert.mockResolvedValue({ ...savedPreference, default_block_minutes: 45, capacity_warning_minutes: 420 })
  const response = await PUT(request({ timezone: "Asia/Shanghai", day_start_minutes: 480, day_end_minutes: 1320, high_energy_start_minutes: null, high_energy_end_minutes: null, buffer_minutes: 15, default_block_minutes: 45, capacity_warning_minutes: 420 }))
  expect(response.status).toBe(200)
  expect(prismaMock.planningPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { preference_id: "default" } }))
})
```

- [ ] **Step 2: Prove tests are red**

Run `npm test -- src/app/api/planning-preference/route.test.ts`.

Expected: FAIL because the route is absent.

- [ ] **Step 3: Implement GET/PUT**

GET calls `findUnique({ where: { preference_id: "default" } })` and returns `toPlanningPreferenceView(row)` or `getDefaultPlanningPreference()` without writing. PUT validates a JSON object with `normalizePlanningPreference`, removes its API-only `version`, then upserts using fixed business key `default` and maps the saved row back through `toPlanningPreferenceView`. Return 400 with the validator message for invalid inputs.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/app/api/planning-preference/route.test.ts src/lib/today/planning-preference.test.ts
git add src/app/api/planning-preference src/lib/today/planning-preference.ts
git commit -m "feat: add planning preference api"
```

Expected: both suites pass.

---

### Task 5: Build the aggregate Today read model

**Files:**
- Create: `src/lib/today/query.test.ts`
- Create: `src/lib/today/query.ts`
- Create: `src/app/api/today/route.test.ts`
- Create: `src/app/api/today/route.ts`

- [ ] **Step 1: Write failing query tests**

Prove the current FocusPeriod is selected for the requested date; every open Plan remains a direct candidate; a Plan with open actions also contributes Action candidates ordered ahead of its parent Plan; a recurring Plan appears directly but never has Action candidates; completed items are absent; and quadrant inheritance uses `action.priority_quadrant ?? plan.priority_quadrant`.

Use this exact expected shape for an action candidate:

```ts
expect(view.candidates).toContainEqual({
  kind: "action",
  id: "action_copy",
  action_id: "action_copy",
  plan_id: "plan_launch",
  goal_id: "goal_product",
  goal_name: "发布 Goal Mate v1",
  name: "写发布说明",
  due_date: "2026-09-01",
  estimated_minutes: 60,
  energy_level: "medium",
  effective_quadrant: "q1",
  is_recurring: false,
  version: "2026-08-23T00:00:00.000Z",
})
```

- [ ] **Step 2: Prove query tests are red**

Run `npm test -- src/lib/today/query.test.ts`.

Expected: FAIL because query.ts is missing.

- [ ] **Step 3: Implement the aggregate query**

Export:

```ts
export async function loadTodayView(db: TodayQueryDb, dateKey: string): Promise<TodayView>
```

Use a narrow `TodayQueryDb` interface and Promise.all for preference, date-matching FocusPeriod with goal, and incomplete Plans including actions/tags/goal. Reuse `findCurrentFocusPeriod` and `normalizeDateInput`. In this phase return `blocks: []` and `checks: []`; Plan 2 activates schedule reads.

- [ ] **Step 4: Add route tests and handler**

Tests cover missing/invalid date and successful delegation. Implement:

```ts
export async function GET(req: NextRequest) {
  try {
    const date = parseDateKey(new URL(req.url).searchParams.get("date"))
    return NextResponse.json(await loadTodayView(prisma, date))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "今日数据加载失败" }, { status: 400 })
  }
}
```

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/lib/today/query.test.ts src/app/api/today/route.test.ts
git add src/lib/today/query.ts src/lib/today/query.test.ts src/app/api/today/route.ts src/app/api/today/route.test.ts
git commit -m "feat: add today aggregate api"
```

Expected: both suites pass.

---

### Task 6: Replace the homepage with a read-only Today workspace

**Files:**
- Create: `src/components/today/today-workspace-regression.test.ts`
- Create: `src/components/today/today-workspace.tsx`
- Create: `src/components/today/goal-candidate-panel.tsx`
- Create: `src/components/today/day-timeline.tsx`
- Create: `src/components/today/ai-workspace.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write the failing layout contract**

```ts
expect(pageSource).toContain("<TodayWorkspace />")
expect(pageSource).not.toContain("<MainLayout>")
expect(workspaceSource).toContain("grid-cols-[300px_minmax(0,1fr)_340px]")
expect(workspaceSource).toContain("<GoalCandidatePanel")
expect(workspaceSource).toContain("<DayTimeline")
expect(workspaceSource).toContain("<AiWorkspace")
expect(aiSource).toContain('value="check"')
expect(aiSource).toContain('value="chat"')
expect(aiSource).toContain("<ChatWrapper />")
expect(aiSource).not.toContain('activeTab === "chat" ? <ChatWrapper')
```

- [ ] **Step 2: Prove the layout test is red**

Run `npm test -- src/components/today/today-workspace-regression.test.ts`.

Expected: FAIL because the components are missing.

- [ ] **Step 3: Implement the panels**

GoalCandidatePanel accepts focus/candidates/loading/error and uses existing Tabs for 目标树/四象限/收集箱. 目标树 groups Goal → Plan → ActionItem with the current FocusPeriod goal first; when a Plan has open actions, show those action rows first while keeping a secondary direct-schedule control on the parent. 四象限 groups by `effective_quadrant`; 收集箱 contains candidates with no goal, no effective quadrant, and no active block. Cards are read-only in this phase and show expected minutes plus goal name. DayTimeline renders hour labels from preference start/end and empty copy `把左侧计划或行动项拖到这里安排时间`.

AiWorkspace must keep ChatWrapper mounted:

```tsx
<Tabs value={activeTab} onValueChange={value => setActiveTab(value as "check" | "chat")}>
  <TabsList><TabsTrigger value="check">今日检查</TabsTrigger><TabsTrigger value="chat">AI 对话</TabsTrigger></TabsList>
  <div className={activeTab === "check" ? "min-h-0 flex-1" : "hidden"}>今日检查将在排程阶段启用</div>
  <div className={activeTab === "chat" ? "min-h-0 flex-1" : "invisible absolute inset-0 pointer-events-none"}><ChatWrapper /></div>
</Tabs>
```

- [ ] **Step 4: Implement TodayWorkspace data ownership**

Fetch `/api/today?date=${date}` on mount/date change using an incrementing request id. Render top navigation, date controls, then `lg:grid-cols-[300px_minmax(0,1fr)_340px]`. Below lg, render timeline first and simple toggles for candidate/AI panels; drawer polish belongs to Plan 4.

- [ ] **Step 5: Replace the authenticated homepage**

Keep the existing `isAuthenticated` redirect and return:

```tsx
return <TodayWorkspace />
```

Remove old dashboard imports/usages but do not delete their source files.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/components/today/today-workspace-regression.test.ts
npm test
npx tsc --noEmit
git add src/app/page.tsx src/components/today
git commit -m "feat: add read-only today workspace"
```

Expected: tests and type-check pass.

---

### Task 7: Foundation verification checkpoint

**Files:** No code changes expected.

- [ ] **Step 1: Validate schema and client generation**

```bash
npx prisma format
git diff --check -- prisma/schema.prisma
npx prisma validate
npx prisma generate
```

Expected: all exit 0.

- [ ] **Step 2: Run full automated verification**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: 0 test failures, TypeScript exit 0, Next build exit 0.

- [ ] **Step 3: Manual acceptance**

1. Open `/`; confirm the three-column Today shell replaces the old dashboard.
2. Confirm open ActionItems are emphasized before their parent Plan while both remain directly schedulable.
3. Confirm recurring plans appear directly.
4. Switch 今日检查/AI 对话 twice and confirm chat DOM/state is retained.
5. Open `/goals`, `/plans`, `/progress`, `/reports`; confirm legacy pages still load.

- [ ] **Step 4: Commit only a required verification fix**

If no fix was needed, do not create an empty commit. If a fix was needed, rerun Step 2 and commit only that fix as `fix: stabilize today workspace foundation`.
