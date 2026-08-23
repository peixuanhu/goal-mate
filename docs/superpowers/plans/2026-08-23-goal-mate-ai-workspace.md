# Goal Mate Dual-Mode AI Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic daily checks, on-demand structured AI suggestions, individually validated apply/undo, and schedule-aware Copilot chat while preserving the existing chat session.

**Architecture:** Rule checks are pure and always available. AI generation is read-only and produces a discriminated suggestion union plus a context fingerprint; apply/undo routes re-read current data and delegate to normal schedule/action services. AiWorkspace keeps Check and Chat mounted as separate state owners sharing only selected-date context and data-change events.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, Vitest, OpenAI-compatible SDK, CopilotKit, jsonwebtoken, Tailwind CSS.

---

## Prerequisites

Complete and verify both foundation and manual-scheduling plans. This plan assumes ScheduleBlock versioning, TodayView blocks, schedule services, completion transactions, and the dual-tab shell exist.

## File structure

- Modify `src/lib/today/types.ts`: rule checks and suggestion discriminated union.
- Create `src/lib/today/rule-engine.ts` and `.test.ts`: deterministic checks.
- Modify `src/lib/today/query.ts` and `.test.ts`: expose rule checks in TodayView.
- Create `src/lib/today/context-fingerprint.ts` and `.test.ts`: stable SHA-256 context identity.
- Create `src/lib/today/suggestion-validation.ts` and `.test.ts`: strict AI output allowlist.
- Create `src/lib/today/ai-check-client.ts` and `.test.ts`: prompt/model adapter with injected client.
- Create `src/app/api/today/check/route.ts` and `.test.ts`: on-demand read-only generation.
- Create `src/lib/today/undo-token.ts` and `.test.ts`: signed, expiring inverse-operation token.
- Create `src/lib/today/suggestion-service.ts` and `.test.ts`: versioned apply/undo through normal services.
- Refactor/Create `src/lib/today/action-item-service.ts` and tests: reusable create action behavior.
- Create `src/app/api/today/suggestion/apply/route.ts` and `.test.ts`.
- Create `src/app/api/today/suggestion/undo/route.ts` and `.test.ts`.
- Create `src/components/today/daily-check-panel.tsx`: checks, suggestions, apply/ignore/undo.
- Modify `src/components/today/ai-workspace.tsx`: keep independent Check/Chat state mounted.
- Modify `src/components/today/today-workspace.tsx`: selected-date and context-version propagation.
- Create `src/components/today/ai-workspace-regression.test.ts`: UI state contract.
- Modify `src/app/api/copilotkit/route.ts`: add schedule query/mutation actions that call shared services and update confirmation prompt.
- Create `src/lib/today/copilot-schedule-actions.test.ts`: source/domain regression tests for chat actions.

---

### Task 1: Add the deterministic rule engine

**Files:**
- Modify: `src/lib/today/types.ts`
- Create: `src/lib/today/rule-engine.test.ts`
- Create: `src/lib/today/rule-engine.ts`
- Modify: `src/lib/today/query.test.ts`
- Modify: `src/lib/today/query.ts`

- [ ] **Step 1: Write failing rule tests**

```ts
import { describe, expect, it } from "vitest"
import { evaluateTodayRules } from "./rule-engine"

describe("today rule engine", () => {
  it("reports capacity and due candidates without AI", () => {
    const checks = evaluateTodayRules({
      date: "2026-08-23",
      preference: { ...preference, capacity_warning_minutes: 180 },
      focus: { goal_id: "goal_launch", name: "发布 Goal Mate", tag: "product", color: "#5965d8" },
      candidates: [{ ...candidate, due_date: "2026-08-23" }],
      blocks: [{ ...block, goal_id: "goal_other", start_at: "2026-08-23T01:00:00Z", end_at: "2026-08-23T05:00:00Z" }],
      checks: [],
    })
    expect(checks.map(item => item.code)).toEqual(expect.arrayContaining(["capacity_exceeded", "due_unscheduled", "focus_time_insufficient"]))
  })

  it("does not invent energy advice without configured best hours", () => {
    const checks = evaluateTodayRules({ ...emptyView, preference: { ...preference, high_energy_start_minutes: null, high_energy_end_minutes: null }, blocks: [{ ...block, energy_level: "high" }] })
    expect(checks.some(item => item.code === "high_energy_misaligned")).toBe(false)
  })

  it("warns when adjacent work violates the configured buffer", () => {
    const checks = evaluateTodayRules({ ...emptyView, blocks: [blockAt("09:00", "10:00"), blockAt("10:05", "11:00")] })
    expect(checks).toContainEqual(expect.objectContaining({ code: "buffer_too_short", severity: "warning" }))
  })

  it("returns positive evidence as well as problems", () => {
    const checks = evaluateTodayRules({ ...healthyView, blocks: [focusBlockAt("09:00", "10:00")] })
    expect(checks).toContainEqual(expect.objectContaining({ code: "focus_time_protected", severity: "info" }))
    expect(checks).toContainEqual(expect.objectContaining({ code: "capacity_balanced", severity: "info" }))
  })
})
```

