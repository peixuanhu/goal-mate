# Shared Workspace Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make today, goals, plans, progress, and reports share one header, actionable goal-tree/quadrant/unclassified sidebar, and AI sidebar while applying consistent completed-plan visibility.

**Architecture:** Keep the existing route pages as the central-content owners and turn `MainLayout` into the shared application shell. A focused sidebar controller loads schedulable candidates for the selected date, a reusable quadrant board owns explicit quadrant assignments, and a shared pure completion helper supplies both server filtering and client styling.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma, Tailwind CSS, Radix Tabs, dnd-kit, Vitest, Testing Library.

---

## File map

- Create `src/lib/plan-completion.ts`: one completion predicate for recurring and ordinary plans.
- Create `src/lib/plan-completion.test.ts`: boundary coverage for both completion models.
- Modify `src/lib/today/query.ts` and `src/lib/today/query.test.ts`: load recurrence records and remove completed recurring candidates.
- Create `src/components/workspace/global-header.tsx`: shared primary navigation.
- Create `src/components/workspace/quadrant-board.tsx`: embedded 2×2 quadrant UI and mutations.
- Create `src/components/workspace/workspace-sidebar-controller.tsx`: candidate loading and cross-page scheduling modal.
- Modify `src/components/today/goal-candidate-panel.tsx` and its tests: goal-only tree, embedded quadrant board, “未归类”.
- Rewrite `src/components/main-layout.tsx`: shared desktop shell, mobile drawers, outer drag context, shared AI.
- Modify `src/components/today/ai-workspace.tsx`: page-neutral heading and flexible minimum height.
- Modify `src/components/today/today-workspace.tsx` and its tests: central today content inside the shared shell.
- Modify `src/app/goals/page.tsx`, `src/app/plans/page.tsx`, `src/app/progress/page.tsx`, and `src/app/reports/page.tsx`: remove redundant return-home controls.
- Update regression tests that currently require the old three-column Today implementation.

### Task 1: Centralize completion semantics

**Files:**
- Create: `src/lib/plan-completion.ts`
- Create: `src/lib/plan-completion.test.ts`
- Modify: `src/lib/today/query.ts`
- Modify: `src/lib/today/query.test.ts`
- Modify: `src/components/quadrant-left-sidebar.tsx`

- [ ] **Step 1: Write the failing completion tests**

```ts
expect(isPlanCompleted({ is_recurring: false, progress: 1, progressRecords: [] })).toBe(true)
expect(isPlanCompleted({ is_recurring: false, progress: 0.99, progressRecords: [] })).toBe(false)
expect(isPlanCompleted({
  is_recurring: true,
  progress: 0,
  recurrence_type: "daily",
  recurrence_value: "1",
  progressRecords: [{ gmt_create: new Date(), counts_toward_recurrence: true }],
})).toBe(true)
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- src/lib/plan-completion.test.ts`

Expected: FAIL because `@/lib/plan-completion` does not exist.

- [ ] **Step 3: Add the pure helper**

```ts
import { isRecurringTaskCompleted, type RecurringPlan } from "./recurring-utils"

export type CompletablePlan = RecurringPlan & { progress: number }

export function isPlanCompleted(plan: CompletablePlan): boolean {
  return plan.is_recurring
    ? isRecurringTaskCompleted({ ...plan, progressRecords: plan.progressRecords ?? [] })
    : (plan.progress || 0) >= 1
}
```

- [ ] **Step 4: Make Today candidates recurrence-aware**

Add `progressRecords` to `PlanCandidateRow`, add the relation to the Prisma include, and replace `.filter(plan => plan.progress < 1)` with `.filter(plan => !isPlanCompleted(plan))`. Keep the database filter broad enough to include recurring rows:

```ts
where: {
  OR: [
    { is_recurring: true },
    { is_recurring: false, progress: { lt: 1 } },
  ],
},
progressRecords: {
  select: { gmt_create: true, counts_toward_recurrence: true },
  orderBy: { gmt_create: "desc" },
},
```

