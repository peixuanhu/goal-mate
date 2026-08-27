# Goal Tree Item Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make goal and plan names in the Today workspace goal tree navigate to, scroll to, and temporarily highlight their matching management-page rows without opening edit mode.

**Architecture:** The goal tree emits encoded, shareable `highlight` query parameters. Each destination page owns locating its row: the plans page extends its existing highlight state with a row ref and scroll effect, while the goals page uses the ordered `all=true` response to calculate the target page before scrolling and highlighting the rendered row.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## File map

- `src/components/today/goal-candidate-panel.tsx`: render accessible goal and plan links while leaving action names and scheduling controls unchanged.
- `src/components/today/goal-candidate-panel.behavior.test.tsx`: verify encoded destinations and the existing schedule-button boundary.
- `src/app/plans/page.tsx`: attach a ref to the highlighted plan row, scroll it into view, and clean up the existing highlight timer.
- `src/app/plans/page.test.tsx`: drive the page with a `highlight` query and verify row highlighting and scrolling.
- `src/app/goals/page.tsx`: read the highlight query, calculate the matching page from the ordered full list, render a highlighted row, and scroll it into view.
- `src/app/goals/page.test.tsx`: verify target-page calculation, scrolling, non-editing behavior, and missing-target fallback.

### Task 1: Add goal-tree navigation links

**Files:**
- Modify: `src/components/today/goal-candidate-panel.tsx`
- Test: `src/components/today/goal-candidate-panel.behavior.test.tsx`

- [ ] **Step 1: Write the failing link-behavior test**

Add this test inside the existing `GoalCandidatePanel` describe block:

```tsx
it("links goal and plan names to encoded management-page highlights without changing scheduling", () => {
  const onSchedule = vi.fn()
  const plan = candidate({
    id: "plan/中文",
    kind: "plan",
    name: "跨页计划",
    plan_id: "plan/中文",
    goal_id: "goal/中文",
    goal_name: "跨页目标",
  })
  const action = candidate({
    id: "action-1",
    kind: "action",
    name: "保持原样的行动项",
    plan_id: "plan/中文",
    goal_id: "goal/中文",
    goal_name: "跨页目标",
  })

  render(
    <GoalCandidatePanel candidates={[action, plan]} error={null} focus={null} loading={false} onSchedule={onSchedule} />,
  )

  expect(screen.getByRole("link", { name: "跨页目标" }).getAttribute("href"))
    .toBe("/goals?highlight=goal%2F%E4%B8%AD%E6%96%87")
  expect(screen.getAllByRole("link", { name: "跨页计划" }).map(link => link.getAttribute("href")))
    .toEqual([
      "/plans?highlight=plan%2F%E4%B8%AD%E6%96%87",
      "/plans?highlight=plan%2F%E4%B8%AD%E6%96%87",
    ])
  expect(screen.queryByRole("link", { name: "保持原样的行动项" })).toBeNull()

  fireEvent.click(screen.getAllByRole("button", { name: "安排到今天" }).at(-1) as HTMLButtonElement)
  expect(onSchedule).toHaveBeenCalledWith(plan)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/components/today/goal-candidate-panel.behavior.test.tsx
```

Expected: FAIL because no elements with role `link` exist for the goal or plan names.

- [ ] **Step 3: Add encoded links with native link semantics**

Import `Link` and add a focused URL helper:

```tsx
import Link from "next/link"

function highlightHref(pathname: "/goals" | "/plans", id: string): string {
  return `${pathname}?${new URLSearchParams({ highlight: id }).toString()}`
}
```

In `CandidateCard`, keep action names as text and make only direct-plan names links:

```tsx
<p className="min-w-0 text-sm font-medium leading-5 text-stone-800">
  {isAction ? candidate.name : (
    <Link
      className="rounded-sm hover:text-violet-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      href={highlightHref("/plans", candidate.plan_id)}
    >
      {candidate.name}
    </Link>
  )}
</p>
```

Replace each plan-group heading body with a plan link:

```tsx
<h4 className="truncate text-xs font-semibold text-stone-600" id={headingId}>
  <Link
    className="rounded-sm hover:text-violet-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    href={highlightHref("/plans", group.planId)}
  >
    {planName}
  </Link>
</h4>
```

