# Goal Mate Manual Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only Today workspace into a complete manual scheduling loop: create/move/resize/cancel blocks, prevent conflicts, and finish blocks into consistent progress records.

**Architecture:** Put timezone conversion, overlap rules, optimistic concurrency, and completion transactions in pure/domain services under `src/lib/today`. App Router handlers remain thin, the aggregate Today query exposes normalized blocks, and focused UI components mutate through those APIs then invalidate Today data.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma/PostgreSQL, Vitest, `@dnd-kit/core`, Tailwind CSS.

---

## Prerequisite

Complete and verify `2026-08-23-goal-mate-today-foundation.md`. Its migration, types, APIs, TodayWorkspace, and read-only panels are required.

## File structure

- Modify `src/lib/today/types.ts`: add ScheduleBlockView and mutation inputs.
- Create `src/lib/today/timezone.ts` and `.test.ts`: date/minute ↔ UTC conversion using an IANA timezone.
- Create `src/lib/today/schedule-validation.ts` and `.test.ts`: same-day, interval, overlap, and allowed-status rules.
- Create `src/lib/today/schedule-service.ts` and `.test.ts`: create/update/cancel with version checks.
- Create `src/app/api/schedule-block/route.ts` and `.test.ts`: GET/POST/PUT transport.
- Modify `src/lib/today/query.ts` and `.test.ts`: include selected-day blocks and exclude already-scheduled Action candidates.
- Create `src/lib/today/completion-service.ts` and `.test.ts`: transactional complete/partial/skip behavior.
- Create `src/app/api/schedule-block/complete/route.ts` and `.test.ts`: completion transport.
- Modify `src/lib/recurring-utils.ts`: ignore records whose `counts_toward_recurrence` is false.
- Create `src/lib/recurring-utils.test.ts`: regression coverage for partial recurring progress.
- Modify `src/components/today/goal-candidate-panel.tsx`: draggable and keyboard-schedulable candidate cards.
- Modify `src/components/today/day-timeline.tsx`: positioned blocks, drop target, move/resize/edit controls.
- Create `src/components/today/schedule-block-editor.tsx`: validated create/edit popover/dialog.
- Create `src/components/today/schedule-completion-sheet.tsx`: result and optional progress details.
- Modify `src/components/today/today-workspace.tsx`: mutation orchestration and data invalidation.
- Create `src/components/today/manual-scheduling-regression.test.ts`: UI contract tests.

---

### Task 1: Make timezone and interval behavior deterministic

**Files:**
- Modify: `src/lib/today/types.ts`
- Create: `src/lib/today/timezone.test.ts`
- Create: `src/lib/today/timezone.ts`
- Create: `src/lib/today/schedule-validation.test.ts`
- Create: `src/lib/today/schedule-validation.ts`

- [ ] **Step 1: Write failing timezone tests**

```ts
import { describe, expect, it } from "vitest"
import { formatUtcInTimeZone, getUtcDayRange, zonedMinuteToUtc } from "./timezone"

describe("today timezone conversion", () => {
  it("converts Shanghai wall-clock minutes to UTC", () => {
    expect(zonedMinuteToUtc("2026-08-23", 9 * 60, "Asia/Shanghai").toISOString()).toBe("2026-08-23T01:00:00.000Z")
  })

  it("returns an exclusive UTC day range", () => {
    expect(getUtcDayRange("2026-08-23", "Asia/Shanghai")).toEqual({
      start: new Date("2026-08-22T16:00:00.000Z"),
      endExclusive: new Date("2026-08-23T16:00:00.000Z"),
    })
  })

  it("formats UTC back to the selected local date and minute", () => {
    expect(formatUtcInTimeZone(new Date("2026-08-23T01:30:00.000Z"), "Asia/Shanghai")).toEqual({ date: "2026-08-23", minutes: 570 })
  })

  it("rejects nonexistent and ambiguous DST wall times", () => {
    expect(() => zonedMinuteToUtc("2026-03-08", 150, "America/New_York")).toThrow("本地时间不存在")
    expect(() => zonedMinuteToUtc("2026-11-01", 90, "America/New_York")).toThrow("本地时间不明确")
  })
})
```

- [ ] **Step 2: Write failing schedule validation tests**

