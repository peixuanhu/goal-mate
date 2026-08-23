# Goal Mate Today Workspace Delivery Roadmap

> **Required subskill:** Use `subagent-driven-development` or `executing-plans` to implement this roadmap. Execute the four linked phase plans in order; do not start a later phase until the preceding checkpoint is green.

**Goal:** Turn Goal Mate's home page into a desktop-first Today workspace that connects goals, executable tasks, manual scheduling, completion records, and a dual-mode AI workspace without losing the existing AI chat experience.

**Architecture:** Extend the existing Next.js/Prisma application in four dependency-ordered phases. Phase 1 establishes the data model and read-only workspace, Phase 2 adds deterministic manual scheduling and completion, Phase 3 adds manually invoked AI inspection plus per-suggestion apply/undo while preserving chat, and Phase 4 exposes management settings and completes navigation, responsive behavior, and accessibility.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, PostgreSQL, Vitest, existing OpenAI integration and application design tokens.

---

## Source of truth

The approved product design is:

- `/Users/peixuan/blog_content/_drafts/AI brainstorming/2026-08-23-goal-mate-today-workspace-design.md`

That document defines the product decisions. The four phase plans below define the implementation sequence and verification commands. If a plan appears to conflict with the approved design, pause and resolve the discrepancy before writing implementation code.

## Delivery sequence

| Phase | Plan | Depends on | Exit condition |
| --- | --- | --- | --- |
| 1 | [Today foundation](./2026-08-23-goal-mate-today-foundation.md) | Existing application baseline | New persistence model, ActionItem and preference APIs, aggregate Today read API, and read-only three-column home are green |
| 2 | [Manual scheduling](./2026-08-23-goal-mate-manual-scheduling.md) | Phase 1 | Time-zone-correct scheduling, overlap enforcement, drag/resize interactions, and transactional completion are green |
| 3 | [AI workspace](./2026-08-23-goal-mate-ai-workspace.md) | Phase 2 | Manual AI check, preserved stateful chat, strict suggestion contracts, fingerprint validation, per-item apply, and bounded undo are green |
| 4 | [Management and responsive finish](./2026-08-23-goal-mate-management-responsive.md) | Phase 3 | Shared navigation, planning-field management, responsive panels, accessibility, and full integration QA are green |

## Approved-decision coverage

| Approved product decision | Implementation owner |
| --- | --- |
| Today workspace replaces the current home | Phase 1, Task 6 |
| Goals, quadrant candidates, and inbox live together on the left | Phase 1, Tasks 5–6; Phase 4 retires the old rendered rail |
| Use an app-native day schedule, not an external calendar | Phase 2 end to end; external calendar sync remains explicitly out of scope |
| Both directly scheduled Plans and optional one-level ActionItems work | Phase 1 data/query contracts and Phase 2 schedule validation |
| Drag, edit, complete, partial, skip, and reschedule form a full manual loop | Phase 2, Tasks 2–5 |
| AI runs only after a user click or chat request | Phase 3, Tasks 2 and 4–5 |
| Every AI check suggestion applies independently and can become stale | Phase 3, Tasks 2–4 |
| Existing AI chat remains available and preserves its state across mode switches | Phase 1 shell and Phase 3, Task 4 |
| AI check and AI chat reuse the same trusted mutation services | Phase 3, Tasks 3 and 5 |
| Desktop is primary, with narrow-screen view/record and keyboard equivalents | Phase 4, Tasks 4–5 |

## Non-negotiable product invariants

Carry these invariants through every phase and encode each one in automated tests at the phase where it first becomes enforceable:

1. A `Plan` may be scheduled directly or may own `ActionItem` children.
2. A non-recurring `Plan` remains directly schedulable after it gains `ActionItem` children, while open ActionItems are displayed and recommended ahead of the parent Plan.
3. Recurring Plans cannot own ActionItems in the first release.
4. Every schedule block targets exactly one of `Plan` or `ActionItem`.
5. Schedule blocks may not overlap in the user's planning time zone.
6. Completing a schedule block writes or updates its linked progress record in the same transaction.
7. AI inspection runs only after an explicit user action; it does not poll, schedule itself, or mutate data in the background.
8. Every AI suggestion is independently applicable and validates a fresh context fingerprint before mutation.
9. The existing AI chat remains available beside AI inspection, and switching modes preserves both modes' local state.
10. The first desktop release may use desktop-first interactions, but the final phase must leave all core operations keyboard-accessible and usable on narrow screens.
11. New create APIs use stable idempotency keys; update, completion, apply, and undo APIs use entity versions or fingerprints so network retries cannot duplicate work.

## Cross-phase data ownership

