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
            rect: { current: { translated: { top: 240, height: 20 } } },
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const candidate: SchedulableCandidate = {
  kind: "plan",
  id: "plan_drop",
  plan_id: "plan_drop",
  action_id: null,
  goal_id: "goal_drop",
  goal_name: "拖放目标",
  goal_position: 0,
  name: "拖放计划",
  due_date: null,
  estimated_minutes: 60,
  effective_default_block_minutes: 60,
  invested_minutes: 0,
  remaining_minutes: 60,
  reserved_action_minutes: 0,
  available_minutes: 60,
  scheduled_block_count: 0,
  scheduled_minutes: 0,
  suggested_block_minutes: 60,
  budget_status: "ok",
  can_schedule: true,
  schedule_reason: null,
  energy_level: null,
  effective_quadrant: null,
  is_recurring: false,
  version: "2026-08-23T00:00:00.000Z",
}

function response(
  date: string,
  dayEndMinutes = 610,
  preferenceOverrides: Partial<TodayView["preference"]> = {},
): Response {
  const view: TodayView = {
    date,
    preference: {
      preference_id: "default",
      timezone: "Asia/Shanghai",
      day_start_minutes: 490,
      day_end_minutes: dayEndMinutes,
      high_energy_start_minutes: null,
      high_energy_end_minutes: null,
      buffer_minutes: 15,
      default_block_minutes: 60,
      capacity_warning_minutes: 480,
      version: null,
      ...preferenceOverrides,
    },
    focus: null,
    candidates: [candidate],
    blocks: [],
    checks: [],
  }
  return new Response(JSON.stringify(view), { headers: { "Content-Type": "application/json" } })
}

describe("TodayWorkspace drop orchestration", () => {
  it("guards drag scheduling for a server-blocked candidate", async () => {
    const blocked = {
      ...candidate,
      remaining_minutes: 0,
      available_minutes: 0,
      suggested_block_minutes: null,
      budget_status: "exhausted" as const,
      can_schedule: false,
      schedule_reason: "总预计投入已用尽",
    }
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const date = new URL(String(url), "http://localhost").searchParams.get("date")
      if (!date) throw new Error("missing date")
      const view: TodayView = {
        date,
        preference: {
          preference_id: "default",
          timezone: "Asia/Shanghai",
          day_start_minutes: 490,
          day_end_minutes: 610,
          high_energy_start_minutes: null,
          high_energy_end_minutes: null,
          buffer_minutes: 15,
          default_block_minutes: 60,
          capacity_warning_minutes: 480,
          version: null,
        },
        focus: null,
        candidates: [blocked],
        blocks: [],
        checks: [],
      }
      return Promise.resolve(new Response(JSON.stringify(view), { headers: { "Content-Type": "application/json" } }))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    expect((await screen.findAllByText("拖放计划")).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: "模拟拖放候选" }))
    expect(screen.getByRole("alert").textContent).toContain("总预计投入已用尽")
    expect(screen.queryByRole("dialog", { name: "安排时间块" })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

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
    expect((screen.getByLabelText("开始时间") as HTMLInputElement).value).toBe("08:40")
    expect((screen.getByLabelText("结束时间") as HTMLInputElement).value).toBe("09:40")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("shows a scoped no-space error instead of an invalid editor for a sub-slot window", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "unused-key") })
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const date = new URL(String(url), "http://localhost").searchParams.get("date")
      if (!date) throw new Error("missing date")
      return Promise.resolve(response(date, 500))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    expect((await screen.findAllByText("拖放计划")).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: "模拟拖放候选" }))
    expect(screen.getByRole("alert").textContent).toContain("没有足够的无冲突时间")
    expect(screen.queryByRole("dialog", { name: "安排时间块" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "安排到今天" }))
    expect(screen.getByRole("alert").textContent).toContain("没有足够的无冲突时间")
    expect(screen.queryByRole("dialog", { name: "安排时间块" })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("moves a New York spring-gap drop to the next elapsed-time-safe slot without writing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-03-08T12:00:00.000Z"))
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "spring-drop-key") })
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBeUndefined()
      const date = new URL(String(url), "http://localhost").searchParams.get("date")
      if (!date) throw new Error("missing date")
      return Promise.resolve(response(date, 600, {
        timezone: "America/New_York",
        day_start_minutes: 0,
        day_end_minutes: 600,
      }))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    expect((await screen.findAllByText("拖放计划")).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: "模拟拖放候选" }))
    expect((screen.getByLabelText("开始时间") as HTMLInputElement).value).toBe("03:00")
    expect((screen.getByLabelText("结束时间") as HTMLInputElement).value).toBe("04:00")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("moves a New York fall ambiguous drop to the next unambiguous slot without writing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"))
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "fall-drop-key") })
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBeUndefined()
      const date = new URL(String(url), "http://localhost").searchParams.get("date")
      if (!date) throw new Error("missing date")
      return Promise.resolve(response(date, 240, {
        timezone: "America/New_York",
        day_start_minutes: 0,
        day_end_minutes: 240,
      }))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    expect((await screen.findAllByText("拖放计划")).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: "模拟拖放候选" }))
    expect((screen.getByLabelText("开始时间") as HTMLInputElement).value).toBe("02:00")
    expect((screen.getByLabelText("结束时间") as HTMLInputElement).value).toBe("03:00")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
