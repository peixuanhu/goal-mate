# Focus Associated Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-collapsed read-only section under the homepage "当前只做这一件事" panel that lists all plans associated with the current focus goal.

**Architecture:** Keep the feature inside the existing client `FocusOverview` component. Derive the current focus goal exactly as today, then fetch associated plans through the existing `/api/plan?goal_id=...&pageSize=1000` endpoint. Render a read-only goal-route-style table with local section-level loading, empty, and error states.

**Tech Stack:** Next.js 15 App Router, React 19 client components, TypeScript, Tailwind CSS, local shadcn-style Button, lucide-react icons, Vitest source regression tests.

---

## File Structure

- Modify `src/components/focus-period/focus-overview.tsx`
  - Add `useRouter` and chevron imports.
  - Add `FocusPlan` parsing helpers for `/api/plan`.
  - Add plan loading state and a `loadFocusPlans` callback tied to `currentPeriod?.goal_id`.
  - Add formatting helpers for difficulty, regular progress, recurring progress, and recent progress date.
  - Add the default-collapsed associated plan section below the current focus period metadata and above the error/timeline area.
- Modify `src/components/goals/goal-layout-regression.test.ts`
  - Add source regression tests that pin the default-collapsed section, API URL, row navigation URL, table layout, and section-scoped error behavior.

No schema changes, API changes, or new dependencies are required.

## Baseline Notes

The repository already has uncommitted changes in several files. Do not revert them. This feature intentionally touches only the two files listed above.

Use Node 18.18+ for commands. If the shell default Node is too old, prefix commands with:

```bash
PATH="$HOME/.nvm/versions/node/v18.18.2/bin:$PATH"
```

## Task 1: Add Source Regression Coverage

**Files:**
- Modify: `src/components/goals/goal-layout-regression.test.ts`

- [ ] **Step 1: Add failing tests for the homepage focus plan section**

Append these tests inside the existing `describe("table action layout regression", () => { ... })` block in `src/components/goals/goal-layout-regression.test.ts`, after the current last test:

```ts
  it("loads associated plans for the current focus goal from the existing plan API", () => {
    const source = readProjectFile("src/components/focus-period/focus-overview.tsx")

    expect(source).toContain("type FocusPlan = {")
    expect(source).toContain("const [focusPlans, setFocusPlans] = React.useState<FocusPlan[]>([])")
    expect(source).toContain("fetch(`/api/plan?goal_id=${encodeURIComponent(goalId)}&pageSize=1000`)")
    expect(source).toContain("void loadFocusPlans(currentPeriod?.goal_id)")
    expect(source).not.toContain("plans:")
  })

  it("keeps the associated focus plans section collapsed by default", () => {
    const source = readProjectFile("src/components/focus-period/focus-overview.tsx")

    expect(source).toContain("const [focusPlansOpen, setFocusPlansOpen] = React.useState(false)")
    expect(source).toContain("aria-expanded={focusPlansOpen}")
    expect(source).toContain("关联计划")
    expect(source).toContain("focusPlansOpen ?")
    expect(source).toContain("<ChevronDown className=\"h-4 w-4\" />")
  })

  it("renders current focus plans as a read-only goal route table", () => {
    const source = readProjectFile("src/components/focus-period/focus-overview.tsx")

    expect(source).toContain("grid-cols-[64px_minmax(180px,1fr)_72px_150px_100px]")
    expect(source).toContain("第 {index + 1} 步")
    expect(source).toContain("计划")
    expect(source).toContain("难度")
    expect(source).toContain("进度")
    expect(source).toContain("最近进展")
    expect(source).not.toContain("DndContext")
    expect(source).not.toContain("SortableContext")
  })

  it("opens focus plan rows on the plans page with goal and highlight query params", () => {
    const source = readProjectFile("src/components/focus-period/focus-overview.tsx")

    expect(source).toContain("function openFocusPlan(planId: string)")
    expect(source).toContain("router.push(`/plans?goal_id=${encodeURIComponent(currentPeriod.goal_id)}&highlight=${encodeURIComponent(planId)}`)")
    expect(source).toContain("onClick={() => openFocusPlan(plan.plan_id)}")
  })

  it("keeps associated plan loading and errors scoped to the collapsible section", () => {
    const source = readProjectFile("src/components/focus-period/focus-overview.tsx")

    expect(source).toContain("setFocusPlansError(loadError instanceof Error && loadError.message ? loadError.message : \"关联计划加载失败\")")
    expect(source).toContain("加载关联计划...")
    expect(source).toContain("暂无关联计划")
    expect(source).toContain("重试")
    expect(source).toContain("onClick={() => void loadFocusPlans(currentPeriod.goal_id)}")
  })
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
npm test -- src/components/goals/goal-layout-regression.test.ts
```