Replace each goal heading body with a goal link:

```tsx
<h3 id={`goal-group-${group.key}`} className="truncate text-sm font-semibold text-stone-800">
  <Link
    className="rounded-sm hover:text-violet-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    href={highlightHref("/goals", group.key)}
  >
    {group.name}
  </Link>
</h3>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/components/today/goal-candidate-panel.behavior.test.tsx
```

Expected: PASS, including existing drag and schedule-button behavior tests.

- [ ] **Step 5: Commit the navigation links**

```bash
git add src/components/today/goal-candidate-panel.tsx src/components/today/goal-candidate-panel.behavior.test.tsx
git commit -m "feat: link goal tree items to management pages"
```

### Task 2: Scroll the highlighted plan row into view

**Files:**
- Modify: `src/app/plans/page.tsx`
- Test: `src/app/plans/page.test.tsx`

- [ ] **Step 1: Make the plan-page search-parameter mock configurable**

Near `suspendSearchParams`, add a stable search-parameter value and return it from the existing mock:

```tsx
let currentSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => {
    if (suspendSearchParams) {
      throw new Promise<never>(() => undefined)
    }
    return currentSearchParams
  },
}))
```

Reset it in `beforeEach`:

```tsx
beforeEach(() => {
  suspendSearchParams = false
  currentSearchParams = new URLSearchParams()
})
```

Return the render handle from the existing page helper so the timer cleanup can be observed:

```tsx
async function renderLoadedPage() {
  const result = render(<PlansPage />)
  await waitFor(() => expect(screen.getByRole("heading", { name: "计划管理" })).toBeTruthy())
  await waitFor(() => expect(screen.queryByText("加载中...")).toBeNull())
  return result
}
```

- [ ] **Step 2: Write the failing plan-scroll test**

Add this test inside `describe("PlansPage", ...)`:

```tsx
it("scrolls the query-selected plan row into view and highlights it without editing", async () => {
  currentSearchParams = new URLSearchParams("highlight=plan_ddia")
  const scrollIntoView = vi.fn()
  const clearTimeoutSpy = vi.spyOn(window, "clearTimeout")
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  })
  setupFetch({ plans: [planFixture] })

  const page = await renderLoadedPage()

  const row = screen.getByText("读完 DDIA").closest("tr")
  expect(row?.className).toContain("bg-yellow-100")
  await waitFor(() => {
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" })
  })
  expect(screen.getByRole("button", { name: "编辑" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "新增" })).toBeTruthy()
  page.unmount()
  expect(clearTimeoutSpy).toHaveBeenCalled()
})
```

Delete the temporary prototype property in `afterEach` when present:

```tsx
delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npm test -- src/app/plans/page.test.tsx
```

Expected: FAIL because the highlighted row never calls `scrollIntoView`.

- [ ] **Step 4: Add a plan-row ref and scroll effect**

Extend `DraggableTableRow` with an optional row ref and attach it to `TableRow`:

```tsx
function DraggableTableRow({
  plan,
  highlightPlanId,
  rowRef,
  children,
}: {
  plan: Plan;
  highlightPlanId: string | null;
  rowRef?: React.Ref<HTMLTableRowElement>;
  children: React.ReactNode;
}) {
```

Then add the ref to the existing opening `TableRow` tag:

```tsx
<TableRow
  ref={rowRef}
  className={`
    ${highlightPlanId === plan.plan_id ? 'bg-yellow-100 dark:bg-yellow-900/20 animate-pulse' : ''}
    ${isDragging ? 'opacity-50' : ''}
  `}
>
```

Create the row ref beside the existing request ref:

```tsx
const highlightedPlanRowRef = useRef<HTMLTableRowElement>(null)
```

Split highlight timing out of the mixed URL-parameter effect so its timer has cleanup:

```tsx
useEffect(() => {
  const highlightId = searchParams.get('highlight')
  setHighlightPlanId(highlightId)
  if (!highlightId) return

  const timeoutId = window.setTimeout(() => setHighlightPlanId(null), 5000)
  return () => window.clearTimeout(timeoutId)
}, [searchParams])
```

