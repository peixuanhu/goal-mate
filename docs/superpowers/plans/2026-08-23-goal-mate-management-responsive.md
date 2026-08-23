# Goal Mate Management and Responsive Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Today workspace by unifying navigation and management entry points, exposing plan/action planning fields, moving the legacy quadrant experience into Today, and delivering accessible desktop/mobile behavior.

**Architecture:** Share one AppNavigation between Today and legacy management pages, but keep management page data ownership unchanged. Add focused ActionItemManager and PlanningPreferenceEditor components rather than growing the already-large plans page further. The Today center remains primary on small screens while candidate and AI panels become accessible overlays with keyboard-equivalent scheduling controls.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, Vitest, Tailwind CSS, existing local UI components and lucide-react.

---

## Prerequisites

Complete and verify the foundation, manual-scheduling, and dual-mode AI plans. Before implementation, reconcile any user-owned edits to `quadrant-left-sidebar.tsx`, `goal-plan-list.tsx`, and their regression test; do not overwrite or delete those changes.

## File structure

- Create `src/components/app-navigation.tsx`: shared Today/Goals/Plans/Progress/Review navigation and user menu.
- Create `src/components/app-navigation.test.ts`: source/render navigation contract.
- Modify `src/components/main-layout.tsx`: remove rendered legacy quadrant rail, use AppNavigation, preserve management-page chat.
- Modify `src/components/today/today-workspace.tsx`: use AppNavigation and panel controls.
- Modify `src/app/goals/page.tsx`, `plans/page.tsx`, `progress/page.tsx`, `reports/page.tsx`: remove redundant Return Home buttons.
- Modify `src/app/api/plan/route.ts` and `.test.ts`: validate/save due date, estimate, and energy; include action count.
- Modify `src/app/plans/page.tsx`: edit planning fields and open ActionItemManager.
- Create `src/components/plans/action-item-manager.tsx` and `.test.ts`: focused ActionItem UI.
- Create `src/components/today/planning-preference-editor.tsx` and `.test.ts`: settings form.
- Create `src/components/today/responsive-panel.tsx` and `.test.ts`: accessible candidate/AI overlay.
- Modify `src/components/today/goal-candidate-panel.tsx`, `day-timeline.tsx`, `ai-workspace.tsx`: responsive/accessibility polish.
- Modify `src/components/goals/goal-plan-list.tsx`: display action counts and route to Plan management without embedding another editor.
- Modify `src/components/goals/goal-layout-regression.test.ts`: integration regression expectations.
- Keep `src/components/quadrant-left-sidebar.tsx`, `mobile-quadrant-wrapper.tsx`, and `task-pool.tsx` in the repository but stop rendering them; removal is a later cleanup after user-owned changes are reconciled.

---

### Task 1: Unify global navigation and retire the rendered quadrant rail

**Files:**
- Create: `src/components/app-navigation.test.ts`
- Create: `src/components/app-navigation.tsx`
- Modify: `src/components/main-layout.tsx`
- Modify: `src/components/today/today-workspace.tsx`
- Modify: `src/app/goals/page.tsx`
- Modify: `src/app/plans/page.tsx`
- Modify: `src/app/progress/page.tsx`
- Modify: `src/app/reports/page.tsx`

- [ ] **Step 1: Write the failing navigation contract**

```ts
expect(navSource).toContain('{ href: "/", label: "今日" }')
expect(navSource).toContain('{ href: "/goals", label: "目标" }')
expect(navSource).toContain('{ href: "/plans", label: "计划" }')
expect(navSource).toContain('{ href: "/progress", label: "进展" }')
expect(navSource).toContain('{ href: "/reports", label: "回顾" }')
expect(navSource).toContain("<UserMenu />")
expect(mainLayoutSource).toContain("<AppNavigation />")
expect(mainLayoutSource).not.toContain("<QuadrantLeftSidebar")
expect(todaySource).toContain("<AppNavigation />")
for (const page of managementPages) expect(page).not.toContain("返回首页")
```

- [ ] **Step 2: Prove the contract is red**

Run `npm test -- src/components/app-navigation.test.ts`.

Expected: FAIL because AppNavigation is absent and MainLayout renders the quadrant rail.