Expected: the suite fails because `focus-overview.tsx` does not yet contain `FocusPlan`, `focusPlansOpen`, the associated plan API fetch, or the new route table strings.

- [ ] **Step 3: Commit the failing regression tests**

Run:

```bash
git add src/components/goals/goal-layout-regression.test.ts
git commit -m "test: cover focus associated plan section"
```

Expected: only `src/components/goals/goal-layout-regression.test.ts` is committed. If the worktree has unrelated edits, verify with `git status --short` before committing and do not stage unrelated files.

## Task 2: Add Plan Loading State and Helpers

**Files:**
- Modify: `src/components/focus-period/focus-overview.tsx`

- [ ] **Step 1: Add imports**

In `src/components/focus-period/focus-overview.tsx`, replace the import block at the top with this import set:

```ts
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { findCurrentFocusPeriod } from "@/lib/focus-period-utils"
import { getRecurringTaskDetails, getRecurrenceTypeDisplay } from "@/lib/recurring-utils"
import { cn } from "@/lib/utils"

import { FocusPeriodDrawer } from "./focus-period-drawer"
import type { FocusPeriodView, GoalOption } from "./types"
import { YearTimeline } from "./year-timeline"
```

- [ ] **Step 2: Add plan type, parser, and format helpers**

In `src/components/focus-period/focus-overview.tsx`, add this code after the existing `interface`-style validation helpers and before `parseFocusPeriodList`:

```ts
type FocusPlan = {
  plan_id: string
  name: string
  difficulty: string | null
  progress: number
  is_recurring: boolean
  recurrence_type: string | null
  recurrence_value: string | null
  progressRecords?: Array<{ gmt_create: string }>
}

function isProgressRecord(value: unknown): value is { gmt_create: string } {
  return isRecord(value) && typeof value.gmt_create === "string"
}

function isFocusPlan(value: unknown): value is FocusPlan {
  return (
    isRecord(value) &&
    typeof value.plan_id === "string" &&
    typeof value.name === "string" &&
    (value.difficulty === null || value.difficulty === undefined || typeof value.difficulty === "string") &&
    typeof value.progress === "number" &&
    typeof value.is_recurring === "boolean" &&
    (value.recurrence_type === null || value.recurrence_type === undefined || typeof value.recurrence_type === "string") &&
    (value.recurrence_value === null || value.recurrence_value === undefined || typeof value.recurrence_value === "string") &&
    (value.progressRecords === undefined || (Array.isArray(value.progressRecords) && value.progressRecords.every(isProgressRecord)))
  )
}

function parseFocusPlanList(data: unknown): FocusPlan[] {
  if (!isRecord(data) || !Array.isArray(data.list) || !data.list.every(isFocusPlan)) {
    throw new Error("关联计划数据格式无效")
  }

  return data.list
}

function formatPlanProgress(plan: FocusPlan): string {
  if (plan.is_recurring) {
    const details = getRecurringTaskDetails({
      ...plan,
      recurrence_type: plan.recurrence_type ?? undefined,
      recurrence_value: plan.recurrence_value ?? undefined,
      progressRecords: (plan.progressRecords ?? []).map(record => ({ gmt_create: new Date(record.gmt_create) })),
    })

    return details ? `${details.progressText} ${details.statusText}` : getRecurrenceTypeDisplay(plan.recurrence_type || "")
  }

  return `${Math.round((plan.progress || 0) * 100)}%`
}

function formatPlanRecentProgress(plan: FocusPlan): string {
  const firstRecord = plan.progressRecords?.[0]
  if (!firstRecord) return "暂无进展"

  return new Date(firstRecord.gmt_create).toLocaleDateString("zh-CN")
}

function getPlanDifficultyClass(difficulty?: string | null): string {
  switch (difficulty) {
    case "hard":
    case "high":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    case "easy":
    case "low":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
    default:
      return "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-200"
  }
}
```

- [ ] **Step 3: Add component state and router**

Inside `export function FocusOverview()`, add `const router = useRouter()` as the first line in the function body.