Remove the old `highlight` block from the tag/goal URL effect, then add the scroll effect:

```tsx
useEffect(() => {
  if (!highlightPlanId || !plans.some(plan => plan.plan_id === highlightPlanId)) return
  highlightedPlanRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
}, [highlightPlanId, plans])
```

Pass the ref only to the highlighted row:

```tsx
<DraggableTableRow
  key={plan.plan_id}
  plan={plan}
  highlightPlanId={highlightPlanId}
  rowRef={highlightPlanId === plan.plan_id ? highlightedPlanRowRef : undefined}
>
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- src/app/plans/page.test.tsx
```

Expected: PASS with the highlighted row scrolled to the center and the form still in create mode.

- [ ] **Step 6: Commit plan-row positioning**

```bash
git add src/app/plans/page.tsx src/app/plans/page.test.tsx
git commit -m "feat: scroll highlighted plan into view"
```

### Task 3: Locate, highlight, and scroll a goal row

**Files:**
- Modify: `src/app/goals/page.tsx`
- Test: `src/app/goals/page.test.tsx`

- [ ] **Step 1: Add configurable goal-page search parameters to the test harness**

Add this mock before importing `GoalsPage`:

```tsx
let currentSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
}))
```

Reset the value in `beforeEach`, and remove any test scroll implementation in `afterEach`:

```tsx
beforeEach(() => {
  orderEditorState.unavailable = false
  currentSearchParams = new URLSearchParams()
})

afterEach(() => {
  cleanup()
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
```

- [ ] **Step 2: Make the goal fetch fixture return ordered full and paginated lists**

Replace `setupFetch` with this compatible form; existing callers that pass only `total` keep their current behavior:

```tsx
type GoalFixture = {
  id: number
  goal_id: string
  tag: string
  name: string
  description: string
}

function setupFetch(total = 0, orderedGoals: GoalFixture[] = []) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith("/api/tag")) return jsonResponse([])
    if (url.startsWith("/api/goal")) {
      const params = new URLSearchParams(url.split("?")[1] ?? "")
      if (params.get("all") === "true") {
        return jsonResponse({ list: orderedGoals, total: orderedGoals.length })
      }
      if (orderedGoals.length > 0) {
        const pageNum = Number(params.get("pageNum") ?? "1")
        const pageSize = Number(params.get("pageSize") ?? "10")
        const start = (pageNum - 1) * pageSize
        return jsonResponse({ list: orderedGoals.slice(start, start + pageSize), total: orderedGoals.length })
      }
      return jsonResponse({ list: [], total })
    }
    throw new Error(`unexpected fetch: ${init?.method ?? "GET"} ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}
```

- [ ] **Step 3: Write failing goal-positioning tests**

Add these tests to a new `describe("GoalsPage highlighted row", ...)` block:

```tsx
it("loads the highlighted goal's page, scrolls its row, and does not enter edit mode", async () => {
  currentSearchParams = new URLSearchParams("highlight=goal-11")
  const scrollIntoView = vi.fn()
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  })
  const goals = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    goal_id: `goal-${index + 1}`,
    tag: "长期",
    name: `目标 ${index + 1}`,
    description: "",
  }))
  const fetchMock = setupFetch(goals.length, goals)

  render(<GoalsPage />)

  const row = (await screen.findByText("目标 11")).closest("tr")
  expect(row?.className).toContain("bg-yellow-100")
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" }))
  expect(ordinaryGoalReadUrls(fetchMock).some(url => url.includes("pageNum=2"))).toBe(true)
  expect((screen.getByLabelText("名称") as HTMLInputElement).value).toBe("")
  expect(screen.getByRole("button", { name: "新增" })).toBeTruthy()
})