```ts
import { describe, expect, it } from "vitest"
import { assertSchedulableInterval, findOverlappingBlocks } from "./schedule-validation"

describe("schedule validation", () => {
  it("allows touching intervals but rejects overlap", () => {
    const blocks = [{ block_id: "a", start_at: new Date("2026-08-23T01:00:00Z"), end_at: new Date("2026-08-23T02:00:00Z"), status: "scheduled" as const }]
    expect(findOverlappingBlocks(new Date("2026-08-23T02:00:00Z"), new Date("2026-08-23T03:00:00Z"), blocks)).toEqual([])
    expect(findOverlappingBlocks(new Date("2026-08-23T01:30:00Z"), new Date("2026-08-23T02:30:00Z"), blocks).map(item => item.block_id)).toEqual(["a"])
  })

  it("rejects cross-local-day and reversed intervals", () => {
    expect(() => assertSchedulableInterval({ start_at: new Date("2026-08-23T15:30:00Z"), end_at: new Date("2026-08-23T16:30:00Z"), timezone: "Asia/Shanghai" })).toThrow("时间块不能跨本地日期")
    expect(() => assertSchedulableInterval({ start_at: new Date("2026-08-23T02:00:00Z"), end_at: new Date("2026-08-23T01:00:00Z"), timezone: "Asia/Shanghai" })).toThrow("end_at must be later than start_at")
  })

  it("allows an end exactly at the next local midnight", () => {
    expect(() => assertSchedulableInterval({ start_at: new Date("2026-08-23T15:00:00Z"), end_at: new Date("2026-08-23T16:00:00Z"), timezone: "Asia/Shanghai" })).not.toThrow()
  })
})
```

- [ ] **Step 3: Prove both suites are red**

Run `npm test -- src/lib/today/timezone.test.ts src/lib/today/schedule-validation.test.ts`.

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement types and timezone conversion**

Add:

```ts
export type ScheduleBlockView = {
  block_id: string
  plan_id: string
  action_id: string | null
  title: string
  goal_id: string | null
  goal_name: string | null
  energy_level: EnergyLevel | null
  start_at: string
  end_at: string
  status: ScheduleBlockStatus
  source: ScheduleBlockSource
  result_note: string | null
  version: number
}
```

Implement `zonedMinuteToUtc` with `Intl.DateTimeFormat(...).formatToParts`. Validate the IANA zone, derive plausible UTC candidates, round-trip them to the requested date/minute, and require exactly one match; zero matches is a nonexistent spring-forward time and multiple matches is an ambiguous fall-back time. Cache formatter instances by timezone. `formatUtcInTimeZone` returns a date key and minutes. `getUtcDayRange` converts minute 0 for the date and next date via existing `addDays`.

- [ ] **Step 5: Implement interval validation**

Export `BLOCKING_STATUSES = new Set(["scheduled", "completed", "partial"])`, half-open overlap `(start < otherEnd && end > otherStart)`, `assertSchedulableInterval`, and `findOverlappingBlocks`. Allow an `ignoredBlockId` for edits.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/lib/today/timezone.test.ts src/lib/today/schedule-validation.test.ts
npx tsc --noEmit
git add src/lib/today
git commit -m "feat: add schedule time validation"
```

---

### Task 2: Implement versioned ScheduleBlock mutations

**Files:**
- Create: `src/lib/today/schedule-service.test.ts`
- Create: `src/lib/today/schedule-service.ts`
- Create: `src/app/api/schedule-block/route.test.ts`
- Create: `src/app/api/schedule-block/route.ts`

- [ ] **Step 1: Write failing service tests**

Use a narrow mocked database and cover:

```ts
it("creates a block for an action that belongs to the plan", async () => {
  db.plan.findUnique.mockResolvedValue({ plan_id: "plan_launch" })
  db.actionItem.findUnique.mockResolvedValue({ action_id: "action_copy", plan_id: "plan_launch", is_completed: false })
  db.scheduleBlock.findMany.mockResolvedValue([])
  db.scheduleBlock.create.mockResolvedValue({ block_id: "block_1", version: 1 })
  await createScheduleBlock(db, validCreate)
  expect(db.scheduleBlock.create).toHaveBeenCalledWith({ data: expect.objectContaining({ plan_id: "plan_launch", action_id: "action_copy", status: "scheduled", source: "manual" }) })
})