Then add these state declarations after the existing `const [goals, setGoals] = React.useState<GoalOption[]>([])` line:

```ts
  const [focusPlans, setFocusPlans] = React.useState<FocusPlan[]>([])
  const [focusPlansOpen, setFocusPlansOpen] = React.useState(false)
  const [focusPlansLoading, setFocusPlansLoading] = React.useState(false)
  const [focusPlansError, setFocusPlansError] = React.useState<string | null>(null)
```

- [ ] **Step 4: Add the plan loader and effect**

Add this callback after the existing `loadFocusData` callback:

```ts
  const loadFocusPlans = React.useCallback(async (goalId?: string) => {
    if (!goalId) {
      setFocusPlans([])
      setFocusPlansError(null)
      setFocusPlansLoading(false)
      return
    }

    setFocusPlans([])
    setFocusPlansLoading(true)
    setFocusPlansError(null)

    try {
      const response = await fetch(`/api/plan?goal_id=${encodeURIComponent(goalId)}&pageSize=1000`)
      if (!response.ok) {
        throw new Error(await readApiError(response, "关联计划加载失败"))
      }

      setFocusPlans(parseFocusPlanList(await response.json()))
    } catch (loadError) {
      setFocusPlans([])
      setFocusPlansError(loadError instanceof Error && loadError.message ? loadError.message : "关联计划加载失败")
    } finally {
      setFocusPlansLoading(false)
    }
  }, [])
```

Move the existing memo declarations for `savedPeriods`, `currentPeriod`, `currentGoalName`, and `currentGoalTag` so they appear immediately after the existing effect that calls `loadFocusData()` and before the new plan-loading effect:

```ts
  const savedPeriods = React.useMemo(() => periods.filter(period => !isDraftPeriod(period)), [periods])
  const currentPeriod = React.useMemo(() => findCurrentFocusPeriod(savedPeriods), [savedPeriods])
  const currentGoalName = currentPeriod ? currentPeriod.goal?.name ?? "目标已删除" : undefined
  const currentGoalTag = currentPeriod?.goal?.tag
```

Remove the old copy of those four declarations from their previous location so each variable is declared exactly once.

Then add this effect immediately after those memo declarations:

```ts
  React.useEffect(() => {
    void loadFocusPlans(currentPeriod?.goal_id)
  }, [currentPeriod?.goal_id, loadFocusPlans])
```

- [ ] **Step 5: Add row navigation**

Add this function before `return (` in `FocusOverview`:

```ts
  function openFocusPlan(planId: string) {
    if (!currentPeriod) return

    router.push(`/plans?goal_id=${encodeURIComponent(currentPeriod.goal_id)}&highlight=${encodeURIComponent(planId)}`)
  }
```

- [ ] **Step 6: Run tests and verify Task 1 expectations still fail only on rendering strings**

Run:

```bash
npm test -- src/components/goals/goal-layout-regression.test.ts
```

Expected: the plan loading and navigation string expectations now pass. The suite may still fail on table rendering strings such as `grid-cols-[64px_minmax(180px,1fr)_72px_150px_100px]`, `关联计划`, or `暂无关联计划` because the UI has not been rendered yet.

- [ ] **Step 7: Commit plan loading helpers**

Run:

```bash
git add src/components/focus-period/focus-overview.tsx
git commit -m "feat: load plans for current focus goal"
```

Expected: only `src/components/focus-period/focus-overview.tsx` is committed in this step.

## Task 3: Render the Default-Collapsed Read-Only Plan Table

**Files:**
- Modify: `src/components/focus-period/focus-overview.tsx`

- [ ] **Step 1: Insert the collapsible section**

In `src/components/focus-period/focus-overview.tsx`, insert this JSX after the existing `currentPeriod ? (...) : null` metadata block and before the existing `{error ? (...) : null}` block:

```tsx
      {currentPeriod ? (
        <div className="mt-4 rounded-md border bg-muted/20">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
            aria-expanded={focusPlansOpen}
            onClick={() => setFocusPlansOpen(open => !open)}
          >
            <span className="font-medium">
              关联计划
              <span className="ml-2 text-muted-foreground">{focusPlansLoading ? "加载中" : `${focusPlans.length} 个`}</span>
            </span>
            {focusPlansOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {focusPlansOpen ? (
            <div className="border-t px-3 py-3">
              {focusPlansError ? (
                <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
                  <p>{focusPlansError}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadFocusPlans(currentPeriod.goal_id)}>
                    重试
                  </Button>
                </div>
              ) : focusPlansLoading ? (
                <div className="py-5 text-center text-sm text-muted-foreground">加载关联计划...</div>
              ) : focusPlans.length === 0 ? (
                <div className="rounded border border-dashed bg-background py-5 text-center text-sm text-muted-foreground">
                  暂无关联计划
                </div>
              ) : (
                <div className="overflow-x-auto rounded border bg-background">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-[64px_minmax(180px,1fr)_72px_150px_100px] items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>步骤</span>
                      <span>计划</span>
                      <span>难度</span>
                      <span>进度</span>
                      <span>最近进展</span>
                    </div>
                    {focusPlans.map((plan, index) => (
                      <button
                        key={plan.plan_id}
                        type="button"
                        className="grid w-full grid-cols-[64px_minmax(180px,1fr)_72px_150px_100px] items-center gap-3 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/40"
                        onClick={() => openFocusPlan(plan.plan_id)}
                      >
                        <span className="whitespace-nowrap font-medium text-muted-foreground">第 {index + 1} 步</span>
                        <span className="min-w-0 truncate font-medium">{plan.name}</span>
                        <span className={cn("inline-flex justify-self-start rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", getPlanDifficultyClass(plan.difficulty))}>
                          {plan.difficulty || "未设置"}
                        </span>
                        <span className="whitespace-nowrap text-muted-foreground">{formatPlanProgress(plan)}</span>
                        <span className="whitespace-nowrap text-muted-foreground">{formatPlanRecentProgress(plan)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
```

- [ ] **Step 2: Run the focused regression tests**

Run:

```bash
npm test -- src/components/goals/goal-layout-regression.test.ts
```

Expected: all tests in `goal-layout-regression.test.ts` pass.

- [ ] **Step 3: Run all existing tests**

Run:

```bash
npm test
```

Expected: all Vitest tests pass. If unrelated pre-existing failures appear, record the failing files and confirm that the new focus-plan tests pass.

- [ ] **Step 4: Commit the rendered section**

Run:

```bash
git add src/components/focus-period/focus-overview.tsx
git commit -m "feat: show associated plans in focus overview"
```

Expected: only `src/components/focus-period/focus-overview.tsx` is committed in this step.

## Task 4: Browser Verification and Build Check

**Files:**
- No source edits expected unless verification finds a problem.

- [ ] **Step 1: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Next.js starts and prints a local URL, usually `http://localhost:3000`. If port 3000 is busy, use the URL printed by Next.js.

- [ ] **Step 2: Verify homepage desktop layout**

Open the homepage in the browser at the dev server URL.

Expected:

- The "当前只做这一件事" focus panel still shows the current goal and year timeline.
- The new `关联计划` section is visible only when there is a current focus goal.
- The section is collapsed by default.
- Expanding it shows the route table.
- Table content scrolls horizontally if needed instead of overflowing the panel.
- Clicking a plan row navigates to `/plans?goal_id=<goal_id>&highlight=<plan_id>`.

- [ ] **Step 3: Verify homepage mobile layout**

Use a mobile-width viewport around 390px wide.

Expected:

- The focus panel does not overflow the viewport.
- The `关联计划` header fits on one row or wraps cleanly.
- The expanded table is horizontally scrollable.
- Text does not overlap other content.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: the build completes, or it fails only on known unrelated pre-existing files. There should be no new build or type errors in `src/components/focus-period/focus-overview.tsx` or `src/components/goals/goal-layout-regression.test.ts`.

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing user changes remain. If verification required follow-up fixes, commit those fixes with:

```bash
git add src/components/focus-period/focus-overview.tsx src/components/goals/goal-layout-regression.test.ts
git commit -m "fix: polish focus associated plans layout"
```

## Self-Review

- Spec coverage: The plan covers default-collapsed behavior, current-goal-only visibility, existing `/api/plan?goal_id=...` reuse, read-only goal-route-style table, section-scoped loading/error/empty states, row navigation, no schema/API changes, tests, desktop/mobile verification, and build verification.
- Placeholder scan: No forbidden placeholder markers or unspecified edge handling remains.
- Type consistency: The plan consistently uses `FocusPlan`, `focusPlans`, `focusPlansOpen`, `focusPlansLoading`, `focusPlansError`, `loadFocusPlans`, and `openFocusPlan`.
