// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SchedulableCandidate, TodayView } from "@/lib/today/types"

import { TodayWorkspace } from "./today-workspace"

vi.mock("@/components/UserMenu", () => ({ default: () => null }))
vi.mock("./ai-workspace", () => ({ AiWorkspace: () => <aside>AI</aside> }))

vi.mock("@dnd-kit/core", () => {
  let activeData: { candidate?: SchedulableCandidate } | undefined
  return {
    DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd?: (event: unknown) => void }) => (
      <>
        <button onClick={() => onDragEnd?.({
          active: {
            data: { current: activeData },
            rect: { current: { translated: { top: 250, height: 20 } } },
          },
          over: { id: "today-timeline", rect: { top: 100, height: 600 } },
        })} type="button">模拟拖放候选</button>
        {children}
      </>
    ),
    useDraggable: ({ data }: { data: { candidate: SchedulableCandidate } }) => {
      activeData = data
      return { attributes: {}, isDragging: false, listeners: {}, setNodeRef: () => undefined, transform: null }
    },
    useDroppable: () => ({ isOver: false, setNodeRef: () => undefined }),
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const candidate: SchedulableCandidate = {
  kind: "plan",
  id: "plan_drop",
  plan_id: "plan_drop",
  action_id: null,
  goal_id: null,
  goal_name: null,
  name: "拖放计划",
  due_date: null,
  estimated_minutes: 60,
  energy_level: null,
  effective_quadrant: null,
  is_recurring: false,
  version: "2026-08-23T00:00:00.000Z",
}

function response(date: string): Response {
  const view: TodayView = {
    date,
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
  return new Response(JSON.stringify(view), { headers: { "Content-Type": "application/json" } })
}

describe("TodayWorkspace drop orchestration", () => {
  it("opens the same editor intent at the dropped 15-minute slot without writing", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "drop-key") })
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBeUndefined()
      const date = new URL(String(url), "http://localhost").searchParams.get("date")
      if (!date) throw new Error("missing date")
      return Promise.resolve(response(date))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    expect((await screen.findAllByText("拖放计划")).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: "模拟拖放候选" }))

    expect(screen.getByRole("dialog", { name: "安排时间块" })).toBeTruthy()
    expect((screen.getByLabelText("开始时间") as HTMLInputElement).value).toBe("11:45")
    expect((screen.getByLabelText("结束时间") as HTMLInputElement).value).toBe("12:45")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
