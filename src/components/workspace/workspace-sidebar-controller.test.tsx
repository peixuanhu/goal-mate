// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SchedulableCandidate, TodayView } from "@/lib/today/types"

import { WorkspaceSidebarController } from "./workspace-sidebar-controller"

const candidate: SchedulableCandidate = {
  kind: "plan",
  id: "plan_launch",
  plan_id: "plan_launch",
  action_id: null,
  goal_id: "goal_product",
  goal_name: "发布目标",
  name: "上线产品",
  due_date: null,
  estimated_minutes: 60,
  energy_level: "high",
  effective_quadrant: "q1",
  is_recurring: false,
  version: "2026-08-24T00:00:00.000Z",
}

const todayView: TodayView = {
  date: "2026-08-24",
  preference: {
    preference_id: "default",
    timezone: "Asia/Shanghai",
    day_start_minutes: 480,
    day_end_minutes: 1320,
    high_energy_start_minutes: null,
    high_energy_end_minutes: null,
    buffer_minutes: 15,
    default_block_minutes: 60,
    capacity_warning_minutes: 480,
    version: null,
  },
  focus: null,
  candidates: [candidate],
  blocks: [],
  checks: [],
}

vi.mock("@/components/today/goal-candidate-panel", () => ({
  GoalCandidatePanel: ({ candidates, onSchedule }: {
    candidates: SchedulableCandidate[]
    onSchedule: (candidate: SchedulableCandidate) => void
  }) => (
    <aside aria-label="共享工作台">
      {candidates.map(item => (
        <button key={item.id} onClick={() => onSchedule(item)} type="button">安排 {item.name}</button>
      ))}
    </aside>
  ),
}))

vi.mock("@/components/today/schedule-block-editor", () => ({
  ScheduleBlockEditor: ({ onSubmit }: { onSubmit: (payload: { start_at: string; end_at: string }) => Promise<void> }) => (
    <div role="dialog">
      <button onClick={() => void onSubmit({
        start_at: "2026-08-24T00:00:00.000Z",
        end_at: "2026-08-24T01:00:00.000Z",
      })} type="button">提交排期</button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

describe("WorkspaceSidebarController", () => {
  it("loads the selected date and schedules a candidate with an idempotency key", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "shared-sidebar-key") })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(todayView))
      .mockResolvedValueOnce(jsonResponse({ block_id: "block_launch" }))
      .mockResolvedValueOnce(jsonResponse({ ...todayView, candidates: [] }))
    vi.stubGlobal("fetch", fetchMock)

    render(<WorkspaceSidebarController date="2026-08-24" />)

    fireEvent.click(await screen.findByRole("button", { name: "安排 上线产品" }))
    fireEvent.click(screen.getByRole("button", { name: "提交排期" }))

    await waitFor(() => expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/schedule-block", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        "Idempotency-Key": "shared-sidebar-key",
      }),
      body: JSON.stringify({
        plan_id: "plan_launch",
        action_id: null,
        start_at: "2026-08-24T00:00:00.000Z",
        end_at: "2026-08-24T01:00:00.000Z",
        status: "scheduled",
        source: "manual",
      }),
    })))
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/today?date=2026-08-24", expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })
})