- [ ] **Step 5: Add query regression cases**

Test that a completed ordinary plan and a current-period-completed recurring plan are absent, while an incomplete recurring plan remains. Update query argument expectations to include `progressRecords` and the new `OR` filter.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- src/lib/plan-completion.test.ts src/lib/today/query.test.ts src/components/recurrence-completion-semantics.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/plan-completion.ts src/lib/plan-completion.test.ts src/lib/today/query.ts src/lib/today/query.test.ts src/components/quadrant-left-sidebar.tsx
git commit -m "fix: unify completed plan semantics"
```

### Task 2: Build the reusable 2×2 quadrant board

**Files:**
- Create: `src/components/workspace/quadrant-board.tsx`
- Create: `src/components/workspace/quadrant-board.test.tsx`
- Modify: `src/components/quadrant-left-sidebar.tsx`

- [ ] **Step 1: Write failing board behavior tests**

Mock `/api/plan/priority` with one incomplete and one completed plan. Assert four named regions, the completed item’s `line-through` class, and a PUT request after moving or removing an item.

```tsx
expect(screen.getByRole("region", { name: "重要且紧急" })).toBeTruthy()
expect(screen.getByText("已完成计划").className).toContain("line-through")
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/components/workspace/quadrant-board.test.tsx`

Expected: FAIL because `QuadrantBoard` does not exist.

- [ ] **Step 3: Implement `QuadrantBoard`**

Move the existing quadrant constants, task card, droppable column, fetch, move, remove, and click behavior into a component whose root is only the grid:

```tsx
export function QuadrantBoard() {
  return (
    <DndContext collisionDetection={rectIntersection} onDragEnd={handleDragEnd} sensors={sensors}>
      <div className="grid h-full min-h-[420px] grid-cols-2 gap-2">
        {QUADRANTS.map(quadrant => (
          <QuadrantColumn
            key={quadrant.id}
            quadrant={quadrant}
            plans={quadrantData[quadrant.id]}
            onTaskDrop={updatePlanQuadrant}
            onTaskClick={planId => router.push(`/progress?plan_id=${planId}`)}
            onRemoveTask={removeFromQuadrant}
          />
        ))}
      </div>
    </DndContext>
  )
}
```

Use `isPlanCompleted` for delete-line styling and retain `data-quadrant-drop-id` for cross-component plan dragging.

- [ ] **Step 4: Keep the legacy wrapper thin**

Change `QuadrantLeftSidebar` to render its existing header/collapse chrome around `<QuadrantBoard />`, so current drag targets and user modifications remain valid during migration.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/components/workspace/quadrant-board.test.tsx src/components/goals/goal-layout-regression.test.ts`

Expected: PASS.

```bash
git add src/components/workspace/quadrant-board.tsx src/components/workspace/quadrant-board.test.tsx src/components/quadrant-left-sidebar.tsx
git commit -m "feat: extract shared quadrant board"
```

### Task 3: Turn the candidate panel into the shared three-view sidebar

**Files:**
- Modify: `src/components/today/goal-candidate-panel.tsx`
- Modify: `src/components/today/goal-candidate-panel.behavior.test.tsx`
- Modify: `src/components/today/today-workspace-regression.test.ts`

- [ ] **Step 1: Add failing view rules**

Add an unassigned candidate beside assigned goal candidates. Assert the unassigned candidate is absent from the goal tree, present under “未归类”, and that the quadrant tab contains `QuadrantBoard`’s four regions.

- [ ] **Step 2: Run and observe failures**

Run: `npm test -- src/components/today/goal-candidate-panel.behavior.test.tsx src/components/today/today-workspace-regression.test.ts`

Expected: FAIL on the old “收集箱” label and vertical quadrant sections.

- [ ] **Step 3: Implement the three view rules**

```ts
const goalCandidates = candidates.filter(candidate => candidate.goal_id !== null)
const unclassifiedCandidates = candidates.filter(
  candidate => candidate.goal_id === null && candidate.effective_quadrant === null,
)
```