- [ ] **Step 2: Prove tests are red**

Run `npm test -- src/lib/today/rule-engine.test.ts`.

Expected: FAIL because the module/type is missing.

- [ ] **Step 3: Add check types and pure evaluator**

```ts
export type RuleCheckCode =
  | "capacity_exceeded"
  | "due_unscheduled"
  | "focus_time_insufficient"
  | "high_energy_misaligned"
  | "buffer_too_short"
  | "overlap_detected"
  | "focus_time_protected"
  | "capacity_balanced"
  | "energy_aligned"
export type RuleCheck = {
  code: RuleCheckCode
  severity: "info" | "warning" | "error"
  title: string
  detail: string
  related_ids: string[]
}
```

Implement `evaluateTodayRules(view)` without network/database calls. Use blocking-status durations for capacity and focus allocation; warn when the current-focus goal has less than one configured default block while open candidates for it remain. De-duplicate due warnings by Plan and prefer a due ActionItem over its directly schedulable parent. Use configured high-energy bounds only when both exist, and `preference.buffer_minutes` for the buffer rule (`0` disables it). Emit evidence-backed positive info checks for protected focus time, balanced non-empty capacity, and energy alignment; never claim a positive when the relevant setting/data is absent. Sort errors before warnings before info, then by code and related ID for deterministic output.

- [ ] **Step 4: Populate TodayView checks**

After query normalization, call `evaluateTodayRules({ ...view, checks: [] })` and return the resulting checks. Extend query tests to prove checks exist when the model service is unavailable; `/api/today` must never call an LLM.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/lib/today/rule-engine.test.ts src/lib/today/query.test.ts src/app/api/today/route.test.ts
git add src/lib/today/types.ts src/lib/today/rule-engine.ts src/lib/today/rule-engine.test.ts src/lib/today/query.ts src/lib/today/query.test.ts
git commit -m "feat: add deterministic daily checks"
```

---

### Task 2: Define and generate safe AI suggestions

**Files:**
- Create: `src/lib/today/context-fingerprint.test.ts`
- Create: `src/lib/today/context-fingerprint.ts`
- Create: `src/lib/today/suggestion-validation.test.ts`
- Create: `src/lib/today/suggestion-validation.ts`
- Create: `src/lib/today/ai-check-client.test.ts`
- Create: `src/lib/today/ai-check-client.ts`
- Create: `src/app/api/today/check/route.test.ts`
- Create: `src/app/api/today/check/route.ts`

- [ ] **Step 1: Write failing fingerprint and validation tests**

```ts
it("is stable across array/object ordering but changes with entity versions", () => {
  expect(createTodayContextFingerprint(contextA)).toBe(createTodayContextFingerprint(contextAReordered))
  expect(createTodayContextFingerprint(contextA)).not.toBe(createTodayContextFingerprint({ ...contextA, blocks: [{ ...contextA.blocks[0], version: 2 }] }))
})

