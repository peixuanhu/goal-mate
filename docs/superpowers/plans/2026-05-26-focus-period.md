# Focus Period Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a homepage annual focus panel that shows the current single focus goal, a colored year timeline, and an easy drawer UI for editing date-based focus periods.

**Architecture:** Add a dedicated `FocusPeriod` Prisma model and `/api/focus-period` route that stores date ranges pointing at existing `Goal.goal_id` values without cascading deletes. Keep the homepage as a server-authenticated page and mount a focused client component that fetches the current year, renders the timeline, and opens a drawer for row-level auto-save editing.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma/PostgreSQL, Tailwind CSS, shadcn-style local UI components, Vitest for utility and API tests.

---

## File Structure

- Modify `package.json`: add `test` scripts and Vitest dev dependency.
- Create `vitest.config.ts`: configure Vitest with the `@/` alias.
- Modify `prisma/schema.prisma`: add `FocusPeriod` model.
- Create `src/lib/focus-period-utils.ts`: date parsing, year math, overlap checks, timeline segment calculation, current-period lookup, color assignment.
- Create `src/lib/focus-period-api.ts`: validation and mapping helpers shared by the API route and API tests.
- Create `src/lib/focus-period-utils.test.ts`: unit tests for date and timeline behavior.
- Create `src/lib/focus-period-api.test.ts`: API-helper tests for validation and deleted-goal mapping.
- Create `src/app/api/focus-period/route.ts`: CRUD endpoint for focus periods.
- Create `src/app/api/focus-period/route.test.ts`: route-level tests with mocked Prisma client.
- Create `src/components/focus-period/types.ts`: shared client-side types.
- Create `src/components/focus-period/year-timeline.tsx`: timeline bar, gray gaps, today marker, hover labels.
- Create `src/components/focus-period/focus-period-drawer.tsx`: right-side or full-screen editor drawer.
- Create `src/components/focus-period/focus-period-editor-row.tsx`: single period editor row with searchable goal combobox, dates, color, delete.
- Create `src/components/focus-period/focus-overview.tsx`: homepage data loader and panel.
- Modify `src/app/page.tsx`: insert `FocusOverview` under the title.
- Optionally modify `.gitignore`: add `.superpowers/` if the brainstorm mockup folder is still present locally.

## Baseline Verification Notes

This worktree should use Node from `~/.nvm/versions/node/v18.18.2/bin` or any newer Node version. The default `/usr/local/bin/node` is `v18.17.1`, which is too old for Prisma and Next 15.

Baseline `npm run build` currently compiles successfully, then fails during lint/type validation because of pre-existing issues in files such as `src/app/api/copilotkit/route.ts`, `src/app/plans/page.tsx`, `src/app/progress/page.tsx`, and `src/components/ui/combobox.tsx`. Baseline `npx tsc --noEmit` also reports pre-existing type errors in `goals`, `plans`, and `progress` pages. Do not fix unrelated lint/type debt as part of this feature.

For this plan, required automated verification is:

- Run the Vitest tests introduced by this plan.
- Run `npm run build` and confirm there are no new errors in files touched by this feature. Existing unrelated errors may remain.
- Use browser verification for the homepage and drawer behavior.

## Task 1: Add Test Harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest**

Run with Node 18.18+:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm install -D vitest
```

Expected: `package.json` and `package-lock.json` include `vitest` under dev dependencies.

- [ ] **Step 2: Add test scripts**

In `package.json`, update `scripts` to include:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Keep all existing scripts.

- [ ] **Step 3: Create Vitest config**

Create `vitest.config.ts`:

```ts
import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
})
```

- [ ] **Step 4: Run empty test command**

Run with Node 18.18+:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm test -- --passWithNoTests
```

Expected: command exits successfully with no tests found.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest harness"
```

## Task 2: Add FocusPeriod Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Prisma model**

Append this model to `prisma/schema.prisma`:

```prisma
model FocusPeriod {
  id           Int      @id @default(autoincrement())
  gmt_create   DateTime @default(now())
  gmt_modified DateTime @updatedAt
  period_id    String   @unique
  year         Int
  start_date   DateTime @db.Date
  end_date     DateTime @db.Date
  goal_id      String
  color        String

  @@index([year, start_date])
  @@index([goal_id])
}
```

Do not add a Prisma relation to `Goal`; `goal_id` is validated in the API so deleted goals do not cascade-delete focus periods.

- [ ] **Step 2: Format and generate Prisma client**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npx prisma format
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npx prisma generate
```

Expected: both commands succeed.

- [ ] **Step 3: Push schema locally**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npx prisma db push
```

Expected: Prisma reports the database is in sync. If the local database is unavailable, stop and ask the user before proceeding with implementation tasks that require live API verification.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma package-lock.json package.json
git commit -m "feat: add focus period schema"
```

## Task 3: Build Date and Timeline Utilities with Tests

**Files:**
- Create: `src/lib/focus-period-utils.ts`
- Create: `src/lib/focus-period-utils.test.ts`

- [ ] **Step 1: Write failing utility tests**

