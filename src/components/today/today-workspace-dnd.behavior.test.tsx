// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ScheduleBlockView, SchedulableCandidate, TodayView } from "@/lib/today/types"

import { TodayWorkspace } from "./today-workspace"

vi.mock("@/components/UserMenu", () => ({ default: () => null }))
vi.mock("./ai-workspace", () => ({ AiWorkspace: () => <aside>AI</aside> }))

vi.mock("@dnd-kit/core", () => {
  let candidateData: unknown
  const scheduleBlockData = {
    kind: "schedule-block",
    block: {
      block_id: "block_drag", plan_id: "plan_drag", action_id: null, title: "拖动时间块", goal_id: null, goal_name: null,
      energy_level: null, start_at: "2026-08-27T00:00:00.000Z", end_at: "2026-08-27T01:00:00.000Z",
      status: "scheduled", source: "manual", result_note: null, version: 1,
    },
    localRange: { start: 480, end: 540 },
  }
  const event = (
    data = candidateData,
    activatorEvent: Record<string, unknown> = { clientY: 100 },
    delta = { x: 0, y: 150 },
    translated: { top: number; height: number } | null = { top: 230, height: 20 },
    initial: { top: number; height: number } | null = { top: 80, height: 20 },
    overRect = { top: 100, height: 600 },
  ) => ({
    active: { data: { current: data }, rect: { current: { initial, translated } } },
    activatorEvent,
    delta,
    over: { id: "today-timeline", rect: overRect },
  })
  return {
    DndContext: ({ children, onDragStart, onDragMove, onDragCancel, onDragEnd }: {
      children: React.ReactNode
      onDragStart?: (value: unknown) => void
      onDragMove?: (value: unknown) => void
      onDragCancel?: (value: unknown) => void
      onDragEnd?: (value: unknown) => void
    }) => <>
      <button onClick={() => onDragStart?.(event())} type="button">模拟开始</button>
      <button onClick={() => onDragStart?.(event(candidateData, {}, { x: 0, y: 0 }, { top: 240, height: 20 }, { top: 80, height: 20 }))} type="button">模拟无激活开始</button>
      <button onClick={() => onDragMove?.(event())} type="button">模拟移动</button>
      <button onClick={() => onDragCancel?.(event())} type="button">模拟取消</button>
      <button onClick={() => onDragEnd?.(event())} type="button">模拟松手</button>
      <button onClick={() => onDragMove?.(event(candidateData, { clientY: 250 }, { x: 0, y: 0 }))} type="button">模拟鼠标移动</button>
      <button onClick={() => onDragMove?.(event(candidateData, { touches: [{ clientY: 250 }] }, { x: 0, y: 0 }))} type="button">模拟触摸移动</button>
      <button onClick={() => onDragMove?.(event(candidateData, { changedTouches: [{ clientY: 250 }] }, { x: 0, y: 0 }))} type="button">模拟变更触摸移动</button>
      <button onClick={() => onDragMove?.(event(candidateData, {}, { x: 0, y: 0 }, { top: 240, height: 20 }))} type="button">模拟回退移动</button>
      <button onClick={() => onDragMove?.(event(candidateData, { clientY: 120 }, { x: 0, y: 150 }, { top: 230, height: 20 }, { top: 100, height: 20 }, { top: 80, height: 600 }))} type="button">模拟滚动移动</button>
      <button onClick={() => onDragStart?.(event(scheduleBlockData))} type="button">模拟时间块开始</button>
      <button onClick={() => onDragMove?.(event(scheduleBlockData))} type="button">模拟时间块移动</button>
      <button onClick={() => onDragEnd?.(event(scheduleBlockData))} type="button">模拟时间块松手</button>
      <button onClick={() => onDragEnd?.(event({ candidate }))} type="button">模拟未知松手</button>
      {children}
    </>,
    useDraggable: ({ data }: { data: unknown }) => {
      if ((data as { kind?: string }).kind === "candidate") candidateData = data
      return { attributes: {}, isDragging: false, listeners: {}, setActivatorNodeRef: () => undefined, setNodeRef: () => undefined, transform: null }
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
  kind: "plan", id: "plan_drop", plan_id: "plan_drop", action_id: null,
  goal_id: "goal_drop", goal_name: "拖放目标", goal_position: 0, name: "拖放计划",
  due_date: null, estimated_minutes: 60, effective_default_block_minutes: 60,
  invested_minutes: 0, remaining_minutes: 60, reserved_action_minutes: 0,
  available_minutes: 60, scheduled_block_count: 0, scheduled_minutes: 0,
  suggested_block_minutes: 60, budget_status: "ok", can_schedule: true,
  schedule_reason: null, energy_level: null, effective_quadrant: null,
  is_recurring: false, version: "2026-08-23T00:00:00.000Z",
}

function todayResponse(date: string, options: {
  blocks?: ScheduleBlockView[]
  candidate?: SchedulableCandidate
  preference?: Partial<TodayView["preference"]>
} = {}): Response {
  const view: TodayView = {
    date,
    preference: {
      preference_id: "default", timezone: "Asia/Shanghai", day_start_minutes: 490, day_end_minutes: 610,
      high_energy_start_minutes: null, high_energy_end_minutes: null, buffer_minutes: 15,
      default_block_minutes: 60, capacity_warning_minutes: 480, version: null,
      ...options.preference,
    },
    focus: null, candidates: [options.candidate ?? candidate], blocks: options.blocks ?? [], checks: [],
  }
  return new Response(JSON.stringify(view), { headers: { "Content-Type": "application/json" } })
}

function dateFromUrl(url: RequestInfo | URL): string {
  const date = new URL(String(url), "http://localhost").searchParams.get("date")
  if (!date) throw new Error("missing date")
  return date
}

describe("TodayWorkspace direct timeline creation", () => {
  it("uses the translated drag rect plus grab offset and immediately creates", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "timeline-key") })
    const fetchMock = vi.fn((url: RequestInfo | URL, _init?: RequestInit) => String(url) === "/api/schedule-block"
      ? Promise.resolve(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
      : Promise.resolve(todayResponse(dateFromUrl(url))))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    const preview = screen.getByTestId("timeline-placement-preview")
    expect(preview.dataset.valid).toBe("true")
    expect(preview.textContent).toContain("08:40–09:40 · 60 分钟")

    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/schedule-block", expect.objectContaining({ method: "POST" })))
    const post = fetchMock.mock.calls.find(([url]) => url === "/api/schedule-block")?.[1]
    if (!post) throw new Error("missing timeline post")
    const requestedDate = dateFromUrl(fetchMock.mock.calls[0]?.[0])
    expect(post.headers).toMatchObject({ "Idempotency-Key": "timeline-key" })
    expect(JSON.parse(String(post.body))).toEqual({
      plan_id: "plan_drop", action_id: null,
      start_at: `${requestedDate}T00:40:00.000Z`, end_at: `${requestedDate}T01:40:00.000Z`,
      status: "scheduled", source: "manual",
    })
    expect(screen.queryByRole("dialog", { name: "安排时间块" })).toBeNull()
    await waitFor(() => expect(screen.queryByTestId("timeline-placement-preview")).toBeNull())
  })

  it.each([
    ["mouse", "模拟开始", "模拟鼠标移动"],
    ["touch", "模拟开始", "模拟触摸移动"],
    ["changed touch", "模拟开始", "模拟变更触摸移动"],
    ["translated fallback", "模拟无激活开始", "模拟回退移动"],
  ])("renders a preview for the %s drag input shape", async (_source, startControl, moveControl) => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => Promise.resolve(todayResponse(dateFromUrl(url))))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: startControl }))
    fireEvent.click(screen.getByRole("button", { name: moveControl }))
    expect(screen.getByTestId("timeline-placement-preview").textContent).toContain("08:40–09:40 · 60 分钟")
  })

  it("keeps the grabbed timeline point stable when auto-scroll changes the over rect", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => Promise.resolve(todayResponse(dateFromUrl(url))))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟滚动移动" }))
    expect(screen.getByTestId("timeline-placement-preview").textContent).toContain("08:40–09:40 · 60 分钟")
  })

  it("shows an exact invalid DST preview and does not write on drop", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-03-08T12:00:00.000Z"))
    const fetchMock = vi.fn((url: RequestInfo | URL) => Promise.resolve(todayResponse(dateFromUrl(url), {
      preference: { timezone: "America/New_York", day_start_minutes: 0, day_end_minutes: 600 },
    })))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    expect(screen.getByTestId("timeline-placement-preview").dataset.valid).toBe("false")
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("alert").textContent).toContain("该本地时间不可用于排期")
  })

  it("does not relocate an ambiguous fall-back drop before rejecting it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"))
    const fetchMock = vi.fn((url: RequestInfo | URL) => Promise.resolve(todayResponse(dateFromUrl(url), {
      preference: { timezone: "America/New_York", day_start_minutes: 0, day_end_minutes: 240 },
    })))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    const preview = screen.getByTestId("timeline-placement-preview")
    expect(preview.dataset.valid).toBe("false")
    expect(preview.textContent).toContain("01:00–02:00 · 60 分钟")
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("clears a preview on cancel and ignores untagged candidate-shaped drag data", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => Promise.resolve(todayResponse(dateFromUrl(url))))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    expect(screen.getByTestId("timeline-placement-preview")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "模拟取消" }))
    expect(screen.queryByTestId("timeline-placement-preview")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "模拟未知松手" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps an existing completion control enabled while a timeline create is pending", async () => {
    let resolvePost: ((response: Response) => void) | undefined
    const postPromise = new Promise<Response>(resolve => { resolvePost = resolve })
    const existing: ScheduleBlockView = {
      block_id: "existing", plan_id: "existing-plan", action_id: null, title: "已有安排", goal_id: null, goal_name: null,
      energy_level: null, start_at: "2026-08-27T02:00:00.000Z", end_at: "2026-08-27T03:00:00.000Z",
      status: "scheduled", source: "manual", result_note: null, version: 1,
    }
    const fetchMock = vi.fn((url: RequestInfo | URL) => String(url) === "/api/schedule-block"
      ? postPromise
      : Promise.resolve(todayResponse(dateFromUrl(url), { blocks: [existing] })))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    await waitFor(() => expect(screen.getByTestId("timeline-placement-preview").getAttribute("aria-busy")).toBe("true"))
    const pendingText = screen.getByTestId("timeline-placement-preview").textContent
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟取消" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    expect(screen.getByTestId("timeline-placement-preview").getAttribute("aria-busy")).toBe("true")
    expect(screen.getByTestId("timeline-placement-preview").textContent).toBe(pendingText)
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/schedule-block")).toHaveLength(1)
    expect((screen.getByRole("button", { name: "完成 已有安排" }) as HTMLButtonElement).disabled).toBe(false)
    resolvePost?.(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
    await waitFor(() => expect(screen.queryByTestId("timeline-placement-preview")).toBeNull())
  })

  it("does not report a refresh failure when timeline and completion refreshes resolve in reverse order", async () => {
    let resolveTimelinePost: ((value: Response) => void) | undefined
    let resolveCompletionPost: ((value: Response) => void) | undefined
    let rejectTimelineGet: ((reason?: unknown) => void) | undefined
    let resolveCompletionGet: ((value: Response) => void) | undefined
    const timelinePost = new Promise<Response>(resolve => { resolveTimelinePost = resolve })
    const completionPost = new Promise<Response>(resolve => { resolveCompletionPost = resolve })
    const timelineGet = new Promise<Response>((_resolve, reject) => {
      rejectTimelineGet = reject
    })
    const completionGet = new Promise<Response>(resolve => { resolveCompletionGet = resolve })
    let todayCalls = 0
    let selectedDate = ""
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (url === "/api/schedule-block") return timelinePost
      if (url === "/api/schedule-block/complete") return completionPost
      todayCalls += 1
      const date = dateFromUrl(url)
      selectedDate = date
      if (todayCalls === 1) return Promise.resolve(todayResponse(date, { blocks: [{
        block_id: "existing", plan_id: "existing-plan", action_id: null, title: "已有安排", goal_id: null, goal_name: null,
        energy_level: null, start_at: `${date}T02:00:00.000Z`, end_at: `${date}T03:00:00.000Z`,
        status: "scheduled", source: "manual", result_note: null, version: 1,
      }] }))
      if (todayCalls === 2) return timelineGet
      if (todayCalls === 3) return completionGet
      return Promise.resolve(todayResponse(date))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/schedule-block", expect.anything()))

    fireEvent.click(screen.getByRole("button", { name: "完成 已有安排" }))
    const completion = await screen.findByRole("dialog", { name: "记录时间块结果" })
    fireEvent.click(within(completion).getByRole("button", { name: "保存结果" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/schedule-block/complete", expect.anything()))

    resolveTimelinePost?.(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
    await waitFor(() => expect(todayCalls).toBe(2))
    resolveCompletionPost?.(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
    await waitFor(() => expect(todayCalls).toBe(3))
    resolveCompletionGet?.(todayResponse(selectedDate))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "记录时间块结果" })).toBeNull())
    rejectTimelineGet?.(new Error("较旧刷新失败"))
    await waitFor(() => expect(screen.queryByTestId("timeline-placement-preview")).toBeNull())
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("does not let an older successful timeline refresh overwrite newer completion data", async () => {
    let resolveTimelinePost: ((value: Response) => void) | undefined
    let resolveCompletionPost: ((value: Response) => void) | undefined
    let resolveTimelineGet: ((value: Response) => void) | undefined
    let resolveCompletionGet: ((value: Response) => void) | undefined
    const timelinePost = new Promise<Response>(resolve => { resolveTimelinePost = resolve })
    const completionPost = new Promise<Response>(resolve => { resolveCompletionPost = resolve })
    const timelineGet = new Promise<Response>(resolve => { resolveTimelineGet = resolve })
    const completionGet = new Promise<Response>(resolve => { resolveCompletionGet = resolve })
    let todayCalls = 0
    let selectedDate = ""
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (url === "/api/schedule-block") return timelinePost
      if (url === "/api/schedule-block/complete") return completionPost
      todayCalls += 1
      const date = dateFromUrl(url)
      selectedDate = date
      if (todayCalls === 1) return Promise.resolve(todayResponse(date, { blocks: [{
        block_id: "existing", plan_id: "existing-plan", action_id: null, title: "已有安排", goal_id: null, goal_name: null,
        energy_level: null, start_at: `${date}T02:00:00.000Z`, end_at: `${date}T03:00:00.000Z`,
        status: "scheduled", source: "manual", result_note: null, version: 1,
      }] }))
      if (todayCalls === 2) return timelineGet
      if (todayCalls === 3) return completionGet
      return Promise.resolve(todayResponse(date))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/schedule-block", expect.anything()))
    fireEvent.click(screen.getByRole("button", { name: "完成 已有安排" }))
    const completion = await screen.findByRole("dialog", { name: "记录时间块结果" })
    fireEvent.click(within(completion).getByRole("button", { name: "保存结果" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/schedule-block/complete", expect.anything()))

    resolveTimelinePost?.(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
    await waitFor(() => expect(todayCalls).toBe(2))
    resolveCompletionPost?.(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
    await waitFor(() => expect(todayCalls).toBe(3))
    resolveCompletionGet?.(todayResponse(selectedDate, { blocks: [{
      block_id: "new", plan_id: "new-plan", action_id: null, title: "最新刷新", goal_id: null, goal_name: null,
      energy_level: null, start_at: `${selectedDate}T01:00:00.000Z`, end_at: `${selectedDate}T01:30:00.000Z`,
      status: "scheduled", source: "manual", result_note: null, version: 1,
    }] }))
    await screen.findByText("最新刷新")
    resolveTimelineGet?.(todayResponse(selectedDate, { blocks: [{
      block_id: "old", plan_id: "old-plan", action_id: null, title: "旧刷新", goal_id: null, goal_name: null,
      energy_level: null, start_at: `${selectedDate}T01:30:00.000Z`, end_at: `${selectedDate}T02:00:00.000Z`,
      status: "scheduled", source: "manual", result_note: null, version: 1,
    }] }))
    await waitFor(() => expect(screen.queryByTestId("timeline-placement-preview")).toBeNull())
    expect(screen.getByText("最新刷新")).toBeTruthy()
    expect(screen.queryByText("旧刷新")).toBeNull()
  })

  it("reports a failure from the latest timeline refresh", async () => {
    let rejectRefresh: ((reason?: unknown) => void) | undefined
    const refresh = new Promise<Response>((_resolve, reject) => { rejectRefresh = reject })
    let todayCalls = 0
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (url === "/api/schedule-block") {
        return Promise.resolve(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
      }
      todayCalls += 1
      return todayCalls === 1 ? Promise.resolve(todayResponse(dateFromUrl(url))) : refresh
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    await waitFor(() => expect(todayCalls).toBe(2))
    rejectRefresh?.(new Error("最新刷新失败"))
    await screen.findByText("修改已保存，但今日数据刷新失败，请重新加载页面")
  })

  it("shows a conflict preview and does not create a candidate block", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const date = dateFromUrl(url)
      return Promise.resolve(todayResponse(date, { blocks: [{
        block_id: "conflict", plan_id: "other", action_id: null, title: "冲突", goal_id: null, goal_name: null,
        energy_level: null, start_at: `${date}T00:40:00.000Z`, end_at: `${date}T01:40:00.000Z`,
        status: "scheduled", source: "manual", result_note: null, version: 1,
      }] }))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    expect(screen.getByTestId("timeline-placement-preview").dataset.valid).toBe("false")
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("alert").textContent).toContain("冲突")
  })

  it("shows a budget preview and does not create a candidate block", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => Promise.resolve(todayResponse(dateFromUrl(url), {
      candidate: { ...candidate, available_minutes: 30 },
    })))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    expect(screen.getByTestId("timeline-placement-preview").dataset.valid).toBe("false")
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("alert").textContent).toContain("超过剩余可安排时间")
  })

  it("shows an out-of-bounds preview for a sub-slot day without writing", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => Promise.resolve(todayResponse(dateFromUrl(url), {
      preference: { day_end_minutes: 500 },
    })))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    expect(screen.getByTestId("timeline-placement-preview").dataset.valid).toBe("false")
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("alert").textContent).toContain("规划范围")
  })

  it("ignores a tagged schedule-block payload without creating a candidate block", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => Promise.resolve(todayResponse(dateFromUrl(url))))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟时间块开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟时间块移动" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟时间块松手" }))
    expect(screen.queryByTestId("timeline-placement-preview")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("drops an old drag after a date change without writing", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => Promise.resolve(todayResponse(dateFromUrl(url))))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    expect(screen.getByTestId("timeline-placement-preview")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "后一天" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId("timeline-placement-preview")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(["resolve", "reject"] as const)("silently discards an old pending POST when the date changes and it later %ss", async outcome => {
    let settleOld: ((value: Response) => void) | undefined
    let rejectOld: ((reason?: unknown) => void) | undefined
    let settleNew: ((value: Response) => void) | undefined
    const oldPost = new Promise<Response>((resolve, reject) => {
      settleOld = resolve
      rejectOld = reject
    })
    const newPost = new Promise<Response>(resolve => { settleNew = resolve })
    let mutationCount = 0
    let dataChangedCount = 0
    const onDataChanged = () => { dataChangedCount += 1 }
    window.addEventListener("goal-mate:data-changed", onDataChanged)
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (url === "/api/schedule-block") {
        mutationCount += 1
        return mutationCount === 1 ? oldPost : newPost
      }
      return Promise.resolve(todayResponse(dateFromUrl(url)))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    await waitFor(() => expect(mutationCount).toBe(1))
    fireEvent.click(screen.getByRole("button", { name: "后一天" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    await waitFor(() => expect(mutationCount).toBe(2))
    expect(screen.getByTestId("timeline-placement-preview").getAttribute("aria-busy")).toBe("true")

    if (outcome === "resolve") {
      settleOld?.(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
    } else {
      rejectOld?.(new Error("旧请求失败"))
    }
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(dataChangedCount).toBe(0)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByTestId("timeline-placement-preview").getAttribute("aria-busy")).toBe("true")
    settleNew?.(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
    window.removeEventListener("goal-mate:data-changed", onDataChanged)
  })

  it.each(["resolve", "reject"] as const)("does not refresh, dispatch, or surface an error after unmount when a pending timeline POST %ss", async outcome => {
    let resolvePost: ((value: Response) => void) | undefined
    let rejectPost: ((reason?: unknown) => void) | undefined
    const post = new Promise<Response>((resolve, reject) => {
      resolvePost = resolve
      rejectPost = reject
    })
    let dataChangedCount = 0
    const onDataChanged = () => { dataChangedCount += 1 }
    window.addEventListener("goal-mate:data-changed", onDataChanged)
    const fetchMock = vi.fn((url: RequestInfo | URL) => String(url) === "/api/schedule-block"
      ? post
      : Promise.resolve(todayResponse(dateFromUrl(url))))
    vi.stubGlobal("fetch", fetchMock)
    const workspace = render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/schedule-block", expect.anything()))
    workspace.unmount()

    if (outcome === "resolve") {
      resolvePost?.(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
    } else {
      rejectPost?.(new Error("请求在卸载后失败"))
    }
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(dataChangedCount).toBe(0)
    window.removeEventListener("goal-mate:data-changed", onDataChanged)
  })

  it.each([
    ["editor", "resolve"],
    ["cancel", "reject"],
    ["completion", "resolve"],
  ] as const)("keeps a new %s mutation authoritative after a D1→D2→D1 ABA when the old request %ss", async (mode, oldOutcome) => {
    let resolveOld: ((value: Response) => void) | undefined
    let rejectOld: ((reason?: unknown) => void) | undefined
    let resolveNew: ((value: Response) => void) | undefined
    const oldPost = new Promise<Response>((resolve, reject) => {
      resolveOld = resolve
      rejectOld = reject
    })
    const newPost = new Promise<Response>(resolve => { resolveNew = resolve })
    let todayCalls = 0
    let mutationCalls = 0
    let dataChangedCount = 0
    const onDataChanged = () => { dataChangedCount += 1 }
    window.addEventListener("goal-mate:data-changed", onDataChanged)
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method) {
        mutationCalls += 1
        return mutationCalls === 1 ? oldPost : newPost
      }
      todayCalls += 1
      const date = dateFromUrl(url)
      return Promise.resolve(todayResponse(date, {
        blocks: mode === "editor" ? [] : [{
          block_id: "existing", plan_id: "existing-plan", action_id: null, title: "已有安排", goal_id: null, goal_name: null,
          energy_level: null, start_at: `${date}T00:40:00.000Z`, end_at: `${date}T01:40:00.000Z`,
          status: "scheduled", source: "manual", result_note: null, version: 1,
        }],
      }))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    const submit = async () => {
      if (mode === "editor") {
        fireEvent.click(screen.getByRole("button", { name: "安排到今天" }))
        const editor = await screen.findByRole("dialog", { name: "安排时间块" })
        fireEvent.click(within(editor).getByRole("button", { name: "确认安排" }))
        return
      }
      if (mode === "cancel") {
        fireEvent.click(await screen.findByRole("button", { name: "编辑 已有安排" }))
        const editor = await screen.findByRole("dialog", { name: "编辑时间块" })
        fireEvent.click(within(editor).getByRole("button", { name: "取消此时间块" }))
        fireEvent.click(within(editor).getByRole("button", { name: "确认取消" }))
        return
      }
      fireEvent.click(await screen.findByRole("button", { name: "完成 已有安排" }))
      const completion = await screen.findByRole("dialog", { name: "记录时间块结果" })
      fireEvent.click(within(completion).getByRole("button", { name: "保存结果" }))
    }
    const activeDialogName = mode === "completion" ? "记录时间块结果" : mode === "cancel" ? "编辑时间块" : "安排时间块"

    await screen.findAllByText("拖放计划")
    await submit()
    await waitFor(() => expect(mutationCalls).toBe(1))
    fireEvent.click(screen.getByRole("button", { name: "后一天" }))
    await waitFor(() => expect(todayCalls).toBe(2))
    fireEvent.click(screen.getByRole("button", { name: "前一天" }))
    await waitFor(() => expect(todayCalls).toBe(3))
    await submit()
    await waitFor(() => expect(mutationCalls).toBe(2))
    const newDialog = screen.getByRole("dialog", { name: activeDialogName })
    const pendingButton = within(newDialog).getByRole("button", { name: mode === "cancel" ? "确认取消" : "正在保存…" }) as HTMLButtonElement
    expect(pendingButton.disabled).toBe(true)
    fireEvent.click(pendingButton)
    expect(mutationCalls).toBe(2)

    if (oldOutcome === "resolve") {
      resolveOld?.(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
    } else {
      rejectOld?.(new Error("旧 mutation 失败"))
    }
    await Promise.resolve()
    await Promise.resolve()

    expect(todayCalls).toBe(3)
    expect(dataChangedCount).toBe(0)
    expect(screen.queryByRole("alert")).toBeNull()
    expect((within(screen.getByRole("dialog", { name: activeDialogName })).getByRole("button", { name: mode === "cancel" ? "确认取消" : "正在保存…" }) as HTMLButtonElement).disabled).toBe(true)

    resolveNew?.(new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }))
    await waitFor(() => expect(todayCalls).toBe(4))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: activeDialogName })).toBeNull())
    expect(dataChangedCount).toBe(1)
    window.removeEventListener("goal-mate:data-changed", onDataChanged)
  })

  it("clears the preview and surfaces the server message without replacing the current view", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => String(url) === "/api/schedule-block"
      ? Promise.resolve(new Response(JSON.stringify({ error: "服务器拒绝该安排" }), { status: 409, headers: { "Content-Type": "application/json" } }))
      : Promise.resolve(todayResponse(dateFromUrl(url))))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findAllByText("拖放计划")
    fireEvent.click(screen.getByRole("button", { name: "模拟开始" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟移动" }))
    fireEvent.click(screen.getByRole("button", { name: "模拟松手" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("服务器拒绝该安排"))
    expect(screen.queryByTestId("timeline-placement-preview")).toBeNull()
    expect(screen.getAllByText("拖放计划").length).toBeGreaterThan(0)
  })
})