- [ ] **Step 3: Implement AppNavigation**

Create a client component using `usePathname` and Next Link. Use a semantic `<nav aria-label="主导航">`, `aria-current="page"` on the active link, the Goal Mate wordmark, a `＋ 快速添加` link/button that routes to `/plans?create=true`, and UserMenu. On narrow screens, allow horizontal scrolling rather than hiding destinations.

- [ ] **Step 4: Integrate navigation without duplicating chat**

MainLayout becomes a two-region shell: main column with AppNavigation + children, and the existing collapsible ChatWrapper panel. Remove QuadrantLeftSidebar imports/state/buttons and mobile chat remains unchanged. TodayWorkspace uses AppNavigation but owns its own AiWorkspace; it must not be nested in MainLayout.

- [ ] **Step 5: Remove redundant page buttons**

Delete only the `返回首页` wrappers/imports from goals/plans/progress/reports. Keep route forms, tables, filters, and data behavior unchanged.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/components/app-navigation.test.ts src/components/goals/goal-layout-regression.test.ts
npm test
npx tsc --noEmit
git add src/components/app-navigation* src/components/main-layout.tsx src/components/today/today-workspace.tsx src/app/goals/page.tsx src/app/plans/page.tsx src/app/progress/page.tsx src/app/reports/page.tsx
git commit -m "feat: unify goal mate navigation"
```

---

### Task 2: Expose Plan planning fields and ActionItem management

**Files:**
- Modify: `src/app/api/plan/route.test.ts`
- Modify: `src/app/api/plan/route.ts`
- Create: `src/components/plans/action-item-manager.test.ts`
- Create: `src/components/plans/action-item-manager.tsx`
- Modify: `src/app/plans/page.tsx`
- Modify: `src/components/goals/goal-plan-list.tsx`
- Modify: `src/components/goals/goal-layout-regression.test.ts`

- [ ] **Step 1: Extend failing Plan route tests**

```ts
it("normalizes planning fields on create", async () => {
  prismaMock.plan.create.mockResolvedValue(basePlan)
  const response = await POST(request("http://localhost/api/plan", { method: "POST", body: JSON.stringify({ name: "发布 v1", due_date: "2026-09-01", estimated_minutes: 90, energy_level: "high", tags: [] }) }))
  expect(response.status).toBe(200)
  expect(prismaMock.plan.create).toHaveBeenCalledWith({ data: expect.objectContaining({ due_date: new Date("2026-09-01T00:00:00.000Z"), estimated_minutes: 90, energy_level: "high" }) })
})

