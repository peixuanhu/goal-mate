# Goal Mate Unified Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Goal Mate around the approved calm-productivity visual language while preserving Today scheduling, the left candidate panel, management CRUD, and the AI Check/AI Chat switch.

**Architecture:** Introduce one route-aware application header and small page-frame primitives, then reuse the existing `AiWorkspace` in both Today and management layouts. Scope CopilotKit overrides behind a CSS module so chat styling no longer leaks across the app, and limit Today changes to presentation around existing candidate/timeline behavior.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, CSS Modules, CopilotKit, Vitest, Testing Library.

---

### Task 1: Stabilize the Scheduling Test Baseline

**Files:**
- Modify: `src/components/today/manual-scheduling.behavior.test.tsx`
- Test: `src/components/today/manual-scheduling.behavior.test.tsx`

- [ ] **Step 1: Preserve the observed RED evidence**

Run `npm test -- src/components/today/manual-scheduling.behavior.test.tsx`.

Expected: three orchestration tests fail because `scheduledBlock()` is dated `2026-08-23` while `TodayWorkspace` requests the current `2026-08-24` view.

- [ ] **Step 2: Freeze the orchestration block on its fixture date**

Import `beforeEach` and add this inside `describe("TodayWorkspace manual scheduling orchestration", ...)`:

```tsx
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-08-23T02:00:00.000Z"))
})
```

- [ ] **Step 3: Verify and commit**

```bash
npm test -- src/components/today/manual-scheduling.behavior.test.tsx
npm test
git add src/components/today/manual-scheduling.behavior.test.tsx
git commit -m "test: freeze manual scheduling fixture date"
```

Expected: 18 targeted tests and the complete baseline pass.

### Task 2: Add Shared Visual Foundations