it("returns conflict details instead of overwriting", async () => {
  db.scheduleBlock.findMany.mockResolvedValue([{ block_id: "busy", start_at: new Date("2026-08-23T01:00:00Z"), end_at: new Date("2026-08-23T02:00:00Z"), status: "scheduled" }])
  await expect(createScheduleBlock(db, validCreate)).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT", conflictIds: ["busy"] })
})

it("rejects stale edits through updateMany", async () => {
  db.scheduleBlock.updateMany.mockResolvedValue({ count: 0 })
  await expect(updateScheduleBlock(db, { block_id: "block_1", expected_version: 1, start_at: "2026-08-23T03:00:00Z", end_at: "2026-08-23T04:00:00Z" })).rejects.toMatchObject({ code: "STALE_VERSION" })
})
```

Also test missing/oversized idempotency key, an identical create retry returning the existing block, a key collision with different payload, concurrent mutations acquiring affected local-date advisory locks in sorted order, intervals outside configured day bounds, direct parent-Plan scheduling even when open ActionItems exist, mismatched action/plan, completed action, one-scheduled-block-per-action, invalid source/status, rejecting cancellation of a block that has already started, and a valid future cancel setting `status: cancelled` rather than deleting.

- [ ] **Step 2: Prove service tests are red**

Run `npm test -- src/lib/today/schedule-service.test.ts`.

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement the service**

Export `createScheduleBlock`, `updateScheduleBlock`, and `cancelScheduleBlock` against `PrismaClient | Prisma.TransactionClient`. Create requires a 1–128 character idempotency key and derives `block_<10 hex>` from its SHA-256 hash; an identical retry returns the existing block while a key collision with a different immutable create payload returns conflict. Parse ISO strings to Date, call `assertSchedulableInterval`, load PlanningPreference timezone, and validate Plan/Action ownership without forbidding direct parent-Plan scheduling.

Require create/update intervals to fall inside `day_start_minutes..day_end_minutes` after converting with the stored preference (allow an end exactly at minute 1440). When called with a PrismaClient, each mutation owns a transaction and takes a PostgreSQL advisory lock for every affected local date before querying overlaps or writing. An update that moves across dates locks both date keys in sorted order; cancel reads the block, locks its current date, then re-reads its version before mutation. When called with a TransactionClient, reuse the caller's transaction and acquire the same locks there. This makes overlap checks concurrency-safe. Use `updateMany({ where: { block_id, version: expected_version, status: "scheduled" }, data: { ..., version: { increment: 1 } } })` for optimistic concurrency. Inject `now` into cancel tests and reject cancellation once `start_at <= now`; past missed work must be completed, marked partial, or skipped instead.

Use domain errors with codes `VALIDATION`, `NOT_FOUND`, `SCHEDULE_CONFLICT`, `ACTION_ALREADY_SCHEDULED`, and `STALE_VERSION`.

- [ ] **Step 4: Write failing route tests**

Cover:

- `GET ?date=` loads the saved/default PlanningPreference timezone server-side and returns blocks in that exclusive UTC day range; it never trusts a caller-supplied timezone.
- POST requires `Idempotency-Key` and maps validation to 400, missing records to 404, conflicts/stale data to 409.
- PUT requires `block_id`, `expected_version`, and `operation: "update" | "cancel"`.
- All successes return a normalized ScheduleBlockView.

- [ ] **Step 5: Implement the thin route**

Route handlers parse JSON objects, delegate to the service, and use one `toScheduleErrorResponse` mapper. GET must include Plan goal and optional Action name so the client receives a ready-to-render title.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/lib/today/schedule-service.test.ts src/app/api/schedule-block/route.test.ts
npm test
git add src/lib/today/schedule-service.ts src/lib/today/schedule-service.test.ts src/app/api/schedule-block
git commit -m "feat: add schedule block api"
```

---

### Task 3: Return blocks from the Today aggregate

**Files:**
- Modify: `src/lib/today/types.ts`
- Modify: `src/lib/today/query.test.ts`
- Modify: `src/lib/today/query.ts`
- Modify: `src/app/api/today/route.test.ts`