Create `src/lib/focus-period-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  assignFocusColor,
  buildTimelineSegments,
  dateToYearPercent,
  findCurrentFocusPeriod,
  hasDateRangeOverlap,
  isLeapYear,
  normalizeDateInput,
} from "./focus-period-utils"

const periods = [
  {
    period_id: "period_music",
    year: 2026,
    start_date: "2026-05-01",
    end_date: "2026-06-30",
    goal_id: "goal_music",
    color: "#0f766e",
    goal: { goal_id: "goal_music", name: "学习吉他与编曲", tag: "音乐" },
  },
  {
    period_id: "period_fitness",
    year: 2026,
    start_date: "2026-07-01",
    end_date: "2026-08-31",
    goal_id: "goal_fitness",
    color: "#ea580c",
    goal: { goal_id: "goal_fitness", name: "健身", tag: "身体" },
  },
]

describe("focus-period-utils", () => {
  it("detects leap years", () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
  })

  it("normalizes date inputs to yyyy-mm-dd", () => {
    expect(normalizeDateInput("2026-05-26")).toBe("2026-05-26")
    expect(normalizeDateInput(new Date("2026-05-26T15:30:00.000Z"))).toBe("2026-05-26")
  })

  it("converts dates to year percentages", () => {
    expect(dateToYearPercent("2026-01-01", 2026)).toBe(0)
    expect(dateToYearPercent("2026-12-31", 2026)).toBe(100)
    expect(dateToYearPercent("2024-12-31", 2024)).toBe(100)
  })

  it("finds the current focus period by inclusive date range", () => {
    expect(findCurrentFocusPeriod(periods, new Date("2026-05-26T00:00:00.000Z"))?.period_id).toBe("period_music")
    expect(findCurrentFocusPeriod(periods, new Date("2026-06-30T00:00:00.000Z"))?.period_id).toBe("period_music")
    expect(findCurrentFocusPeriod(periods, new Date("2026-09-01T00:00:00.000Z"))).toBeUndefined()
  })

  it("allows adjacent periods but rejects overlaps", () => {
    expect(
      hasDateRangeOverlap(
        { start_date: "2026-07-01", end_date: "2026-08-31" },
        [{ period_id: "a", start_date: "2026-05-01", end_date: "2026-06-30" }],
      ),
    ).toBe(false)
    expect(
      hasDateRangeOverlap(
        { start_date: "2026-06-30", end_date: "2026-07-10" },
        [{ period_id: "a", start_date: "2026-05-01", end_date: "2026-06-30" }],
      ),
    ).toBe(true)
  })

  it("builds gray gap segments around colored focus periods", () => {
    const segments = buildTimelineSegments(periods, 2026)
    expect(segments.map(segment => segment.kind)).toEqual(["gap", "period", "period", "gap"])
    expect(segments[0]).toMatchObject({ kind: "gap", start_date: "2026-01-01", end_date: "2026-04-30" })
    expect(segments[1]).toMatchObject({ kind: "period", period_id: "period_music", color: "#0f766e" })
  })

  it("assigns stable colors by index", () => {
    expect(assignFocusColor(0)).toBe("#0f766e")
    expect(assignFocusColor(8)).toBe("#0f766e")
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm test -- src/lib/focus-period-utils.test.ts
```

Expected: fails because `src/lib/focus-period-utils.ts` does not exist.

- [ ] **Step 3: Implement utility module**

Create `src/lib/focus-period-utils.ts`:

