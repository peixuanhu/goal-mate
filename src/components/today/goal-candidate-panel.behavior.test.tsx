// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it } from "vitest"

import type { SchedulableCandidate } from "@/lib/today/types"

import { GoalCandidatePanel } from "./goal-candidate-panel"

afterEach(cleanup)

function candidate(
  overrides: Partial<SchedulableCandidate> & Pick<SchedulableCandidate, "id" | "kind" | "name" | "plan_id">,
): SchedulableCandidate {
  return {
    action_id: overrides.kind === "action" ? overrides.id : null,
    goal_id: null,
    goal_name: null,
    due_date: null,
    estimated_minutes: 30,
    energy_level: null,
    effective_quadrant: null,
    is_recurring: false,
    version: "2026-08-23T00:00:00.000Z",
    ...overrides,
  }
}

describe("GoalCandidatePanel hierarchy", () => {
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
    const directPlanControl = within(focusPlan).getByRole("button", { name: "直接安排计划" })
    expect(focusAction.compareDocumentPosition(directPlanControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const labelledHeadingId = focusPlan.getAttribute("aria-labelledby")
    expect(labelledHeadingId).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(document.getElementById(labelledHeadingId ?? "")?.textContent).toBe("聚焦计划")
  })
})