it("rejects invalid planning fields before Prisma", async () => {
  const response = await POST(request("http://localhost/api/plan", { method: "POST", body: JSON.stringify({ name: "发布 v1", estimated_minutes: 0, tags: [] }) }))
  expect(response.status).toBe(400)
  expect(prismaMock.plan.create).not.toHaveBeenCalled()
})
```

Also assert GET includes `_count: { select: { actionItems: { where: { is_completed: false } } } }` and maps `open_action_count`.

Add a DELETE regression: when a Plan has a future `scheduled` block, return 409 and do not delete the Plan or cascade its ActionItems; deletion succeeds only after those active future blocks are cancelled or completed.

- [ ] **Step 2: Prove tests are red, then implement API changes**

Run focused tests; expect field normalization/count/delete-guard failures. Reuse `parsePlanningFields` in POST/PUT, remove raw versions of those keys before spreading sanitized data, and map validator errors to 400. Add open action count to GET without changing existing tags/goal/progress response fields. In DELETE, check active future blocks inside the transaction and return 409 before the existing cascade can erase scheduled work.

- [ ] **Step 3: Write failing ActionItemManager tests**

Render/source tests must prove it:

- fetches `/api/action-item?plan_id=` only when open;
- hides Add for recurring plans and explains why;
- creates with one stable `Idempotency-Key` per form intent and edits/completes/reopens/deletes through the route;
- shows 409 future-schedule deletion errors without removing the row;
- dispatches `goal-mate:data-changed` on success;
- supports action order display and planning fields.

- [ ] **Step 4: Implement the focused manager**

Create an independent component with props `{ planId, planName, isRecurring, open, onClose }`. Use an inline side panel/card, local loading/error/form state, and existing Button/Input/Select/WysiwygEditor. Generate an idempotency key when a blank create form opens, retain it across retry clicks, replace it only after success or a material form reset, and send it through the `Idempotency-Key` header. Do not add this state to the large plans page.

- [ ] **Step 5: Add Plan-page entry points**

Extend Plan/PlanForm types with `due_date`, `estimated_minutes`, `energy_level`, `open_action_count`. Add date, number, and energy controls to the existing Plan form. Add an `行动项 (N)` row action for non-recurring plans that opens ActionItemManager. Honor `/plans?create=true` by focusing/resetting the form.

- [ ] **Step 6: Show action count on goal routes**

GoalPlanList shows `N 个待办行动` beside Plan progress and routes its action button to `/plans?goal_id=<goal>&highlight=<plan>&actions=true`; it does not embed a second ActionItem editor.

- [ ] **Step 7: Verify and commit**

```bash
npm test -- src/app/api/plan/route.test.ts src/components/plans/action-item-manager.test.ts src/components/goals/goal-layout-regression.test.ts
npm test
npx tsc --noEmit
git add src/app/api/plan src/app/plans/page.tsx src/components/plans src/components/goals
git commit -m "feat: manage schedulable plan details"
```

---

### Task 3: Add planning preference settings

**Files:**
- Create: `src/components/today/planning-preference-editor.test.ts`
- Create: `src/components/today/planning-preference-editor.tsx`
- Modify: `src/components/today/today-workspace.tsx`

- [ ] **Step 1: Write failing settings tests**

```ts
expect(source).toContain('fetch("/api/planning-preference"')
expect(source).toContain('method: "PUT"')
expect(source).toContain("高精力时段（可选）")
expect(source).toContain("任务间缓冲")
expect(source).toContain("默认时间块")
expect(source).toContain("每日容量提醒")
expect(source).toContain("必须同时填写高精力开始和结束时间")
```

Add pure tests for minute-to-HH:mm and HH:mm-to-minute helpers, including 00:00, 08:30, and 24:00 end bound.

- [ ] **Step 2: Prove tests are red**

Run `npm test -- src/components/today/planning-preference-editor.test.ts`.

Expected: FAIL because component/helpers are absent.

- [ ] **Step 3: Implement editor**

Use controlled timezone text/select, day start/end time inputs, optional high-energy start/end, non-negative buffer minutes, and positive default-block/capacity number inputs. Seed an unsaved setting with `Intl.DateTimeFormat().resolvedOptions().timeZone` in the browser when appropriate; save only after client validation, show API errors inline, and dispatch data-changed after success. Clearing either high-energy field clears both only after explicit confirmation in the form UI; do not invent best-hour defaults.

- [ ] **Step 4: Integrate settings access**

Add a gear button in Today header opening the editor. On successful save, refetch Today so timeline bounds and checks update. The editor is not placed in AI Check or Chat.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/components/today/planning-preference-editor.test.ts
npm test
npx tsc --noEmit
git add src/components/today/planning-preference-editor* src/components/today/today-workspace.tsx
git commit -m "feat: add daily planning settings"
```

---

### Task 4: Deliver mobile overlays and keyboard-equivalent scheduling

**Files:**
- Create: `src/components/today/responsive-panel.test.ts`
- Create: `src/components/today/responsive-panel.tsx`
- Modify: `src/components/today/today-workspace.tsx`
- Modify: `src/components/today/goal-candidate-panel.tsx`
- Modify: `src/components/today/day-timeline.tsx`
- Modify: `src/components/today/ai-workspace.tsx`
- Modify: `src/components/today/schedule-block-editor.tsx`
- Modify: `src/components/today/schedule-completion-sheet.tsx`

- [ ] **Step 1: Write failing accessibility/responsive tests**

Assert:

```ts
expect(panelSource).toContain('role="dialog"')
expect(panelSource).toContain('aria-modal="true"')
expect(panelSource).toContain("previouslyFocusedElement")
expect(workspaceSource).toContain("打开候选任务")
expect(workspaceSource).toContain("打开 AI 工作区")
expect(workspaceSource.match(/<AiWorkspace/g)).toHaveLength(1)
expect(workspaceSource.match(/<GoalCandidatePanel/g)).toHaveLength(1)
expect(candidateSource).toContain("安排到今天")
expect(timelineSource).toContain("向前移动 15 分钟")
expect(timelineSource).toContain("向后移动 15 分钟")
expect(timelineSource).toContain("增加 15 分钟")
expect(timelineSource).toContain("减少 15 分钟")
```