it("accepts only the five suggestion variants", () => {
  expect(parseSuggestion({ suggestion_id: "s1", type: "move_block", title: "提前", reason: "临近截止", risk: "减少缓冲", before: { start_at: "a", end_at: "b" }, after: { start_at: "c", end_at: "d" }, params: { block_id: "block_1", expected_version: 1, start_at: "2026-08-23T01:00:00Z", end_at: "2026-08-23T02:00:00Z" } }).type).toBe("move_block")
  expect(() => parseSuggestion({ type: "delete_goal", params: { goal_id: "goal_1" } })).toThrow("unsupported suggestion type")
})
```

- [ ] **Step 2: Add the discriminated union**

Define `ScheduleSuggestion` with common `suggestion_id`, `title`, `reason`, `risk`, `before`, `after`, then these variants:

```ts
type CreateBlockSuggestion = { type: "create_block"; params: { plan_id: string; action_id: string | null; start_at: string; end_at: string } }
type MoveBlockSuggestion = { type: "move_block"; params: { block_id: string; expected_version: number; start_at: string; end_at: string } }
type ResizeBlockSuggestion = { type: "resize_block"; params: { block_id: string; expected_version: number; end_at: string } }
type UnscheduleBlockSuggestion = { type: "unschedule_block"; params: { block_id: string; expected_version: number } }
type CreateActionSuggestion = { type: "create_action_item"; params: { plan_id: string; name: string; estimated_minutes: number | null; energy_level: EnergyLevel | null } }
```

- [ ] **Step 3: Implement fingerprint and strict parser**

Fingerprint a recursively key-sorted JSON projection containing selected date, `preference.version`, `focus.version`, candidate IDs/versions, block IDs/versions, and checks. Use `createHash("sha256")`.

`parseSuggestionBatch` must reject unknown keys/types, invalid ISO timestamps, non-positive versions/durations, duplicate suggestion IDs, more than 8 suggestions, and any mutation outside the five variants.

- [ ] **Step 4: Write failing AI adapter tests**

Inject a fake completion client. Test that the prompt contains only read context, requests JSON, and a valid JSON response parses. Test malformed JSON and unsupported suggestions return a typed `AI_OUTPUT_INVALID` error; no database API is available to this module.

- [ ] **Step 5: Implement the OpenAI-compatible adapter**

At call time create or accept an injected client. Use:

```ts
await client.chat.completions.create({
  model: process.env.OPENAI_MODEL || "qwen3.6-plus",
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: DAILY_CHECK_SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(context) },
  ],
  temperature: 0.2,
})
```

The system prompt must state the five types, require reasons/tradeoffs, forbid writes, forbid best-hour assumptions when preference is null, and cap output at 8 suggestions.

- [ ] **Step 6: Add the on-demand check route**

POST accepts `{ date, expected_context_fingerprint }`, loads TodayView, recomputes fingerprint, returns 409 when stale, then calls the AI adapter. Return `{ context_fingerprint, generated_at, suggestions }`. Map missing env/model failures to 503 and invalid AI output to 502; deterministic `checks` remain available through `/api/today`.

- [ ] **Step 7: Verify and commit**

```bash
npm test -- src/lib/today/context-fingerprint.test.ts src/lib/today/suggestion-validation.test.ts src/lib/today/ai-check-client.test.ts src/app/api/today/check/route.test.ts
git add src/lib/today/context-fingerprint* src/lib/today/suggestion-validation* src/lib/today/ai-check-client* src/app/api/today/check
git commit -m "feat: generate structured daily suggestions"
```

---

### Task 3: Apply and undo one suggestion through trusted services

**Files:**
- Create: `src/lib/today/action-item-service.test.ts`
- Create: `src/lib/today/action-item-service.ts`
- Modify: `src/app/api/action-item/route.ts`
- Create: `src/lib/today/undo-token.test.ts`
- Create: `src/lib/today/undo-token.ts`
- Create: `src/lib/today/suggestion-service.test.ts`
- Create: `src/lib/today/suggestion-service.ts`
- Create: `src/app/api/today/suggestion/apply/route.test.ts`
- Create: `src/app/api/today/suggestion/apply/route.ts`
- Create: `src/app/api/today/suggestion/undo/route.test.ts`
- Create: `src/app/api/today/suggestion/undo/route.ts`

- [ ] **Step 1: Extract ActionItem creation behind a service**

Write a failing service test matching the existing route behavior, then move recurring-plan validation, next-position calculation, ID generation, and creation into:

```ts
export async function createActionItem(db: ActionItemDb, input: ActionItemCreateInput): Promise<ActionItem>
```

`ActionItemCreateInput` includes the validated idempotency key. Preserve the Phase 1 behavior: derive the business ID from that key, return an identical prior create, and reject a changed-payload collision. Keep route responses unchanged, pass the `Idempotency-Key` header into the service, and rerun all ActionItem route tests before committing `refactor: extract action item service`.

- [ ] **Step 2: Write failing signed-token tests**

```ts
it("round-trips a version-bound inverse operation", () => {
  const token = signUndoToken({ kind: "restore_block", block_id: "block_1", expected_version: 2, previous: { start_at: "2026-08-23T01:00:00Z", end_at: "2026-08-23T02:00:00Z", status: "scheduled" } }, "secret")
  expect(verifyUndoToken(token, "secret")).toMatchObject({ kind: "restore_block", expected_version: 2 })
})

