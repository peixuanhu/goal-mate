// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SchedulableCandidate } from "@/lib/today/types"

import { GoalCandidatePanel } from "./goal-candidate-panel"

vi.mock("@/components/workspace/quadrant-board", () => ({
  QuadrantBoard: () => (
    <div>
      <section aria-label="重要且紧急" role="region" />
      <section aria-label="重要不紧急" role="region" />
      <section aria-label="紧急不重要" role="region" />
      <section aria-label="不重要不紧急" role="region" />
    </div>
  ),
}))

afterEach(cleanup)

function candidate(
  overrides: Partial<SchedulableCandidate> & Pick<SchedulableCandidate, "id" | "kind" | "name" | "plan_id">,
): SchedulableCandidate {
  const defaults: SchedulableCandidate = {
    id: overrides.id,
    kind: overrides.kind,
    name: overrides.name,
    plan_id: overrides.plan_id,
    action_id: overrides.kind === "action" ? overrides.id : null,
    goal_id: null,
    goal_name: null,
    due_date: null,
    estimated_minutes: 30,
    effective_default_block_minutes: 30,
    invested_minutes: 0,
    remaining_minutes: 30,
    reserved_action_minutes: 0,
    available_minutes: 30,
    suggested_block_minutes: 30,
    budget_status: "ok",
    can_schedule: true,
    schedule_reason: null,
    energy_level: null,
    effective_quadrant: null,
    is_recurring: false,
    version: "2026-08-23T00:00:00.000Z",
  }

  return { ...defaults, ...overrides }
}

