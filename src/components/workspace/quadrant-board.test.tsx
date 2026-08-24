// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { QuadrantBoard, type QuadrantPlan } from "./quadrant-board"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  push.mockReset()
})

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function plan(overrides: Partial<QuadrantPlan> & Pick<QuadrantPlan, "name" | "plan_id">): QuadrantPlan {
  return {
    progress: 0,
    is_recurring: false,
    recurrence_type: null,
    recurrence_value: null,
    tags: [],
    progressRecords: [],
    ...overrides,
  }
}

describe("QuadrantBoard", () => {
  it("previews two active plans and expands the rest on demand", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      q1: [
        plan({ plan_id: "plan_1", name: "A 任务" }),
        plan({ plan_id: "plan_2", name: "B 任务" }),
        plan({ plan_id: "plan_3", name: "C 任务" }),
      ],
      q2: [],
      q3: [],
      q4: [],
    })))

    render(<QuadrantBoard />)

    const q1 = await screen.findByRole("region", { name: "重要且紧急" })
    expect(within(q1).getByLabelText("重要且紧急未完成 3 项")).toBeTruthy()
    expect(within(q1).getByText("A 任务")).toBeTruthy()
    expect(within(q1).getByText("B 任务")).toBeTruthy()
    expect(within(q1).queryByText("C 任务")).toBeNull()

    fireEvent.click(within(q1).getByRole("button", { name: "还有 1 项" }))
    expect(within(q1).getByText("C 任务")).toBeTruthy()
  })

  it("folds completed plans and reveals struck-through rows on demand", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      q1: [
        plan({ plan_id: "plan_active", name: "待办事项" }),
        plan({ plan_id: "plan_done_1", name: "完成发布", progress: 1, tags: ["发布"] }),
        plan({ plan_id: "plan_done_2", name: "完成复盘", progress: 1 }),
      ],
      q2: [],
      q3: [],
      q4: [],
    })))

    render(<QuadrantBoard />)

    const q1 = await screen.findByRole("region", { name: "重要且紧急" })
    expect(screen.getByRole("region", { name: "重要不紧急" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "紧急不重要" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "不重要不紧急" })).toBeTruthy()
    expect(await within(q1).findByText("待办事项")).toBeTruthy()
    expect(within(q1).queryByText("完成发布")).toBeNull()
    expect(within(q1).queryByText("完成复盘")).toBeNull()

    fireEvent.click(within(q1).getByRole("button", { name: "已完成 2" }))
    expect(within(q1).getByText("完成发布").className).toContain("line-through")
    expect(within(q1).getByText("完成复盘").className).toContain("line-through")
  })

  it("uses compact single-line cards without an internal quadrant scroller", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      q1: [plan({ plan_id: "plan_focus", name: "需要保持单行的较长任务名称", tags: ["product", "focus"] })],
      q2: [],
      q3: [],
      q4: [],
    })))

    render(<QuadrantBoard />)

    const q1 = await screen.findByRole("region", { name: "重要且紧急" })
    const taskName = await within(q1).findByText("需要保持单行的较长任务名称")
    const card = taskName.closest('[data-slot="quadrant-task-card"]')
    const metadata = card?.querySelector('[data-slot="quadrant-task-metadata"]')
    const taskList = q1.querySelector('[data-slot="quadrant-task-list"]')

    expect(card).toBeTruthy()
    expect(taskName.className).toContain("truncate")
    expect(metadata?.className).toContain("grid-rows-[0fr]")
    expect(metadata?.className).toContain("group-hover:grid-rows-[1fr]")
    expect(within(card as HTMLElement).getByText("product · focus")).toBeTruthy()
    expect(taskList?.className).toContain("space-y-2")
    expect(taskList?.className).not.toContain("overflow-y-auto")
  })

  it("separates task opening from drag activation and exposes controls on touch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      q1: [plan({ plan_id: "plan_open", name: "可打开任务", tags: ["focus"] })],
      q2: [],
      q3: [],
      q4: [],
    })))

    render(<QuadrantBoard />)

    const q1 = await screen.findByRole("region", { name: "重要且紧急" })
    const taskButton = within(q1).getByRole("button", { name: "可打开任务" })
    const card = taskButton.closest('[data-slot="quadrant-task-card"]')
    const metadata = card?.querySelector('[data-slot="quadrant-task-metadata"]')

    expect(taskButton.getAttribute("aria-roledescription")).toBeNull()
    const dragButton = within(card as HTMLElement).getByRole("button", { name: "拖动 可打开任务" })
    expect(dragButton.className).toContain("sr-only")
    expect(dragButton.className).toContain("focus:not-sr-only")

    fireEvent.click(taskButton)
    expect(push).toHaveBeenCalledWith("/progress?plan_id=plan_open")

    push.mockReset()
    fireEvent.pointerDown(taskButton, { pointerType: "touch" })
    fireEvent.pointerUp(taskButton, { pointerType: "touch" })
    fireEvent.click(taskButton)
    expect(push).not.toHaveBeenCalled()
    expect(metadata?.className).toContain("grid-rows-[1fr]")
    expect(metadata?.className).toContain("opacity-100")
  })

  it("removes a plan through the priority endpoint and refreshes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        q1: [{
          plan_id: "plan_done",
          name: "完成发布",
          progress: 1,
          is_recurring: false,
          recurrence_type: null,
          recurrence_value: null,
          tags: [],
          progressRecords: [],
        }],
        q2: [],
        q3: [],
        q4: [],
      }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ q1: [], q2: [], q3: [], q4: [] }))
    vi.stubGlobal("fetch", fetchMock)

    render(<QuadrantBoard />)
    const q1 = await screen.findByRole("region", { name: "重要且紧急" })
    fireEvent.click(await within(q1).findByRole("button", { name: "已完成 1" }))
    fireEvent.click(within(q1).getByRole("button", { name: "移出四象限 完成发布" }))

    await waitFor(() => expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/plan/priority", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({
        plan_id: "plan_done",
        priority_quadrant: null,
        is_scheduled: false,
      }),
    })))
  })
})