it("rejects tampering and expiry", () => {
  expect(() => verifyUndoToken(tampered, "secret")).toThrow("undo token invalid or expired")
})
```

Use jsonwebtoken HS256, audience `goal-mate-today`, issuer `goal-mate`, and 10-minute expiry. Never log tokens.

- [ ] **Step 3: Write failing suggestion-service tests**

Cover each type delegates to create/update/cancel schedule or createActionItem; stale context returns conflict before mutation; apply returns a signed inverse token; undo checks the post-apply entity version before restoring; create-action undo refuses deletion when the action gained a block or was edited.

- [ ] **Step 4: Implement apply and undo**

The service accepts parsed ScheduleSuggestion plus expected context fingerprint. Run apply and undo in a Prisma `Serializable` transaction: reload Today context inside it, compare the fingerprint, capture the pre-change snapshot, then call the transaction-aware shared business services with source `ai_check`. Map Prisma serialization conflicts to 409 so the client refreshes instead of silently retrying a stale suggestion. Do not pass arbitrary AI objects to Prisma; use an exhaustive switch with a `never` default. Derive create idempotency keys from the context fingerprint plus suggestion ID so an apply retry cannot duplicate a block or ActionItem. Sign only the minimal inverse operation after the mutation is known.

- [ ] **Step 5: Add apply/undo routes**

Apply POST body: `{ date, context_fingerprint, suggestion }`. Undo POST body: `{ undo_token }`. Map validation 400, missing 404, stale/conflict 409, token invalid/expired 410. Both return the changed entity plus a fresh context fingerprint; only apply returns undo_token.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/lib/today/action-item-service.test.ts src/app/api/action-item/route.test.ts src/lib/today/undo-token.test.ts src/lib/today/suggestion-service.test.ts src/app/api/today/suggestion/apply/route.test.ts src/app/api/today/suggestion/undo/route.test.ts
npm test
git add src/lib/today src/app/api/action-item/route.ts src/app/api/today/suggestion
git commit -m "feat: apply and undo daily suggestions"
```

---

### Task 4: Build the dual-mode AI client UI

**Files:**
- Create: `src/components/today/ai-workspace-regression.test.ts`
- Create: `src/components/today/daily-check-panel.tsx`
- Modify: `src/components/today/ai-workspace.tsx`
- Modify: `src/components/today/today-workspace.tsx`

- [ ] **Step 1: Write the failing UI state contract**

```ts
expect(aiSource).toContain("<DailyCheckPanel")
expect(aiSource).toContain("<ChatWrapper />")
expect(aiSource).not.toContain('activeTab === "chat" &&')
expect(checkSource).toContain("帮我检查今天")
expect(checkSource).toContain("应用")
expect(checkSource).toContain("忽略")
expect(checkSource).toContain("撤销")
expect(checkSource).toContain("context_fingerprint")
expect(checkSource).toContain("建议已失效，请重新检查")
```

- [ ] **Step 2: Prove the contract is red**

Run `npm test -- src/components/today/ai-workspace-regression.test.ts`.

Expected: FAIL because DailyCheckPanel is missing.

- [ ] **Step 3: Implement DailyCheckPanel state**

Keep a `Map<date, DailyCheckSession>` in AiWorkspace state. A session contains fingerprint, suggestions, ignored IDs, loading/error, and the latest undo token. Switching tabs/dates never triggers AI; only the button POSTs `/api/today/check`.