**Files:**
- Create: `src/components/app-header.tsx`
- Create: `src/components/app-page.tsx`
- Create: `src/components/unified-interface-regression.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing shell tests**

Render `AppHeader` with a mocked pathname and `PageHeader` with an action slot, then assert:

```tsx
expect(screen.getByRole("navigation", { name: "主导航" })).toBeTruthy()
expect(screen.getByRole("link", { name: "计划" }).getAttribute("aria-current")).toBe("page")
expect(screen.getByRole("heading", { name: "全部计划" })).toBeTruthy()
expect(screen.getByRole("button", { name: "新建计划" })).toBeTruthy()
```

- [ ] **Step 2: Verify RED**

Run `npm test -- src/components/unified-interface-regression.test.tsx`.

Expected: FAIL because the shared components do not exist.

- [ ] **Step 3: Implement the foundations**

`AppHeader` owns the Goal Mate mark, 今天/目标/计划/进展/回顾 links, `aria-current`, and optional `UserMenu`. `AppPage` owns the warm neutral canvas and maximum content width. `PageHeader` renders the approved eyebrow/title/description/action hierarchy:

```tsx
<section className="flex flex-col gap-4 border-b border-stone-200/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
  <div>
    {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{eyebrow}</p> : null}
    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">{title}</h1>
    {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">{description}</p> : null}
  </div>
  {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
</section>
```

Update root tokens to a warm-stone canvas, white cards, subtle borders, and restrained violet primary/ring. Remove unscoped CopilotKit overrides from `globals.css`, retaining the package stylesheet import.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/components/unified-interface-regression.test.tsx
npx tsc --noEmit
git add src/components/app-header.tsx src/components/app-page.tsx src/components/unified-interface-regression.test.tsx src/app/globals.css
git commit -m "feat: add shared calm productivity shell"
```

Expected: targeted tests and TypeScript pass.

### Task 3: Unify AI Check and AI Chat

**Files:**
- Create: `src/components/chat-wrapper.module.css`
- Modify: `src/components/chat-wrapper.tsx`
- Modify: `src/components/today/ai-workspace.tsx`
- Modify: `src/components/main-layout.tsx`
- Modify: `src/components/unified-interface-regression.test.tsx`

- [ ] **Step 1: Write failing AI shell tests**

Assert that `MainLayout` exposes the same modes as Today and that chat has a scoped root:

```tsx
expect(screen.getByRole("tab", { name: "AI 检查" })).toBeTruthy()
expect(screen.getByRole("tab", { name: "AI 聊天" })).toBeTruthy()
expect(screen.getByRole("button", { name: "打开 AI 助手" })).toBeTruthy()
expect(screen.getByTestId("goal-mate-chat")).toBeTruthy()
```

- [ ] **Step 2: Verify RED**

Run `npm test -- src/components/unified-interface-regression.test.tsx`.

Expected: FAIL because `MainLayout` still embeds the old gradient chat shell and `ChatWrapper` has no scoped root.

- [ ] **Step 3: Implement the unified AI surface**

Reuse `AiWorkspace` for desktop and mobile management layouts. Keep both tabs mounted so switching modes preserves chat state. Replace old blue gradients with white panels, stone borders, and violet accents.

Replace `ChatWrapper`'s inline global CSS and timer-based markdown patching with:

```tsx
return (
  <div className={styles.root} data-testid="goal-mate-chat">
    {!hasUserMessages ? <QuickPrompts onSelect={setPrompt} /> : null}
    <CopilotChat labels={labels} instructions={instructions} />
  </div>
)
```

Scope every CopilotKit selector under `.root :global(...)`. Assistant messages are text-led, user messages are compact violet bubbles, quick prompts are horizontal chips, and the composer is a calm white surface.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/components/unified-interface-regression.test.tsx src/components/today/ai-workspace.behavior.test.tsx
npx tsc --noEmit
git add src/components/chat-wrapper.tsx src/components/chat-wrapper.module.css src/components/today/ai-workspace.tsx src/components/main-layout.tsx src/components/unified-interface-regression.test.tsx
git commit -m "feat: unify AI workspace and chat styling"
```

Expected: tests pass and tab state preservation remains covered.

### Task 4: Restyle Today Without Changing the Left Panel Contract

**Files:**
- Modify: `src/components/today/today-workspace.tsx`
- Modify: `src/components/today/goal-candidate-panel.tsx`
- Modify: `src/components/today/day-timeline.tsx`
- Modify: `src/components/today/today-workspace-regression.test.tsx`

- [ ] **Step 1: Write failing structural preservation tests**

Assert the new shared shell together with the existing contract:

```tsx
expect(screen.getByRole("tab", { name: "目标树" })).toBeTruthy()
expect(screen.getByRole("tab", { name: "四象限" })).toBeTruthy()
expect(screen.getByRole("tab", { name: "收集箱" })).toBeTruthy()
expect(screen.getAllByRole("button", { name: "安排到今天" }).length).toBeGreaterThan(0)
expect(screen.getByLabelText("今日时间线")).toBeTruthy()
```

- [ ] **Step 2: Verify RED**

Run `npm test -- src/components/today/today-workspace-regression.test.tsx`.

Expected: FAIL on the new shared-shell marker while the preservation assertions pass.

- [ ] **Step 3: Apply presentation-only Today changes**

Use `AppHeader`, keep the desktop grid exactly `300px minmax(0,1fr) 340px`, and retain all candidate tabs, grouping, scroll containers, draggable payloads, buttons, callbacks, editor sheets, and completion sheets. Change only borders, radii, shadows, typography, neutral backgrounds, and violet focus/selection accents.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/components/today
npx tsc --noEmit
git add src/components/today/today-workspace.tsx src/components/today/goal-candidate-panel.tsx src/components/today/day-timeline.tsx src/components/today/today-workspace-regression.test.tsx
git commit -m "feat: align Today workspace visual language"
```

Expected: Today tests pass, including drag/drop, scheduling, tab switching, focus restoration, and AI state preservation.

### Task 5: Migrate Management Pages to the Shared Frame

**Files:**
- Modify: `src/app/goals/page.tsx`
- Modify: `src/app/plans/page.tsx`
- Modify: `src/app/progress/page.tsx`
- Modify: `src/app/reports/page.tsx`
- Modify: `src/components/unified-interface-regression.test.tsx`

- [ ] **Step 1: Write failing page-frame assertions**

Read each page source and assert:

```tsx
for (const source of pageSources) {
  expect(source).toContain("<AppPage")
  expect(source).toContain("<PageHeader")
  expect(source).not.toContain("返回首页")
}
```

- [ ] **Step 2: Verify RED**

Run `npm test -- src/components/unified-interface-regression.test.tsx`.

Expected: FAIL because the four pages still build their own header/card shells.

- [ ] **Step 3: Migrate each page without changing data behavior**

Wrap existing content in `AppPage`, replace each duplicate back-link/title region with `PageHeader`, and normalize toolbars/cards/empty states. Preserve fetch URLs, mutations, form fields, filter logic, chart calculations, event listeners, and all existing visible actions.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/app/goals src/app/plans src/app/progress src/app/reports src/components/unified-interface-regression.test.tsx
npx tsc --noEmit
git add src/app/goals/page.tsx src/app/plans/page.tsx src/app/progress/page.tsx src/app/reports/page.tsx src/components/unified-interface-regression.test.tsx
git commit -m "feat: unify management page presentation"
```

Expected: page tests and TypeScript pass with CRUD behavior unchanged.

### Task 6: Verification and Integration

**Files:**
- Modify only a file directly implicated by a concrete verification failure

- [ ] **Step 1: Run the complete automated gate**

```bash
npm test
npx tsc --noEmit
npx eslint .
npx prisma validate
npm run build
```

Expected: tests, TypeScript, Prisma validation, and production build pass; lint has no new errors.

- [ ] **Step 2: Inspect the change boundary**

```bash
git diff 32b710c...HEAD --stat
git diff 32b710c...HEAD -- src/components/quadrant-left-sidebar.tsx src/components/goals/goal-plan-list.tsx src/components/goals/goal-layout-regression.test.ts
```

Expected: no branch changes to the three user-owned files and no API/database changes.

- [ ] **Step 3: Perform browser acceptance where the existing session permits**

At desktop and mobile widths, verify shared navigation, Today's three columns, all left tabs, schedule buttons, AI switching, quick-prompt overflow, drawer close/focus behavior, and management page consistency. Do not submit credentials without action-time confirmation.

- [ ] **Step 4: Integrate and re-run the critical gate**

```bash
git -C /Users/peixuan/Project/goal-mate merge --ff-only codex/goal-mate-unified-interface
npm test
npx tsc --noEmit
npm run build
```

Expected: master advances without overwriting its three pre-existing uncommitted user files, and the integrated tree passes.