| Concern | Authoritative layer | First introduced |
| --- | --- | --- |
| Goal and Plan hierarchy | Existing Prisma models and goal services | Existing app |
| Executable child tasks | `ActionItem` model and ActionItem service | Phase 1 |
| User planning defaults, including buffer | Singleton `PlanningPreference` row and preference service | Phase 1 |
| Scheduled time | `ScheduleBlock` model and scheduling service | Phase 1 model, Phase 2 mutations |
| Completion evidence | Existing `ProgressRecord`, extended with schedule outcome and block link | Phase 1 model, Phase 2 transactions |
| Today projection | Aggregate Today service and `/api/today` | Phase 1 |
| Deterministic coaching context | Today projection plus rules engine | Phase 3 |
| AI mutation safety | Discriminated suggestion union, fingerprint, apply service, undo token | Phase 3 |

## Phase checkpoints

### Checkpoint 1: stable foundation

Before beginning Phase 2, confirm:

```bash
npx prisma validate
npm test -- src/lib/today/schema-contract.test.ts src/lib/today/validation.test.ts src/lib/today/planning-preference.test.ts src/app/api/action-item/route.test.ts src/lib/today/query.test.ts src/app/api/planning-preference/route.test.ts src/app/api/today/route.test.ts src/components/today/today-workspace-regression.test.ts
npm test
npm run build
```

The home page must render real persisted data through the aggregate Today read path. Scheduling interactions and AI inspection remain deliberately disabled or absent.

### Checkpoint 2: deterministic daily loop

Before beginning Phase 3, confirm:

```bash
npm test -- src/lib/today/timezone.test.ts src/lib/today/schedule-validation.test.ts src/lib/today/schedule-service.test.ts src/app/api/schedule-block/route.test.ts src/lib/today/completion-service.test.ts src/app/api/schedule-block/complete/route.test.ts src/lib/recurring-utils.test.ts src/components/today/manual-scheduling-regression.test.ts
npm test
npm run build
```

A user must be able to place work on the timeline, move or resize it, reject overlaps, complete it, and observe the matching progress state without using AI.

### Checkpoint 3: bounded AI assistance

Before beginning Phase 4, confirm:

```bash
npm test -- src/lib/today/rule-engine.test.ts src/lib/today/context-fingerprint.test.ts src/lib/today/suggestion-validation.test.ts src/lib/today/ai-check-client.test.ts src/lib/today/action-item-service.test.ts src/lib/today/undo-token.test.ts src/lib/today/suggestion-service.test.ts src/app/api/today/check/route.test.ts src/app/api/today/suggestion/apply/route.test.ts src/app/api/today/suggestion/undo/route.test.ts src/components/today/ai-workspace-regression.test.ts src/lib/today/copilot-schedule-actions.test.ts
npm test
npm run build
```

The AI workspace must open in either inspection or chat mode, preserve mode state while switching, and require explicit per-suggestion application. Stale suggestions must fail without mutation.

### Checkpoint 4: release candidate

Complete the full integration and accessibility matrix from Phase 4, then run:

```bash
npx prisma validate
npm test
npm run build
```

Inspect `git status --short` and `git diff --check`. Do not claim completion if generated files, unexpected schema drift, failing tests, TypeScript errors, or unrelated edits remain.

## Commit strategy

Each phase plan specifies task-level commits. Keep phase boundaries visible in history and do not combine phases into a single implementation commit. At the end of each checkpoint, add a checkpoint commit only if verification itself required code or documentation changes; otherwise retain the task-level commits.

Recommended phase-level review points:

1. Review schema and Today projection before scheduling mutations begin.
2. Review schedule invariants and completion transactions before connecting AI.
3. Review suggestion safety and chat-state preservation before management UI work.
4. Review the complete desktop and narrow-screen flow before integration.

## Definition of done

This roadmap is complete only when all four phase exit conditions are met and the following end-to-end scenario succeeds against a fresh migrated database:

1. Create a goal and a non-recurring Plan.
2. Add ActionItems to that Plan; verify the open ActionItems are emphasized while both an ActionItem and the parent Plan remain directly schedulable.
3. Schedule an ActionItem from an unscheduled candidate view onto today's timeline.
4. Move and resize the block; verify an overlapping move is rejected.
5. Complete the block and verify linked progress and goal feedback update.
6. Open AI inspection manually, review deterministic and model-assisted findings, and apply one suggestion.
7. Verify a second stale suggestion is rejected after the context changes, then refresh and apply it successfully.
8. Undo an eligible applied suggestion within the supported window.
9. Switch to AI chat, converse about the current plan, switch back to inspection, and verify both modes retained their state.
10. Repeat the core schedule, complete, inspect, apply, and chat operations using only the keyboard and at a narrow viewport.