- [ ] **Step 2: Prove tests are red**

Run `npm test -- src/components/today/responsive-panel.test.ts`.

Expected: FAIL because responsive panel and controls are absent.

- [ ] **Step 3: Implement ResponsivePanel**

Props: `{ open, side: "left" | "right" | "bottom", title, onClose, children }`. When opened, capture `document.activeElement`, focus the close button, trap Tab within dialog, close on Escape/backdrop, lock body scroll, and restore focus on close. Use fixed Tailwind layout, `role="dialog"`, `aria-modal`, and labelled title. Do not add a new dependency.

- [ ] **Step 4: Make the center primary below lg**

TodayWorkspace renders only DayTimeline in normal mobile flow plus fixed/toolbar buttons for candidate and AI overlays. Desktop remains three columns. Keep exactly one mounted GoalCandidatePanel and one mounted AiWorkspace, changing their wrapper from static desktop columns to mobile overlays instead of rendering desktop/mobile copies; this preserves chat and inspection state across resize. Completion uses bottom ResponsivePanel; candidate and AI use left/right panels.

- [ ] **Step 5: Add non-drag equivalents**

Candidate `安排到今天` opens the same ScheduleBlockEditor path as drag. Each scheduled block menu exposes four 15-minute move/resize buttons that call the same versioned update function. Give time blocks accessible names containing title and local time; use goal name/text in addition to color.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/components/today/responsive-panel.test.ts src/components/today/manual-scheduling-regression.test.ts src/components/today/ai-workspace-regression.test.ts
npm test
npx tsc --noEmit
git add src/components/today
git commit -m "feat: make today workspace responsive"
```

---

### Task 5: Integration regression and visual cleanup

**Files:**
- Modify: `src/components/goals/goal-layout-regression.test.ts`
- Modify: `src/app/globals.css` only for shared Today/Copilot responsive fixes that cannot live in components.
- Modify: focused Today components only when verification identifies a concrete issue.

- [ ] **Step 1: Add regression expectations**

Assert the old QuadrantLeftSidebar is no longer imported/rendered by MainLayout or page.tsx; four quadrant labels remain in GoalCandidatePanel; management routes retain MainLayout and ChatWrapper; Today owns exactly one AiWorkspace; and legacy quadrant source files still exist untouched.

- [ ] **Step 2: Run the regression test before fixes**

Run `npm test -- src/components/goals/goal-layout-regression.test.ts`.

Expected: PASS if prior tasks were integrated correctly; if it fails, fix the exact ownership violation and rerun.

- [ ] **Step 3: Run complete automation**

```bash
npx prisma validate
npm test
npx tsc --noEmit
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Desktop visual QA**

At 1440×900 and 1280×800 verify: top nav stays single-line/scrollable; 300px candidate, flexible timeline, and 340px AI columns do not overlap; timeline remains usable when either side collapses; Chat scroll/input remain intact; dialogs are above time blocks and do not clip.

- [ ] **Step 5: Mobile visual QA**

At 390×844 verify: timeline is first content; candidate/AI panels open and close; focus returns to opener; completion bottom panel does not hide its submit button behind the viewport; no horizontal page scroll; chat input remains reachable with the keyboard open.

- [ ] **Step 6: End-to-end product acceptance**

Run both paths:

```text
existing Plan → arrange → check → apply one suggestion → complete → ProgressRecord → weekly review
new ActionItem → arrange → partial → reschedule remainder → complete → parent ProgressRecord
```

Confirm AI is never called by tab/date changes, chat survives mode switches, and all writes require the designed confirmation.

- [ ] **Step 7: Commit verified integration**

If Step 2–6 required code/CSS fixes, rerun Step 3 and commit only those changes:

```bash
git add src/components src/app/globals.css
git commit -m "fix: polish today workspace integration"
```

If no fixes were required, create no empty commit.