- [ ] **Step 1: Extend the failing query tests**

Assert:

```ts
expect(view.blocks).toEqual([expect.objectContaining({ block_id: "block_copy", title: "写发布说明", version: 2 })])
expect(view.candidates.find(item => item.action_id === "action_copy")).toBeUndefined()
```

Use a block inside the requested timezone day and another outside it; only the first returns. A directly scheduled Plan may remain a candidate for another session, while an ActionItem with an active scheduled block is hidden.

- [ ] **Step 2: Prove the extended tests are red**

Run `npm test -- src/lib/today/query.test.ts`.

Expected: FAIL because `blocks` is still hard-coded empty and scheduled actions are not filtered.

- [ ] **Step 3: Extend loadTodayView**

Load preference first or in a two-stage query, derive `getUtcDayRange(dateKey, preference.timezone)`, then fetch blocks with `start_at < endExclusive` and `end_at > start`, including Plan goal and Action. Normalize dates to ISO strings and derive block `energy_level` from ActionItem override then Plan default. Remove only candidates whose ActionItem has an active `scheduled` block.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/lib/today/query.test.ts src/app/api/today/route.test.ts
git add src/lib/today/query.ts src/lib/today/query.test.ts src/lib/today/types.ts src/app/api/today/route.test.ts
git commit -m "feat: include schedule blocks in today view"
```

---

### Task 4: Make completion transactional and recurrence-safe

**Files:**
- Create: `src/lib/recurring-utils.test.ts`
- Modify: `src/lib/recurring-utils.ts`
- Create: `src/lib/today/completion-service.test.ts`
- Create: `src/lib/today/completion-service.ts`
- Create: `src/app/api/schedule-block/complete/route.test.ts`
- Create: `src/app/api/schedule-block/complete/route.ts`

- [ ] **Step 1: Write the recurring regression test**

```ts
it("does not count partial schedule progress toward recurrence", () => {
  const plan = { is_recurring: true, recurrence_type: "daily", recurrence_value: "1", progressRecords: [
    { gmt_create: new Date(), counts_toward_recurrence: false },
    { gmt_create: new Date(), counts_toward_recurrence: true },
  ] }
  expect(getCurrentPeriodCount(plan)).toBe(1)
})
```

- [ ] **Step 2: Prove the recurring test is red, then implement the filter**

Run `npm test -- src/lib/recurring-utils.test.ts` and expect 2 instead of 1. Add optional `counts_toward_recurrence?: boolean` to RecurringPlan records and filter `record.counts_toward_recurrence !== false` before date counting. Rerun and expect PASS.

- [ ] **Step 3: Write failing completion service tests**

Cover:

- completed Action block updates ScheduleBlock and ActionItem and creates exactly one ProgressRecord tied by schedule_block_id.
- partial creates a ProgressRecord with `counts_toward_recurrence: false` and leaves ActionItem open.
- skipped stores result_note and creates no ProgressRecord.
- recurring completed Plan block creates a counting record.
- optional ordinary `plan_progress` must be 0..1 and is applied in the same transaction.
- stale version or non-scheduled block returns 409 and performs no later writes.
- retrying the same completion cannot create a second ProgressRecord.

- [ ] **Step 4: Implement completion in one transaction**

Export:

```ts
export async function completeScheduleBlock(db: PrismaClient, input: {
  block_id: string
  expected_version: number
  outcome: "completed" | "partial" | "skipped"
  content?: string
  thinking?: string
  result_note?: string
  plan_progress?: number
}): Promise<ScheduleBlockView>
```

Inside `$transaction`, updateMany the scheduled block/version first; create ProgressRecord only for completed/partial; update ActionItem only for completed; update ordinary Plan progress only when explicit; then return the refreshed block. Map the unique schedule_block_id constraint to stale/already-completed conflict.

- [ ] **Step 5: Add route tests and handler**

The POST route validates the union outcome and delegates. Return 400 for invalid fields, 404 for missing block, and 409 for stale/already completed.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/lib/recurring-utils.test.ts src/lib/today/completion-service.test.ts src/app/api/schedule-block/complete/route.test.ts
npm test
git add src/lib/recurring-utils.ts src/lib/recurring-utils.test.ts src/lib/today/completion-service.ts src/lib/today/completion-service.test.ts src/app/api/schedule-block/complete
git commit -m "feat: complete scheduled work transactionally"
```