```ts
export interface FocusGoalSummary {
  goal_id: string
  name: string
  tag: string
  description?: string | null
}

export interface FocusPeriodView {
  period_id: string
  year: number
  start_date: string
  end_date: string
  goal_id: string
  color: string
  goal: FocusGoalSummary | null
}

export interface DateRange {
  start_date: string
  end_date: string
}

export type TimelineSegment =
  | {
      kind: "gap"
      start_date: string
      end_date: string
      leftPercent: number
      widthPercent: number
      color: "#e5e7eb"
    }
  | (FocusPeriodView & {
      kind: "period"
      leftPercent: number
      widthPercent: number
    })

export const FOCUS_COLORS = [
  "#0f766e",
  "#ea580c",
  "#4f46e5",
  "#be123c",
  "#0891b2",
  "#7c3aed",
  "#65a30d",
  "#c2410c",
] as const

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function assignFocusColor(index: number): string {
  return FOCUS_COLORS[index % FOCUS_COLORS.length]
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

export function normalizeDateInput(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return value.slice(0, 10)
}

export function parseDateOnly(value: string | Date): Date {
  const normalized = normalizeDateInput(value)
  return new Date(`${normalized}T00:00:00.000Z`)
}

export function dateToYearDay(value: string | Date, year: number): number {
  const date = parseDateOnly(value)
  const start = parseDateOnly(`${year}-01-01`)
  return Math.floor((date.getTime() - start.getTime()) / MS_PER_DAY) + 1
}

export function dateToYearPercent(value: string | Date, year: number): number {
  const day = dateToYearDay(value, year)
  if (day <= 1) return 0
  if (day >= daysInYear(year)) return 100
  return ((day - 1) / (daysInYear(year) - 1)) * 100
}

export function addDays(value: string | Date, amount: number): string {
  const date = parseDateOnly(value)
  date.setUTCDate(date.getUTCDate() + amount)
  return normalizeDateInput(date)
}

export function getYearStart(year: number): string {
  return `${year}-01-01`
}

export function getYearEnd(year: number): string {
  return `${year}-12-31`
}

function inclusiveWidthPercent(range: DateRange, year: number): number {
  const startDay = dateToYearDay(range.start_date, year)
  const endDay = dateToYearDay(range.end_date, year)
  return ((endDay - startDay + 1) / daysInYear(year)) * 100
}

export function hasDateRangeOverlap(
  candidate: DateRange,
  existing: Array<DateRange & { period_id?: string }>,
  ignorePeriodId?: string,
): boolean {
  const candidateStart = parseDateOnly(candidate.start_date).getTime()
  const candidateEnd = parseDateOnly(candidate.end_date).getTime()

  return existing.some(period => {
    if (ignorePeriodId && period.period_id === ignorePeriodId) return false
    const start = parseDateOnly(period.start_date).getTime()
    const end = parseDateOnly(period.end_date).getTime()
    return candidateStart <= end && candidateEnd >= start
  })
}

export function findCurrentFocusPeriod(periods: FocusPeriodView[], today: Date = new Date()): FocusPeriodView | undefined {
  const current = normalizeDateInput(today)
  return periods.find(period => period.start_date <= current && period.end_date >= current)
}

export function buildTimelineSegments(periods: FocusPeriodView[], year: number): TimelineSegment[] {
  const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const segments: TimelineSegment[] = []
  let cursor = getYearStart(year)

  for (const period of sorted) {
    if (period.start_date > cursor) {
      const gapEnd = addDays(period.start_date, -1)
      segments.push({
        kind: "gap",
        start_date: cursor,
        end_date: gapEnd,
        leftPercent: dateToYearPercent(cursor, year),
        widthPercent: inclusiveWidthPercent({ start_date: cursor, end_date: gapEnd }, year),
        color: "#e5e7eb",
      })
    }

    segments.push({
      ...period,
      kind: "period",
      leftPercent: dateToYearPercent(period.start_date, year),
      widthPercent: inclusiveWidthPercent(period, year),
    })
    cursor = addDays(period.end_date, 1)
  }

  const yearEnd = getYearEnd(year)
  if (cursor <= yearEnd) {
    segments.push({
      kind: "gap",
      start_date: cursor,
      end_date: yearEnd,
      leftPercent: dateToYearPercent(cursor, year),
      widthPercent: inclusiveWidthPercent({ start_date: cursor, end_date: yearEnd }, year),
      color: "#e5e7eb",
    })
  }

  return segments
}
```

- [ ] **Step 4: Run utility tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm test -- src/lib/focus-period-utils.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/focus-period-utils.ts src/lib/focus-period-utils.test.ts
git commit -m "feat: add focus period timeline utilities"
```

## Task 4: Build API Validation Helpers with Tests

**Files:**
- Create: `src/lib/focus-period-api.ts`
- Create: `src/lib/focus-period-api.test.ts`

- [ ] **Step 1: Write failing API-helper tests**

Create `src/lib/focus-period-api.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  mapFocusPeriodRecord,
  validateFocusPeriodInput,
} from "./focus-period-api"

const existing = [
  {
    period_id: "period_music",
    year: 2026,
    start_date: "2026-05-01",
    end_date: "2026-06-30",
    goal_id: "goal_music",
    color: "#0f766e",
  },
]