Feed only `goalCandidates` to `GoalTree`, render `<QuadrantBoard />` in the quadrant tab, and rename the tab/value from `inbox` to `unclassified` with label “未归类”. Keep the existing scheduling cards for goal tree and unclassified.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/components/today/goal-candidate-panel.behavior.test.tsx src/components/today/today-workspace-regression.test.ts`

Expected: PASS.

```bash
git add src/components/today/goal-candidate-panel.tsx src/components/today/goal-candidate-panel.behavior.test.tsx src/components/today/today-workspace-regression.test.ts
git commit -m "feat: unify workspace sidebar views"
```

### Task 4: Add cross-page sidebar loading and scheduling

**Files:**
- Create: `src/components/workspace/workspace-sidebar-controller.tsx`
- Create: `src/components/workspace/workspace-sidebar-controller.test.tsx`

- [ ] **Step 1: Write failing controller tests**

Freeze the browser date, mock `/api/today?date=2026-08-24`, click “安排到今天”, submit the editor, and assert POST `/api/schedule-block` uses the candidate IDs and an idempotency key.

- [ ] **Step 2: Run the test**

Run: `npm test -- src/components/workspace/workspace-sidebar-controller.test.tsx`

Expected: FAIL because the controller module is missing.

- [ ] **Step 3: Implement loader and modal state**

Resolve `date ?? normalizeLocalDateInput(new Date())`, fetch the Today view, render `GoalCandidatePanel`, calculate the next free start with `findNextFreeStart`, and show `ScheduleBlockEditor`.

```ts
const response = await fetch(`/api/today?date=${encodeURIComponent(resolvedDate)}`, { signal })
const payload = await response.json() as TodayView
setView(payload)
```

POST new blocks with:

```ts
await fetch("/api/schedule-block", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
  body: JSON.stringify({
    plan_id: candidate.plan_id,
    action_id: candidate.action_id,
    start_at: payload.start_at,
    end_at: payload.end_at,
    status: "scheduled",
    source: "manual",
  }),
})
```

After success, refetch and dispatch `goal-mate:data-changed`.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/components/workspace/workspace-sidebar-controller.test.tsx`

Expected: PASS.

```bash
git add src/components/workspace/workspace-sidebar-controller.tsx src/components/workspace/workspace-sidebar-controller.test.tsx
git commit -m "feat: add shared sidebar scheduling controller"
```

### Task 5: Build the shared application shell

**Files:**
- Create: `src/components/workspace/global-header.tsx`
- Create: `src/components/workspace/global-header.test.tsx`
- Rewrite: `src/components/main-layout.tsx`
- Create: `src/components/main-layout.test.tsx`
- Modify: `src/components/today/ai-workspace.tsx`

- [ ] **Step 1: Write failing shell tests**

Mock `usePathname` and assert all five navigation links exist, the active link has `aria-current="page"`, the shared sidebar controller renders, and `AiWorkspace` renders once.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- src/components/workspace/global-header.test.tsx src/components/main-layout.test.tsx`

Expected: FAIL because `GlobalHeader` and the new shell are missing.

- [ ] **Step 3: Implement the header**

Use a constant route list and exact-path active state:

```ts
const NAV_ITEMS = [
  { href: "/", label: "今天" },
  { href: "/goals", label: "目标" },
  { href: "/plans", label: "计划" },
  { href: "/progress", label: "进展" },
  { href: "/reports", label: "回顾" },
] as const
```

- [ ] **Step 4: Rewrite `MainLayout` as the app shell**

Add optional `workspaceDate` and `onWorkspaceDragEnd` props. Render `GlobalHeader`, desktop left sidebar, central scroll container, desktop AI sidebar, and two mutually exclusive mobile drawers. Wrap the row in the outer `DndContext` so Today’s timeline can receive sidebar drags.

- [ ] **Step 5: Make AI copy page-neutral**

Change “今日助手” to “智能助手” and allow the shell to control height rather than forcing every page to a second `min-h-[620px]`.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- src/components/workspace/global-header.test.tsx src/components/main-layout.test.tsx src/components/today/ai-workspace.behavior.test.tsx`