Render deterministic checks before the button, grouped into `做得好的` info evidence and `可以改进` warnings/errors. Suggestion cards show type badge, title, reason, risk, before/after, Apply, Ignore, and `在对话中讨论`. Applying one suggestion POSTs it individually, refreshes Today data, stores undo token, and marks remaining old-fingerprint suggestions stale.

- [ ] **Step 4: Keep both modes mounted and bridge them**

AiWorkspace renders DailyCheckPanel and ChatWrapper simultaneously, hiding the inactive panel with CSS. `在对话中讨论` switches to chat and calls the existing `window.__copilotSend` with a concise quoted suggestion; `查看今日检查` switches back without model invocation.

- [ ] **Step 5: Handle stale/data-change events**

TodayWorkspace passes `contextFingerprint`. Listen for `goal-mate:data-changed`; if the fingerprint changes, label cached suggestions stale and disable Apply. Keep ignored suggestions hidden only for the current cached session.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/components/today/ai-workspace-regression.test.ts
npm test
npx tsc --noEmit
git add src/components/today
git commit -m "feat: add dual-mode ai workspace"
```

---

### Task 5: Add schedule-aware Copilot chat tools

**Files:**
- Create: `src/lib/today/copilot-schedule-actions.test.ts`
- Modify: `src/app/api/copilotkit/route.ts`

- [ ] **Step 1: Write failing source/domain tests**

Assert the route registers `queryTodaySchedule`, `createScheduleBlock`, `moveScheduleBlock`, and `createActionItem`; mutation handlers import/call shared services; the system prompt lists each mutation under confirmation-required operations; and no handler calls `prisma.scheduleBlock.create/update` directly.

- [ ] **Step 2: Prove the test is red**

Run `npm test -- src/lib/today/copilot-schedule-actions.test.ts`.

Expected: FAIL because actions are absent.

- [ ] **Step 3: Add read and mutation actions**

- `queryTodaySchedule(date)` calls loadTodayView and returns summarized focus/candidates/blocks/checks.
- `createScheduleBlock(plan_id, action_id?, start_at, end_at)` calls createScheduleBlock with source `ai_chat` and a stable idempotency key derived from the confirmed tool-call payload/invocation identity.
- `moveScheduleBlock(block_id, expected_version, start_at, end_at)` calls updateScheduleBlock.
- `createActionItem(plan_id, name, estimated_minutes?, energy_level?)` calls the extracted service with the same stable tool-call idempotency strategy.

Return structured success/error objects; do not leak stack traces or secrets.

- [ ] **Step 4: Extend the confirmation prompt**

Add all three mutation tools to the existing confirmation-required list. Explicitly state that prior confirmation is invalid after any user-supplied field changes. QueryTodaySchedule remains confirmation-free.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/lib/today/copilot-schedule-actions.test.ts
npm test
npx tsc --noEmit
git add src/app/api/copilotkit/route.ts src/lib/today/copilot-schedule-actions.test.ts
git commit -m "feat: add schedule tools to ai chat"
```

---

### Task 6: AI workspace verification checkpoint

**Files:** No planned code changes.

- [ ] **Step 1: Run full automation**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: all exit 0.

- [ ] **Step 2: Verify AI-off behavior**

Remove/disable OPENAI_API_KEY in a local test environment. Confirm Today loads, deterministic checks render, manual scheduling works, Chat shows its existing error boundary, and `帮我检查今天` reports a scoped retryable error.

- [ ] **Step 3: Verify check behavior with the model**

1. Click Check once; confirm no invocation occurred before the click.
2. Confirm every result is one of five types and has reason/risk/before/after.
3. Apply one suggestion; confirm only that mutation occurs and an Undo action appears.
4. Change the schedule elsewhere; confirm remaining suggestions become stale.
5. Undo while version matches; then mutate again and confirm stale undo cannot overwrite.

- [ ] **Step 4: Verify chat preservation and confirmation**

Send a chat message, switch tabs twice, and confirm history remains. Ask chat to create/move a block; confirm it describes the exact write and waits for explicit confirmation before the tool call.

- [ ] **Step 5: Commit only required verification fixes**

If fixes were needed, rerun Step 1 and commit only those files as `fix: stabilize dual-mode ai workspace`; otherwise create no commit.