describe("focus-period-api", () => {
  it("accepts a valid adjacent period", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-07-01",
          end_date: "2026-08-31",
          goal_id: "goal_fitness",
          color: "#ea580c",
        },
        existing,
      ),
    ).toEqual({ ok: true })
  })

  it("rejects cross-year ranges", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-12-15",
          end_date: "2027-01-15",
          goal_id: "goal_math",
          color: "#4f46e5",
        },
        [],
      ),
    ).toEqual({ ok: false, message: "开始日期和结束日期必须属于同一年" })
  })

  it("rejects reversed ranges", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-08-31",
          end_date: "2026-07-01",
          goal_id: "goal_fitness",
          color: "#ea580c",
        },
        [],
      ),
    ).toEqual({ ok: false, message: "开始日期不能晚于结束日期" })
  })

  it("rejects overlaps", () => {
    expect(
      validateFocusPeriodInput(
        {
          year: 2026,
          start_date: "2026-06-15",
          end_date: "2026-07-15",
          goal_id: "goal_fitness",
          color: "#ea580c",
        },
        existing,
      ),
    ).toEqual({ ok: false, message: "同一年内的专注阶段不能重叠" })
  })

  it("maps missing goals as deleted", () => {
    const mapped = mapFocusPeriodRecord(
      {
        period_id: "period_old",
        year: 2026,
        start_date: new Date("2026-09-01T00:00:00.000Z"),
        end_date: new Date("2026-09-30T00:00:00.000Z"),
        goal_id: "goal_deleted",
        color: "#4f46e5",
      },
      null,
    )

    expect(mapped).toMatchObject({
      period_id: "period_old",
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      goal_id: "goal_deleted",
      goal: null,
    })
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm test -- src/lib/focus-period-api.test.ts
```

Expected: fails because `src/lib/focus-period-api.ts` does not exist.

- [ ] **Step 3: Implement API helpers**

Create `src/lib/focus-period-api.ts`:

```ts
import { randomUUID } from "crypto"
import {
  type DateRange,
  type FocusGoalSummary,
  type FocusPeriodView,
  hasDateRangeOverlap,
  normalizeDateInput,
  parseDateOnly,
} from "@/lib/focus-period-utils"

export interface FocusPeriodInput extends DateRange {
  year: number
  goal_id: string
  color: string
}

export interface ExistingFocusPeriod extends DateRange {
  period_id: string
}

export type ValidationResult = { ok: true } | { ok: false; message: string }

export function createPeriodId(): string {
  return `focus_${randomUUID().replace(/-/g, "").substring(0, 10)}`
}

export function toDateOnly(value: string): Date {
  return parseDateOnly(value)
}

export function validateFocusPeriodInput(
  input: FocusPeriodInput,
  existingPeriods: ExistingFocusPeriod[],
  ignorePeriodId?: string,
): ValidationResult {
  if (!Number.isInteger(input.year)) {
    return { ok: false, message: "年份必须是整数" }
  }
  if (!input.goal_id) {
    return { ok: false, message: "必须选择一个目标" }
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) {
    return { ok: false, message: "颜色必须是十六进制色值" }
  }
  if (!input.start_date.startsWith(`${input.year}-`) || !input.end_date.startsWith(`${input.year}-`)) {
    return { ok: false, message: "开始日期和结束日期必须属于同一年" }
  }
  if (parseDateOnly(input.start_date).getTime() > parseDateOnly(input.end_date).getTime()) {
    return { ok: false, message: "开始日期不能晚于结束日期" }
  }
  if (hasDateRangeOverlap(input, existingPeriods, ignorePeriodId)) {
    return { ok: false, message: "同一年内的专注阶段不能重叠" }
  }
  return { ok: true }
}

export function mapFocusPeriodRecord(
  period: {
    period_id: string
    year: number
    start_date: Date
    end_date: Date
    goal_id: string
    color: string
  },
  goal: FocusGoalSummary | null,
): FocusPeriodView {
  return {
    period_id: period.period_id,
    year: period.year,
    start_date: normalizeDateInput(period.start_date),
    end_date: normalizeDateInput(period.end_date),
    goal_id: period.goal_id,
    color: period.color,
    goal,
  }
}
```

- [ ] **Step 4: Run API-helper tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm test -- src/lib/focus-period-api.test.ts src/lib/focus-period-utils.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/focus-period-api.ts src/lib/focus-period-api.test.ts
git commit -m "feat: add focus period api helpers"
```

## Task 5: Implement FocusPeriod API Route

**Files:**
- Create: `src/app/api/focus-period/route.ts`
- Create: `src/app/api/focus-period/route.test.ts`

- [ ] **Step 1: Create route**

Create `src/app/api/focus-period/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import {
  createPeriodId,
  mapFocusPeriodRecord,
  toDateOnly,
  validateFocusPeriodInput,
  type ExistingFocusPeriod,
  type FocusPeriodInput,
} from "@/lib/focus-period-api"

const prisma = new PrismaClient()

async function listPeriodsForYear(year: number): Promise<ExistingFocusPeriod[]> {
  const periods = await prisma.focusPeriod.findMany({
    where: { year },
    select: { period_id: true, start_date: true, end_date: true },
  })

  return periods.map(period => ({
    period_id: period.period_id,
    start_date: period.start_date.toISOString().slice(0, 10),
    end_date: period.end_date.toISOString().slice(0, 10),
  }))
}

async function goalExists(goal_id: string): Promise<boolean> {
  const goal = await prisma.goal.findUnique({
    where: { goal_id },
    select: { goal_id: true },
  })
  return Boolean(goal)
}

async function getGoalMap(goalIds: string[]) {
  const goals = await prisma.goal.findMany({
    where: { goal_id: { in: goalIds } },
    select: { goal_id: true, name: true, tag: true, description: true },
  })
  return new Map(goals.map(goal => [goal.goal_id, goal]))
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = Number.parseInt(searchParams.get("year") || `${new Date().getFullYear()}`, 10)

  if (!Number.isInteger(year)) {
    return badRequest("year must be an integer")
  }

  const periods = await prisma.focusPeriod.findMany({
    where: { year },
    orderBy: { start_date: "asc" },
  })
  const goalMap = await getGoalMap(periods.map(period => period.goal_id))
  const list = periods.map(period => mapFocusPeriodRecord(period, goalMap.get(period.goal_id) ?? null))

  return NextResponse.json({ list, total: list.length })
}

export async function POST(req: NextRequest) {
  const data = (await req.json()) as FocusPeriodInput
  const existing = await listPeriodsForYear(data.year)
  const validation = validateFocusPeriodInput(data, existing)

  if (!validation.ok) return badRequest(validation.message)
  if (!(await goalExists(data.goal_id))) return badRequest("目标不存在")

  const period = await prisma.focusPeriod.create({
    data: {
      period_id: createPeriodId(),
      year: data.year,
      start_date: toDateOnly(data.start_date),
      end_date: toDateOnly(data.end_date),
      goal_id: data.goal_id,
      color: data.color,
    },
  })
  const goalMap = await getGoalMap([period.goal_id])

  return NextResponse.json(mapFocusPeriodRecord(period, goalMap.get(period.goal_id) ?? null))
}

export async function PUT(req: NextRequest) {
  const data = (await req.json()) as FocusPeriodInput & { period_id?: string }

  if (!data.period_id) return badRequest("period_id required")

  const existing = await listPeriodsForYear(data.year)
  const validation = validateFocusPeriodInput(data, existing, data.period_id)

  if (!validation.ok) return badRequest(validation.message)
  if (!(await goalExists(data.goal_id))) return badRequest("目标不存在")

  const period = await prisma.focusPeriod.update({
    where: { period_id: data.period_id },
    data: {
      year: data.year,
      start_date: toDateOnly(data.start_date),
      end_date: toDateOnly(data.end_date),
      goal_id: data.goal_id,
      color: data.color,
    },
  })
  const goalMap = await getGoalMap([period.goal_id])

  return NextResponse.json(mapFocusPeriodRecord(period, goalMap.get(period.goal_id) ?? null))
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const period_id = searchParams.get("period_id") || undefined

  if (!period_id) return badRequest("period_id required")

  await prisma.focusPeriod.delete({ where: { period_id } })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Write route-level tests**

Create `src/app/api/focus-period/route.test.ts`:

```ts
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  focusPeriod: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  goal: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}))

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