Expected: PASS.

```bash
git add src/components/workspace/global-header.tsx src/components/workspace/global-header.test.tsx src/components/main-layout.tsx src/components/main-layout.test.tsx src/components/today/ai-workspace.tsx
git commit -m "feat: add unified application shell"
```

### Task 6: Migrate Today and the four management pages

**Files:**
- Modify: `src/components/today/today-workspace.tsx`
- Modify: `src/components/today/today-workspace.behavior.test.tsx`
- Modify: `src/components/today/today-workspace-regression.test.ts`
- Modify: `src/app/goals/page.tsx`
- Modify: `src/app/plans/page.tsx`
- Modify: `src/app/progress/page.tsx`
- Modify: `src/app/reports/page.tsx`
- Modify: `src/components/goals/goal-layout-regression.test.ts`

- [ ] **Step 1: Update regression tests to require the shared shell**

Assert Today imports/renders `MainLayout`, passes `workspaceDate={date}` and `onWorkspaceDragEnd={handleDragEnd}`, and no longer contains its own `GoalCandidatePanel`, `AiWorkspace`, `UserMenu`, or top navigation.

- [ ] **Step 2: Run tests and verify old structure fails**

Run: `npm test -- src/components/today/today-workspace-regression.test.ts src/components/today/today-workspace.behavior.test.tsx`

Expected: FAIL because Today still owns its full three-column shell.

- [ ] **Step 3: Migrate Today**

Wrap the date toolbar, timeline, schedule editor, and completion sheet with:

```tsx
<MainLayout workspaceDate={date} onWorkspaceDragEnd={handleDragEnd}>
  <div className="h-full min-h-0 bg-[#f5f5f4] p-3 sm:p-5">
    {/* date toolbar, timeline, and Today-owned edit/completion overlays */}
  </div>
</MainLayout>
```

Remove Today’s internal `DndContext`, header, candidate column, AI column, and mobile candidate/AI toggles. Listen for external `goal-mate:data-changed` schedule events and preserve the current view while refetching.

- [ ] **Step 4: Remove redundant return-home controls**

Delete only the standalone “返回首页” button blocks from goals, plans, progress, and reports. Keep their forms, filters, tables, and CRUD behavior unchanged.

- [ ] **Step 5: Run route and component tests**

Run: `npm test -- src/components/today/today-workspace.behavior.test.tsx src/components/today/today-workspace-regression.test.ts src/app/plans/page.test.tsx src/app/progress/page.test.tsx src/components/goals/goal-layout-regression.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/today/today-workspace.tsx src/components/today/today-workspace.behavior.test.tsx src/components/today/today-workspace-regression.test.ts src/app/goals/page.tsx src/app/plans/page.tsx src/app/progress/page.tsx src/app/reports/page.tsx src/components/goals/goal-layout-regression.test.ts
git commit -m "feat: migrate routes to shared workspace shell"
```

### Task 7: Full verification and visual QA

**Files:**
- Verify: all files changed in Tasks 1–6.

- [ ] **Step 1: Run the complete unit suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npx eslint src --max-warnings=0`

Expected: exit 0.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: Next.js production build exits 0.

- [ ] **Step 4: Browser QA**

Start `npm run dev`, then inspect `/`, `/goals`, `/plans`, `/progress`, and `/reports` at desktop and mobile widths. Verify identical shell/navigation, 2×2 quadrant blocks, completed strike-through, hidden completed goal-tree items, “未归类”, AI folding/drawers, Today scheduling, and absence of horizontal overflow.

- [ ] **Step 5: Final commit**

```bash
git add src docs/superpowers/plans/2026-08-24-shared-workspace-shell.md
git commit -m "fix: polish shared workspace shell"
```