---

### Task 5: Add timeline scheduling interactions

**Files:**
- Create: `src/components/today/manual-scheduling-regression.test.ts`
- Modify: `src/components/today/goal-candidate-panel.tsx`
- Modify: `src/components/today/day-timeline.tsx`
- Create: `src/components/today/schedule-block-editor.tsx`
- Create: `src/components/today/schedule-completion-sheet.tsx`
- Modify: `src/components/today/today-workspace.tsx`

- [ ] **Step 1: Write the failing UI contract**

Assert source contains:

```ts
expect(candidateSource).toContain("useDraggable")
expect(candidateSource).toContain("安排到今天")
expect(timelineSource).toContain("useDroppable")
expect(timelineSource).toContain("当前时间")
expect(timelineSource).toContain("onEditBlock")
expect(editorSource).toContain("expected_version")
expect(completionSource).toContain('value="partial"')
expect(workspaceSource).toContain('method: "POST"')
expect(workspaceSource).toContain('method: "PUT"')
expect(workspaceSource).toContain("goal-mate:data-changed")
```

- [ ] **Step 2: Prove the UI test is red**

Run `npm test -- src/components/today/manual-scheduling-regression.test.ts`.

Expected: FAIL because interactions/components are absent.

- [ ] **Step 3: Implement candidate and timeline DnD**

Use one DndContext owned by TodayWorkspace. Candidate cards call `useDraggable({ id: candidate.id, data: { candidate } })`; timeline uses `useDroppable({ id: "today-timeline" })`. Convert drop Y to 15-minute increments inside configured day bounds, open ScheduleBlockEditor, create one `crypto.randomUUID()` idempotency key for that editor intent, and do not POST until the user confirms. Keep the key stable across retry clicks until the editor closes or its candidate/time payload changes. On the actual current date, render a labelled current-time rule positioned in the stored planning timezone and update it once per minute; do not render it for other dates.

Every candidate card also has a keyboard/button action `安排到今天` that opens the same editor with the next conflict-free start; keyboard scheduling is not a separate code path.

- [ ] **Step 4: Implement editor and completion sheet**

ScheduleBlockEditor owns local start/end, shows goal/plan labels, validates same-day/duration, and submits create or versioned update. ScheduleCompletionSheet exposes completed/partial/skipped, optional content/thinking/result note, and plan-progress slider only for ordinary Plan blocks.

- [ ] **Step 5: Implement mutations and scoped errors**

TodayWorkspace supplies `createBlock`, `updateBlock`, `cancelBlock`, and `completeBlock`. On success, refetch `/api/today`, dispatch `new CustomEvent("goal-mate:data-changed", { detail: { entity: "schedule-block" } })`, and close the editor. On 409, keep the editor open and show conflict/stale text; never silently retry a write.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/components/today/manual-scheduling-regression.test.ts
npm test
npx tsc --noEmit
git add src/components/today
git commit -m "feat: add manual day scheduling"
```

---

### Task 6: Manual scheduling verification checkpoint

**Files:** No planned code changes.

- [ ] **Step 1: Run complete automation**

```bash
npx prisma validate
npm test
npx tsc --noEmit
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Manual happy path**

1. Drag a Plan into an empty time and confirm it creates one block.
2. Drag an ActionItem, then confirm it disappears from candidates while scheduled.
3. Move and resize a scheduled block.
4. Try an overlapping time and confirm a 409-backed conflict message without overwrite.
5. Complete an ActionItem block and confirm ActionItem completion plus one parent ProgressRecord.
6. Partially complete a recurring Plan block and confirm the recurrence count does not increment.
7. Cancel a future block and confirm it returns to candidates/history without physical deletion.

- [ ] **Step 3: Manual concurrency path**

Open the same day in two tabs, edit one block in tab A, then submit the stale version in tab B. Confirm tab B receives the stale warning and no data is overwritten.

- [ ] **Step 4: Commit only required verification fixes**

If fixes were needed, rerun Step 1 and commit only those files as `fix: stabilize manual scheduling`; otherwise create no commit.