async function loadRoute() {
  vi.resetModules()
  return await import("./route")
}

beforeEach(() => {
  prismaMock.focusPeriod.findMany.mockReset()
  prismaMock.focusPeriod.create.mockReset()
  prismaMock.focusPeriod.update.mockReset()
  prismaMock.focusPeriod.delete.mockReset()
  prismaMock.goal.findMany.mockReset()
  prismaMock.goal.findUnique.mockReset()
})

describe("/api/focus-period", () => {
  it("GET returns periods and marks deleted goals as null", async () => {
    prismaMock.focusPeriod.findMany.mockResolvedValue([
      {
        period_id: "period_old",
        year: 2026,
        start_date: new Date("2026-09-01T00:00:00.000Z"),
        end_date: new Date("2026-09-30T00:00:00.000Z"),
        goal_id: "goal_deleted",
        color: "#4f46e5",
      },
    ])
    prismaMock.goal.findMany.mockResolvedValue([])

    const { GET } = await loadRoute()
    const res = await GET(new NextRequest("http://localhost/api/focus-period?year=2026"))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({
      list: [
        {
          period_id: "period_old",
          year: 2026,
          start_date: "2026-09-01",
          end_date: "2026-09-30",
          goal_id: "goal_deleted",
          color: "#4f46e5",
          goal: null,
        },
      ],
      total: 1,
    })
  })

  it("POST rejects overlapping periods before creating", async () => {
    prismaMock.focusPeriod.findMany.mockResolvedValue([
      {
        period_id: "period_music",
        start_date: new Date("2026-05-01T00:00:00.000Z"),
        end_date: new Date("2026-06-30T00:00:00.000Z"),
      },
    ])

    const { POST } = await loadRoute()
    const req = new NextRequest("http://localhost/api/focus-period", {
      method: "POST",
      body: JSON.stringify({
        year: 2026,
        start_date: "2026-06-15",
        end_date: "2026-07-15",
        goal_id: "goal_fitness",
        color: "#ea580c",
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.message).toBe("同一年内的专注阶段不能重叠")
    expect(prismaMock.focusPeriod.create).not.toHaveBeenCalled()
  })

  it("POST rejects missing goals", async () => {
    prismaMock.focusPeriod.findMany.mockResolvedValue([])
    prismaMock.goal.findUnique.mockResolvedValue(null)

    const { POST } = await loadRoute()
    const req = new NextRequest("http://localhost/api/focus-period", {
      method: "POST",
      body: JSON.stringify({
        year: 2026,
        start_date: "2026-07-01",
        end_date: "2026-08-31",
        goal_id: "goal_missing",
        color: "#ea580c",
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.message).toBe("目标不存在")
    expect(prismaMock.focusPeriod.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run route tests**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm test -- src/app/api/focus-period/route.test.ts src/lib/focus-period-api.test.ts src/lib/focus-period-utils.test.ts
```

Expected: all route and helper tests pass.

- [ ] **Step 4: Run type check through build**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm run build
```

Expected: production compilation succeeds. The command may still exit non-zero on pre-existing lint/type errors outside this feature; confirm no new errors reference `src/app/api/focus-period`, `src/lib/focus-period-*`, or `src/components/focus-period`.

- [ ] **Step 5: Manual API smoke test**

Start the dev server:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm run dev
```

In another terminal, run:

```bash
curl "http://localhost:3000/api/focus-period?year=2026"
```

Expected: JSON response shaped like:

```json
{"list":[],"total":0}
```

Stop the dev server after the smoke test.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/focus-period/route.ts src/app/api/focus-period/route.test.ts
git commit -m "feat: add focus period api"
```

## Task 6: Add Shared Client Types and Timeline Component

**Files:**
- Create: `src/components/focus-period/types.ts`
- Create: `src/components/focus-period/year-timeline.tsx`

- [ ] **Step 1: Create client types**

Create `src/components/focus-period/types.ts`:

```ts
export interface FocusGoalSummary {
  goal_id: string
  name: string
  tag: string
  description?: string | null
}

export interface FocusPeriodView {
  period_id: string
  year: number
  start_date: string
  end_date: string
  goal_id: string
  color: string
  goal: FocusGoalSummary | null
}

export interface GoalOption {
  goal_id: string
  name: string
  tag: string
}
```

- [ ] **Step 2: Create timeline component**

Create `src/components/focus-period/year-timeline.tsx`:

```tsx
"use client"

import { buildTimelineSegments, dateToYearPercent } from "@/lib/focus-period-utils"
import type { FocusPeriodView } from "./types"

interface YearTimelineProps {
  year: number
  periods: FocusPeriodView[]
  today?: Date
}

function formatDate(value: string) {
  return value.slice(5).replace("-", "/")
}

export function YearTimeline({ year, periods, today = new Date() }: YearTimelineProps) {
  const segments = buildTimelineSegments(periods, year)
  const todayYear = today.getFullYear()
  const showToday = todayYear === year
  const todayPercent = showToday ? dateToYearPercent(today, year) : 0

  return (
    <div className="space-y-3">
      <div className="relative h-7 overflow-hidden rounded-md bg-gray-200">
        {segments.map(segment => (
          <div
            key={`${segment.kind}-${segment.start_date}-${segment.end_date}`}
            className="absolute inset-y-0"
            style={{
              left: `${segment.leftPercent}%`,
              width: `${segment.widthPercent}%`,
              backgroundColor: segment.kind === "gap" ? segment.color : segment.color,
            }}
            title={
              segment.kind === "gap"
                ? `${formatDate(segment.start_date)} - ${formatDate(segment.end_date)} 未设置目标`
                : `${segment.goal?.name ?? "目标已删除"} · ${formatDate(segment.start_date)} - ${formatDate(segment.end_date)}`
            }
          />
        ))}
        {showToday && (
          <div
            className="absolute -top-1 bottom-[-4px] w-0.5 bg-gray-950 shadow-sm"
            style={{ left: `${todayPercent}%` }}
            title="今天"
          />
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {periods.length === 0 ? (
          <span>全年未设置专注目标</span>
        ) : (
          periods.map(period => (
            <span key={period.period_id} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: period.color }} />
              {formatDate(period.start_date)}-{formatDate(period.end_date)} {period.goal?.name ?? "目标已删除"}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run tests and build**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm test -- src/lib/focus-period-utils.test.ts
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm run build
```

Expected: tests pass. Production compilation should succeed; existing unrelated lint/type errors may still make the build command exit non-zero.

- [ ] **Step 4: Commit**

```bash
git add src/components/focus-period/types.ts src/components/focus-period/year-timeline.tsx
git commit -m "feat: add focus period timeline"
```

## Task 7: Build Focus Period Drawer and Editor Row

**Files:**
- Create: `src/components/focus-period/focus-period-editor-row.tsx`
- Create: `src/components/focus-period/focus-period-drawer.tsx`

- [ ] **Step 1: Create editor row**

Create `src/components/focus-period/focus-period-editor-row.tsx`:

```tsx
"use client"

import { Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { assignFocusColor } from "@/lib/focus-period-utils"
import type { FocusPeriodView, GoalOption } from "./types"

interface FocusPeriodEditorRowProps {
  period: FocusPeriodView
  goals: GoalOption[]
  index: number
  onSave: (period: FocusPeriodView) => Promise<void>
  onDelete: (periodId: string) => Promise<void>
}

export function FocusPeriodEditorRow({ period, goals, index, onSave, onDelete }: FocusPeriodEditorRowProps) {
  const [draft, setDraft] = useState(period)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const goalLabels = useMemo(
    () => goals.map(goal => `${goal.name} · ${goal.tag}`),
    [goals],
  )
  const selectedLabel = draft.goal ? `${draft.goal.name} · ${draft.goal.tag}` : ""

  async function save(next: FocusPeriodView) {
    setDraft(next)
    if (!next.goal_id || !next.start_date || !next.end_date) return

    setSaving(true)
    setError("")
    try {
      await onSave(next)
    } catch (err) {
      setDraft(period)
      setError(err instanceof Error ? err.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  function updateGoal(label: string) {
    const goal = goals.find(item => `${item.name} · ${item.tag}` === label)
    if (!goal) return
    void save({
      ...draft,
      goal_id: goal.goal_id,
      goal,
      color: draft.color || assignFocusColor(index),
    })
  }

  return (
    <div className="space-y-3 rounded-md border bg-white p-3 shadow-sm dark:bg-gray-950">
      <div className="grid gap-3 sm:grid-cols-[1fr_130px_130px_72px_40px] sm:items-end">
        <div className="space-y-2">
          <Label>目标</Label>
          <Combobox
            options={goalLabels}
            value={selectedLabel}
            onChange={updateGoal}
            placeholder={draft.goal ? draft.goal.name : "搜索目标"}
            className="w-full"
          />
          {!draft.goal && draft.goal_id && (
            <p className="text-xs text-destructive">目标已删除，请重新选择或删除该阶段</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>开始</Label>
          <Input
            type="date"
            value={draft.start_date}
            onChange={event => void save({ ...draft, start_date: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>结束</Label>
          <Input
            type="date"
            value={draft.end_date}
            onChange={event => void save({ ...draft, end_date: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>颜色</Label>
          <Input
            type="color"
            value={draft.color || assignFocusColor(index)}
            onChange={event => void save({ ...draft, color: event.target.value })}
            className="h-10 p-1"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void onDelete(draft.period_id)}
          aria-label="删除阶段"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="min-h-4 text-xs">
        {saving && <span className="text-muted-foreground">保存中...</span>}
        {error && <span className="text-destructive">{error}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create drawer component**

Create `src/components/focus-period/focus-period-drawer.tsx`:

```tsx
"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { assignFocusColor, buildTimelineSegments, getYearStart } from "@/lib/focus-period-utils"
import { FocusPeriodEditorRow } from "./focus-period-editor-row"
import type { FocusPeriodView, GoalOption } from "./types"

interface FocusPeriodDrawerProps {
  open: boolean
  year: number
  periods: FocusPeriodView[]
  goals: GoalOption[]
  onClose: () => void
  onYearChange: (year: number) => void
  onSave: (period: FocusPeriodView) => Promise<void>
  onDelete: (periodId: string) => Promise<void>
  onCreateDraft: (draft: FocusPeriodView) => void
}

export function FocusPeriodDrawer({
  open,
  year,
  periods,
  goals,
  onClose,
  onYearChange,
  onSave,
  onDelete,
  onCreateDraft,
}: FocusPeriodDrawerProps) {
  if (!open) return null

  function addDraft() {
    const segments = buildTimelineSegments(
      periods.filter(period => !period.period_id.startsWith("draft_")),
      year,
    )
    const firstGap = segments.find(segment => segment.kind === "gap")
    const startDate = firstGap?.start_date ?? getYearStart(year)

    onCreateDraft({
      period_id: `draft_${Date.now()}`,
      year,
      start_date: startDate,
      end_date: firstGap?.end_date ?? startDate,
      goal_id: "",
      color: assignFocusColor(periods.length),
      goal: null,
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-lg border bg-background p-4 shadow-2xl lg:inset-y-0 lg:left-auto lg:w-[520px] lg:rounded-none lg:p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">调整年度阶段</h2>
            <p className="text-sm text-muted-foreground">每段时间只绑定一个目标</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
            <X className="size-5" />
          </Button>
        </div>

        <div className="mb-4 grid grid-cols-[120px_1fr] items-end gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">年份</label>
            <Input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={event => onYearChange(Number(event.target.value))}
            />
          </div>
          <Button type="button" onClick={addDraft}>
            新增阶段
          </Button>
        </div>

        <div className="space-y-3">
          {periods.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              当前年份还没有专注阶段
            </div>
          ) : (
            periods.map((period, index) => (
              <FocusPeriodEditorRow
                key={period.period_id}
                period={period}
                goals={goals}
                index={index}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </aside>
    </>
  )
}
```

- [ ] **Step 3: Run build**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm run build
```

Expected: production compilation succeeds. Existing unrelated lint/type errors may still make the command exit non-zero.

- [ ] **Step 4: Commit**

```bash
git add src/components/focus-period/focus-period-editor-row.tsx src/components/focus-period/focus-period-drawer.tsx
git commit -m "feat: add focus period editor drawer"
```

## Task 8: Build Homepage Focus Overview

**Files:**
- Create: `src/components/focus-period/focus-overview.tsx`

- [ ] **Step 1: Create overview component**

Create `src/components/focus-period/focus-overview.tsx`:

```tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { findCurrentFocusPeriod } from "@/lib/focus-period-utils"
import { FocusPeriodDrawer } from "./focus-period-drawer"
import type { FocusPeriodView, GoalOption } from "./types"
import { YearTimeline } from "./year-timeline"

export function FocusOverview() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [periods, setPeriods] = useState<FocusPeriodView[]>([])
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const currentPeriod = useMemo(() => findCurrentFocusPeriod(periods), [periods])

  async function loadPeriods(targetYear = year) {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/focus-period?year=${targetYear}`)
      if (!res.ok) throw new Error("专注阶段加载失败")
      const data = await res.json()
      setPeriods(data.list)
    } catch (err) {
      setError(err instanceof Error ? err.message : "专注阶段加载失败")
    } finally {
      setLoading(false)
    }
  }

  async function loadGoals() {
    const res = await fetch("/api/goal?pageSize=1000")
    if (!res.ok) return
    const data = await res.json()
    setGoals(data.list.map((goal: GoalOption) => ({
      goal_id: goal.goal_id,
      name: goal.name,
      tag: goal.tag,
    })))
  }

  useEffect(() => {
    void loadPeriods(year)
  }, [year])

  useEffect(() => {
    void loadGoals()
  }, [])

  async function savePeriod(period: FocusPeriodView) {
    const isDraft = period.period_id.startsWith("draft_")
    if (isDraft && !period.goal_id) return

    const res = await fetch("/api/focus-period", {
      method: isDraft ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(period),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || "保存失败")

    setPeriods(prev => {
      const next = isDraft
        ? prev.map(item => (item.period_id === period.period_id ? data : item))
        : prev.map(item => (item.period_id === data.period_id ? data : item))
      return next.sort((a, b) => a.start_date.localeCompare(b.start_date))
    })
  }

  async function deletePeriod(periodId: string) {
    if (periodId.startsWith("draft_")) {
      setPeriods(prev => prev.filter(period => period.period_id !== periodId))
      return
    }
    const res = await fetch(`/api/focus-period?period_id=${periodId}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.message || "删除失败")
    }
    setPeriods(prev => prev.filter(period => period.period_id !== periodId))
  }

  function addDraft(draft: FocusPeriodView) {
    setPeriods(prev => [...prev, draft])
  }

  return (
    <section className="w-full max-w-5xl rounded-lg border bg-white p-4 shadow-sm dark:bg-gray-950 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            {year} 当前只做这一件事
            <button
              type="button"
              className="ml-3 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => setOpen(true)}
            >
              调整
            </button>
          </p>
          <h2 className="mt-1 break-words text-2xl font-black tracking-tight sm:text-3xl">
            {loading ? "加载专注目标中..." : currentPeriod?.goal?.name ?? "当前没有设置专注目标"}
          </h2>
          {currentPeriod && (
            <p className="mt-2 text-sm text-muted-foreground">
              {currentPeriod.start_date} - {currentPeriod.end_date} · {currentPeriod.goal?.tag ?? "目标已删除"}
            </p>
          )}
        </div>
        {error && (
          <Button type="button" variant="outline" size="sm" onClick={() => void loadPeriods(year)}>
            重试
          </Button>
        )}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <YearTimeline year={year} periods={periods.filter(period => !period.period_id.startsWith("draft_"))} />
      )}

      <FocusPeriodDrawer
        open={open}
        year={year}
        periods={periods}
        goals={goals}
        onClose={() => setOpen(false)}
        onYearChange={setYear}
        onSave={savePeriod}
        onDelete={deletePeriod}
        onCreateDraft={addDraft}
      />
    </section>
  )
}
```

- [ ] **Step 2: Run build**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm run build
```

Expected: production compilation succeeds and no new errors reference `src/components/focus-period/focus-overview.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/focus-period/focus-overview.tsx
git commit -m "feat: add homepage focus overview"
```

## Task 9: Insert FocusOverview on the Homepage

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Import component**

Add this import to `src/app/page.tsx`:

```ts
import { FocusOverview } from "@/components/focus-period/focus-overview"
```

- [ ] **Step 2: Insert panel under the title**

In the returned JSX, place `<FocusOverview />` after the `h1` and before `MobileQuadrantWrapper`:

```tsx
<h1 className="mb-4 text-center text-2xl font-bold tracking-tight sm:mb-8 sm:text-3xl">
  Goal Mate - AI智能目标管理
</h1>

<FocusOverview />

{/* 移动端四象限 - 仅在移动端显示 */}
<MobileQuadrantWrapper />
```

If the vertical spacing feels too large because the `h1` already has `sm:mb-8`, reduce the heading margin to:

```tsx
<h1 className="mb-2 text-center text-2xl font-bold tracking-tight sm:mb-4 sm:text-3xl">
  Goal Mate - AI智能目标管理
</h1>
```

- [ ] **Step 3: Run build**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm run build
```

Expected: production compilation succeeds and no new errors reference `src/app/page.tsx` or `src/components/focus-period`.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: show focus overview on homepage"
```

## Task 10: Polish, Browser Verification, and Cleanup

**Files:**
- Optionally modify: `.gitignore`
- Review modified files from previous tasks.

- [ ] **Step 1: Ignore brainstorm artifacts if present**

If `git status --short` shows `.superpowers/`, add this line to `.gitignore`:

```gitignore
.superpowers/
```

Run:

```bash
git status --short
```

Expected: `.superpowers/` no longer appears.

- [ ] **Step 2: Run full verification**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm test
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm run build
```

Expected: all tests introduced by this plan pass. Production compilation should succeed; existing unrelated lint/type errors may still make the build command exit non-zero.

- [ ] **Step 3: Start local app**

Run:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm run dev
```

Expected: Next.js dev server starts, usually at `http://localhost:3000`.

- [ ] **Step 4: Verify desktop layout**

Open `http://localhost:3000` in the Browser tool. Verify:

- The focus panel appears under the title and above the three entrance cards.
- The main text is prominent.
- The `调整` text is visually light and small.
- Empty periods render gray on the timeline.
- Existing periods render with their configured colors.
- Hovering colored segments shows goal and date details.
- Clicking `调整` opens the drawer.
- Goal search in the drawer filters existing goals.
- Date inputs and color input are usable.

- [ ] **Step 5: Verify mobile layout**

Use a mobile viewport in the Browser tool. Verify:

- The focus panel does not overflow.
- Timeline labels wrap cleanly.
- The drawer uses the small-screen layout and remains readable.
- The floating AI assistant button does not cover required drawer controls.

- [ ] **Step 6: Stop dev server**

Stop the `npm run dev` session.

- [ ] **Step 7: Commit cleanup**

If `.gitignore` or small polish edits were made:

```bash
git add .gitignore src/components/focus-period src/app/page.tsx
git commit -m "chore: polish focus period experience"
```

If no files changed after verification, do not create an empty commit.

## Final Verification Checklist

- [ ] `PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm test` passes.
- [ ] `PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npm run build` reaches production compilation and reports no new errors in feature files.
- [ ] `PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npx prisma generate` succeeds.
- [ ] `PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH" npx prisma db push` has been run against the local development database.
- [ ] Homepage shows the focus panel in the intended location.
- [ ] Current year comes from `new Date().getFullYear()` and is not hard-coded.
- [ ] Current date outside all periods shows “当前没有设置专注目标”.
- [ ] Unassigned time spans show gray.
- [ ] Each saved period has exactly one goal.
- [ ] Deleted goals show as “目标已删除” instead of deleting periods.
- [ ] Drawer goal selector supports typing to search.
- [ ] Same-year overlap validation rejects conflicting date ranges.