it("falls back to the first page when the highlighted goal no longer exists", async () => {
  currentSearchParams = new URLSearchParams("highlight=missing-goal")
  const goals = [{ id: 1, goal_id: "goal-1", tag: "长期", name: "目标 1", description: "" }]
  const fetchMock = setupFetch(goals.length, goals)

  render(<GoalsPage />)

  await screen.findByText("目标 1")
  await waitFor(() => expect(ordinaryGoalReadUrls(fetchMock).some(url => url.includes("pageNum=1"))).toBe(true))
  expect(screen.queryByText("missing-goal")).toBeNull()
})
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
npm test -- src/app/goals/page.test.tsx
```

Expected: FAIL because the page neither reads `highlight` nor loads the target page.

- [ ] **Step 5: Add a Suspense-safe highlighted-goal controller**

Extend imports, rename the current page body from `GoalsPage` to `GoalsPageContent`, and add a Suspense wrapper:

```tsx
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function GoalsPage() {
  return (
    <Suspense fallback={<div role="status" className="p-6 text-sm text-muted-foreground">正在加载目标…</div>}>
      <GoalsPageContent />
    </Suspense>
  )
}

function GoalsPageContent() {
```

Insert the query and ref declarations at the start of `GoalsPageContent`, then place the active-highlight state beside the other state declarations:

```tsx
  const searchParams = useSearchParams()
  const highlightedGoalId = searchParams.get("highlight")
  const highlightedGoalRowRef = useRef<HTMLTableRowElement>(null)

  const [goals, setGoals] = useState<Goal[]>([])
  const [activeHighlightGoalId, setActiveHighlightGoalId] = useState<string | null>(highlightedGoalId)
```

Add the lookup/timer effect after the ordinary `fetchGoals` effect:

```tsx
useEffect(() => {
  let cancelled = false
  setActiveHighlightGoalId(highlightedGoalId)

  if (!highlightedGoalId) return

  const timeoutId = window.setTimeout(() => setActiveHighlightGoalId(null), 5000)
  void fetch('/api/goal?all=true')
    .then(response => response.json())
    .then((data: { list?: Goal[] }) => {
      if (cancelled) return
      const targetIndex = (data.list ?? []).findIndex(goal => goal.goal_id === highlightedGoalId)
      setPageNum(targetIndex >= 0 ? Math.floor(targetIndex / pageSize) + 1 : 1)
    })
    .catch(() => {
      if (!cancelled) setPageNum(1)
    })

  return () => {
    cancelled = true
    window.clearTimeout(timeoutId)
  }
}, [highlightedGoalId, pageSize])
```

Add the scroll effect:

```tsx
useEffect(() => {
  if (!activeHighlightGoalId || !goals.some(goal => goal.goal_id === activeHighlightGoalId)) return
  highlightedGoalRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
}, [activeHighlightGoalId, goals])
```

Attach the ref and highlight classes to the matching goal row:

```tsx
<TableRow
  ref={activeHighlightGoalId === goal.goal_id ? highlightedGoalRowRef : undefined}
  className={activeHighlightGoalId === goal.goal_id
    ? "bg-yellow-100 animate-pulse dark:bg-yellow-900/20"
    : undefined}
>
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- src/app/goals/page.test.tsx
```

Expected: PASS; the eleventh ordered goal loads from page two, scrolls, remains outside edit mode, and a missing goal safely leaves page one visible.

- [ ] **Step 7: Commit goal-row positioning**

```bash
git add src/app/goals/page.tsx src/app/goals/page.test.tsx
git commit -m "feat: locate highlighted goal row"
```

### Task 4: Verify the integrated feature

**Files:**
- Verify: `src/components/today/goal-candidate-panel.tsx`
- Verify: `src/app/plans/page.tsx`
- Verify: `src/app/goals/page.tsx`

- [ ] **Step 1: Run all directly related tests together**

Run:

```bash
npm test -- src/components/today/goal-candidate-panel.behavior.test.tsx src/app/plans/page.test.tsx src/app/goals/page.test.tsx
```

Expected: PASS with no failed tests or unhandled errors.

- [ ] **Step 2: Run the complete test suite**

Run:

```bash
npm test
```

Expected: all test files and tests PASS.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: Next.js production build completes successfully with no TypeScript or prerender failures.

- [ ] **Step 4: Inspect the final diff and commit history**

Run:

```bash
git status --short
git diff --check
git log --oneline -4
```

Expected: no whitespace errors, only the planned files changed, and the feature commits are present.