describe("GoalCandidatePanel hierarchy", () => {
  it("shows ordinary-plan budget progress and the next suggested block", () => {
    render(
      <GoalCandidatePanel
        candidates={[candidate({
          id: "plan-budget",
          kind: "plan",
          name: "预算计划",
          plan_id: "plan-budget",
          goal_id: "goal-budget",
          goal_name: "预算目标",
          estimated_minutes: 300,
          invested_minutes: 60,
          remaining_minutes: 240,
          reserved_action_minutes: 90,
          available_minutes: 150,
          suggested_block_minutes: 60,
        })]}
        error={null}
        focus={null}
        loading={false}
        onSchedule={vi.fn()}
      />,
    )

    expect(screen.getByText("已投入 60 / 300 分钟")).toBeTruthy()
    expect(screen.getByText("剩余 240 分钟")).toBeTruthy()
    expect(screen.getByText("下次 60 分钟")).toBeTruthy()
  })

  it("shows only the per-occurrence duration for a recurring plan", () => {
    render(
      <GoalCandidatePanel
        candidates={[candidate({
          id: "plan-recurring",
          kind: "plan",
          name: "周期计划",
          plan_id: "plan-recurring",
          goal_id: "goal-recurring",
          goal_name: "周期目标",
          estimated_minutes: null,
          effective_default_block_minutes: 45,
          remaining_minutes: null,
          available_minutes: null,
          suggested_block_minutes: 45,
          is_recurring: true,
        })]}
        error={null}
        focus={null}
        loading={false}
        onSchedule={vi.fn()}
      />,
    )

    expect(screen.getByText("每次 45 分钟")).toBeTruthy()
    expect(screen.queryByText(/已投入/)).toBeNull()
    expect(screen.queryByText(/剩余/)).toBeNull()
    expect(document.body.textContent).not.toContain("null 分钟")
  })

  it("disables scheduling and dragging for an overrun candidate while keeping its group visible", () => {
    const onSchedule = vi.fn()
    render(
      <GoalCandidatePanel
        candidates={[candidate({
          id: "plan-overrun",
          kind: "plan",
          name: "超支计划",
          plan_id: "plan-overrun",
          goal_id: "goal-overrun",
          goal_name: "超支目标",
          estimated_minutes: 60,
          invested_minutes: 75,
          remaining_minutes: 0,
          available_minutes: 0,
          suggested_block_minutes: null,
          budget_status: "overrun",
          can_schedule: false,
          schedule_reason: "总预计投入已超支",
        })]}
        error={null}
        focus={null}
        loading={false}
        onSchedule={onSchedule}
      />,
    )

    expect(screen.getByRole("region", { name: "超支计划" })).toBeTruthy()
    expect(screen.getByText("预算已超出")).toBeTruthy()
    expect(screen.getByText("总预计投入已超支")).toBeTruthy()
    const scheduleButton = screen.getByRole("button", { name: "安排到今天" }) as HTMLButtonElement
    const dragButton = screen.getByRole("button", { name: "拖动 超支计划" }) as HTMLButtonElement
    expect(scheduleButton.disabled).toBe(true)
    expect(dragButton.disabled).toBe(true)
    fireEvent.click(scheduleButton)
    fireEvent.pointerDown(dragButton)
    expect(onSchedule).not.toHaveBeenCalled()
  })

  it("labels an exhausted candidate and disables scheduling", () => {
    render(
      <GoalCandidatePanel
        candidates={[candidate({
          id: "plan-exhausted",
          kind: "plan",
          name: "用尽计划",
          plan_id: "plan-exhausted",
          goal_id: "goal-exhausted",
          estimated_minutes: 60,
          invested_minutes: 60,
          remaining_minutes: 0,
          available_minutes: 0,
          suggested_block_minutes: null,
          budget_status: "exhausted",
          can_schedule: false,
          schedule_reason: "总预计投入已用尽",
        })]}
        error={null}
        focus={null}
        loading={false}
        onSchedule={vi.fn()}
      />,
    )

    expect(screen.getByText("预算已用尽")).toBeTruthy()
    expect(screen.getByText("总预计投入已用尽")).toBeTruthy()
    expect((screen.getByRole("button", { name: "安排到今天" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("disables scheduling when the server provides no suggested block despite an enabled flag", () => {
    const onSchedule = vi.fn()
    render(
      <GoalCandidatePanel
        candidates={[candidate({
          id: "plan-no-suggestion",
          kind: "plan",
          name: "暂无建议计划",
          plan_id: "plan-no-suggestion",
          goal_id: "goal-no-suggestion",
          can_schedule: true,
          suggested_block_minutes: null,
        })]}
        error={null}
        focus={null}
        loading={false}
        onSchedule={onSchedule}
      />,
    )

    const scheduleButton = screen.getByRole("button", { name: "安排到今天" }) as HTMLButtonElement
    const dragButton = screen.getByRole("button", { name: "拖动 暂无建议计划" }) as HTMLButtonElement
    expect(scheduleButton.disabled).toBe(true)
    expect(dragButton.disabled).toBe(true)
    fireEvent.click(scheduleButton)
    fireEvent.pointerDown(dragButton)
    expect(onSchedule).not.toHaveBeenCalled()
  })

  it("preserves explicit nullable budget overrides in candidate fixtures", () => {
    expect(candidate({
      id: "plan-recurring",
      kind: "plan",
      name: "周期计划",
      plan_id: "plan-recurring",
      remaining_minutes: null,
      available_minutes: null,
      suggested_block_minutes: null,
      schedule_reason: null,
    })).toEqual(expect.objectContaining({
      remaining_minutes: null,
      available_minutes: null,
      suggested_block_minutes: null,
      schedule_reason: null,
    }))
  })

  it("labels each plan group, nests its actions, and puts the focus goal first", () => {
    const candidates: SchedulableCandidate[] = [
      candidate({
        id: "action-other",
        kind: "action",
        name: "其他行动",
        plan_id: "plan/other",
        goal_id: "goal-other",
        goal_name: "其他目标",
      }),
      candidate({
        id: "plan/other",
        kind: "plan",
        name: "其他计划",
        plan_id: "plan/other",
        goal_id: "goal-other",
        goal_name: "其他目标",
      }),
      candidate({
        id: "action-focus",
        kind: "action",
        name: "聚焦行动",
        plan_id: "plan/聚焦",
        goal_id: "goal-focus",
        goal_name: "聚焦目标",
      }),
      candidate({
        id: "plan/聚焦",
        kind: "plan",
        name: "聚焦计划",
        plan_id: "plan/聚焦",
        goal_id: "goal-focus",
        goal_name: "聚焦目标",
      }),
    ]

    render(
      <GoalCandidatePanel
        candidates={candidates}
        error={null}
        focus={{
          goal_id: "goal-focus",
          name: "聚焦目标",
          tag: "focus",
          color: "#7c3aed",
          version: "2026-08-23T00:00:00.000Z",
        }}
        loading={false}
        onSchedule={vi.fn()}
      />,
    )

    const goalHeadings = screen.getAllByRole("heading", { level: 3 })
    expect(goalHeadings.map(heading => heading.textContent)).toEqual(["聚焦目标", "其他目标"])

    const focusPlan = screen.getByRole("region", { name: "聚焦计划" })
    const otherPlan = screen.getByRole("region", { name: "其他计划" })
    const focusActions = within(focusPlan).getByRole("list", { name: "聚焦计划的行动项" })
    const otherActions = within(otherPlan).getByRole("list", { name: "其他计划的行动项" })

    expect(within(focusActions).getByText("聚焦行动")).toBeTruthy()
    expect(within(focusActions).queryByText("其他行动")).toBeNull()
    expect(within(otherActions).getByText("其他行动")).toBeTruthy()
    expect(within(otherActions).queryByText("聚焦行动")).toBeNull()

    const focusAction = within(focusActions).getByText("聚焦行动")
    const directPlanControl = within(focusPlan).getAllByRole("button", { name: "安排到今天" }).at(-1)
    expect(directPlanControl).toBeTruthy()
    expect(focusAction.compareDocumentPosition(directPlanControl as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const labelledHeadingId = focusPlan.getAttribute("aria-labelledby")
    expect(labelledHeadingId).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(document.getElementById(labelledHeadingId ?? "")?.textContent).toBe("聚焦计划")
  })

  it("uses the shared 2×2 quadrant board", () => {
    const candidates: SchedulableCandidate[] = [
      candidate({
        id: "plan-cross",
        kind: "plan",
        name: "跨象限父计划",
        plan_id: "plan-cross",
        effective_quadrant: "q2",
      }),
      candidate({
        id: "action-cross",
        kind: "action",
        name: "重要紧急行动",
        plan_id: "plan-cross",
        effective_quadrant: "q1",
      }),
    ]

    render(
      <GoalCandidatePanel candidates={candidates} error={null} focus={null} loading={false} onSchedule={vi.fn()} />,
    )

    const quadrantTab = screen.getByRole("tab", { name: "四象限" })
    fireEvent.mouseDown(quadrantTab, { button: 0, ctrlKey: false })
    fireEvent.mouseUp(quadrantTab, { button: 0, ctrlKey: false })
    fireEvent.click(quadrantTab)

    expect(screen.getByRole("region", { name: "重要且紧急" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "重要不紧急" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "紧急不重要" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "不重要不紧急" })).toBeTruthy()
  })

  it("keeps unassigned candidates out of the goal tree and shows them as unclassified", () => {
    const candidates: SchedulableCandidate[] = [
      candidate({
        id: "plan-goal",
        kind: "plan",
        name: "目标内计划",
        plan_id: "plan-goal",
        goal_id: "goal-one",
        goal_name: "目标一",
      }),
      candidate({
        id: "plan-loose",
        kind: "plan",
        name: "尚未归类计划",
        plan_id: "plan-loose",
      }),
    ]

    render(
      <GoalCandidatePanel candidates={candidates} error={null} focus={null} loading={false} onSchedule={vi.fn()} />,
    )

    expect(screen.getAllByText("目标内计划").length).toBeGreaterThan(0)
    expect(screen.queryByText("尚未归类计划")).toBeNull()

    const unclassifiedTab = screen.getByRole("tab", { name: "未归类" })
    fireEvent.mouseDown(unclassifiedTab, { button: 0, ctrlKey: false })
    fireEvent.mouseUp(unclassifiedTab, { button: 0, ctrlKey: false })
    fireEvent.click(unclassifiedTab)

    expect(screen.getAllByText("尚未归类计划").length).toBeGreaterThan(0)
    expect(screen.queryByText("目标内计划")).toBeNull()
  })
})
