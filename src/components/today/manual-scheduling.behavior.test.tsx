// @vitest-environment jsdom

import { DndContext } from "@dnd-kit/core"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  PlanningPreferenceView,
  ScheduleBlockView,
  SchedulableCandidate,
  TodayView,
} from "@/lib/today/types"

import { DayTimeline } from "./day-timeline"
import { GoalCandidatePanel } from "./goal-candidate-panel"
import { InteractiveScheduleBlock } from "./interactive-schedule-block"
import { ScheduleBlockEditor } from "./schedule-block-editor"
import { ScheduleCompletionSheet } from "./schedule-completion-sheet"
import { TodayWorkspace } from "./today-workspace"

vi.mock("@/components/UserMenu", () => ({ default: () => null }))
vi.mock("./ai-workspace", async () => {
  const ReactModule = await import("react")
  return {
    AiWorkspace: function StatefulAiDouble() {
      const [draft, setDraft] = ReactModule.useState("")
      const [identity] = ReactModule.useState(() => Math.random().toString())
      return (
        <label>
          AI 草稿
          <input aria-label="AI 草稿" onChange={event => setDraft(event.currentTarget.value)} value={draft} />
          <output data-testid="ai-identity">{identity}</output>
        </label>
      )
    },
  }
})

afterEach(() => {
  cleanup()
  document.body.removeAttribute("tabindex")
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const preference: PlanningPreferenceView = {
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
}

const passiveTimelineResizeProps = {
  maximumDurationForBlock: () => null,
  onPlacementError: () => undefined,
  onResizeBlock: () => undefined,
}

const planCandidate: SchedulableCandidate = {
  kind: "plan",
  id: "plan_launch",
  plan_id: "plan_launch",
  action_id: null,
  goal_id: "goal_product",
  goal_name: "发布目标",
  goal_position: 0,
  name: "上线产品",
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
  energy_level: "high",
  effective_quadrant: "q1",
  is_recurring: false,
  version: "2026-08-23T00:00:00.000Z",
}

const actionCandidate: SchedulableCandidate = {
  ...planCandidate,
  kind: "action",
  id: "action_copy",
  action_id: "action_copy",
  name: "写发布说明",
  is_recurring: false,
}

function scheduledBlock(overrides: Partial<ScheduleBlockView> = {}): ScheduleBlockView {
  return {
    block_id: "block_copy",
    plan_id: "plan_launch",
    action_id: "action_copy",
    title: "写发布说明",
    goal_id: "goal_product",
    goal_name: "发布目标",
    energy_level: "high",
    start_at: "2026-08-23T01:00:00.000Z",
    end_at: "2026-08-23T02:00:00.000Z",
    status: "scheduled",
    source: "manual",
    result_note: null,
    version: 2,
    ...overrides,
  }
}

class TestPointerEvent extends MouseEvent {
  isPrimary: boolean
  pointerId: number
  pointerType: string

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.isPrimary = init.isPrimary ?? true
    this.pointerId = init.pointerId ?? 0
    this.pointerType = init.pointerType ?? "mouse"
  }
}

function renderResizableTimeline(options: {
  blocks?: ScheduleBlockView[]
  date?: string
  maximumDurationForBlock?: (block: ScheduleBlockView, original: { start: number; end: number }) => number | null | undefined
  preference?: PlanningPreferenceView
} = {}) {
  vi.stubGlobal("PointerEvent", TestPointerEvent)
  const onResizeBlock = vi.fn()
  const onPlacementError = vi.fn()
  const props = {
    blocks: options.blocks ?? [scheduledBlock()],
    date: options.date ?? "2026-08-23",
    error: null,
    loading: false,
    maximumDurationForBlock: options.maximumDurationForBlock ?? (() => null),
    onCompleteBlock: vi.fn(),
    onEditBlock: vi.fn(),
    onPlacementError,
    onResizeBlock,
    preference: options.preference ?? preference,
  }
  const rendered = render(<DndContext><DayTimeline {...props} /></DndContext>)
  const dropzone = screen.getByTestId("today-timeline-dropzone")
  vi.spyOn(dropzone, "getBoundingClientRect").mockReturnValue({
    bottom: 940,
    height: 840,
    left: 0,
    right: 600,
    top: 100,
    width: 600,
    x: 0,
    y: 100,
    toJSON: () => ({}),
  })
  return { ...rendered, onPlacementError, onResizeBlock, props }
}

function beginResize(handleName: string, clientY: number, pointerId = 7, init: PointerEventInit = {}) {
  const handle = screen.getByRole("button", { name: handleName })
  const setPointerCapture = vi.fn()
  const releasePointerCapture = vi.fn()
  Object.defineProperties(handle, {
    hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
    setPointerCapture: { configurable: true, value: setPointerCapture },
  })
  fireEvent.pointerDown(handle, { clientY, pointerId, ...init })
  return { handle, pointerId, releasePointerCapture, setPointerCapture }
}

function stubResizeFrames() {
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextFrame = 1
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrame++
    callbacks.set(id, callback)
    return id
  })
  const cancelAnimationFrame = vi.fn((id: number) => callbacks.delete(id))
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrame)
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame)
  return { callbacks, cancelAnimationFrame, requestAnimationFrame }
}

function todayView(date: string, blocks: ScheduleBlockView[] = [], candidates = [planCandidate, actionCandidate]): TodayView {
  return { date, preference, focus: null, candidates, blocks, checks: [] }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

function getRequestedDate(url: RequestInfo | URL): string {
  const date = new URL(String(url), "http://localhost").searchParams.get("date")
  if (date === null) throw new Error("missing date")
  return date
}

function hasInertAncestor(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (current.hasAttribute("inert")) return true
    current = current.parentElement
  }
  return false
}

describe("manual scheduling components", () => {
  it("gives both Plan and Action candidates a shared keyboard scheduling action", () => {
    const onSchedule = vi.fn()
    render(
      <DndContext>
        <GoalCandidatePanel
          candidates={[planCandidate, actionCandidate]}
          error={null}
          focus={null}
          loading={false}
          onSchedule={onSchedule}
        />
      </DndContext>,
    )

    const buttons = screen.getAllByRole("button", { name: "安排到今天" })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    expect(onSchedule).toHaveBeenNthCalledWith(1, actionCandidate)
    expect(onSchedule).toHaveBeenNthCalledWith(2, planCandidate)
  })

  it("renders positioned statuses and only a timezone-correct current-time rule on the actual date", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
    vi.setSystemTime(new Date("2026-08-23T02:15:00.000Z"))
    const onEditBlock = vi.fn()
    const onCompleteBlock = vi.fn()
    const { rerender, unmount } = render(
      <DndContext>
        <DayTimeline
          {...passiveTimelineResizeProps}
          blocks={[
            scheduledBlock(),
            scheduledBlock({ block_id: "done", title: "已完成", status: "completed" }),
            scheduledBlock({ block_id: "skip", title: "已跳过", status: "skipped" }),
          ]}
          date="2026-08-23"
          error={null}
          loading={false}
          onCompleteBlock={onCompleteBlock}
          onEditBlock={onEditBlock}
          preference={preference}
        />
      </DndContext>,
    )

    const currentTimeRule = screen.getByLabelText("当前时间 10:15")
    expect(currentTimeRule.className).toContain("left-[4.5rem]")
    expect(currentTimeRule.className).toContain("right-3")
    expect(currentTimeRule.className).toContain("border-rose-500/60")

    const currentTimeBadge = screen.getByText("当前时间")
    expect(currentTimeBadge.className).toContain("right-[4.25rem]")

    const actionGroup = screen.getByRole("button", { name: "编辑 写发布说明" }).parentElement
    expect(actionGroup).not.toBeNull()
    expect(actionGroup?.className).toContain("opacity-0")
    expect(actionGroup?.className).toContain("hover:opacity-100")
    expect(actionGroup?.className).toContain("focus-within:opacity-100")
    expect(actionGroup?.className).toContain("[@media(hover:none)]:opacity-100")
    expect(screen.getByRole("button", { name: "移动 写发布说明" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "调整 写发布说明 的开始时间" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "调整 写发布说明 的结束时间" })).toBeTruthy()
    expect(screen.getByText("写发布说明")).toBeTruthy()
    expect(screen.getByText("已完成")).toBeTruthy()
    expect(screen.getByText("已跳过")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "编辑 写发布说明" }))
    fireEvent.click(screen.getByRole("button", { name: "完成 写发布说明" }))
    expect(onEditBlock).toHaveBeenCalledWith(expect.objectContaining({ block_id: "block_copy" }))
    expect(onCompleteBlock).toHaveBeenCalledWith(expect.objectContaining({ block_id: "block_copy" }))

    rerender(
      <DndContext>
        <DayTimeline
          {...passiveTimelineResizeProps}
          blocks={[]}
          date="2026-08-22"
          error={null}
          loading={false}
          onCompleteBlock={onCompleteBlock}
          onEditBlock={onEditBlock}
          preference={preference}
        />
      </DndContext>,
    )
    expect(screen.queryByText("当前时间")).toBeNull()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps 00:00 and 24:00 labels inside the scrollable timeline", () => {
    render(
      <DndContext>
        <DayTimeline
          {...passiveTimelineResizeProps}
          blocks={[]}
          date="2026-08-23"
          error={null}
          loading={false}
          onCompleteBlock={vi.fn()}
          onEditBlock={vi.fn()}
          preference={{ ...preference, day_start_minutes: 0, day_end_minutes: 1440 }}
        />
      </DndContext>,
    )

    expect(screen.getByText("00:00").className).toContain("translate-y-0")
    expect(screen.getByText("24:00").className).toContain("-translate-y-full")
    expect(screen.getByText("01:00").className).toContain("-translate-y-1/2")
  })

  it("restores keyboard drag cancellation focus to the dedicated move control", async () => {
    render(
      <DndContext>
        <DayTimeline
          {...passiveTimelineResizeProps}
          blocks={[scheduledBlock()]}
          date="2026-08-23"
          error={null}
          loading={false}
          onCompleteBlock={vi.fn()}
          onEditBlock={vi.fn()}
          preference={preference}
        />
      </DndContext>,
    )

    const move = screen.getByRole("button", { name: "移动 写发布说明" })
    const edit = screen.getByRole("button", { name: "编辑 写发布说明" })
    move.focus()
    fireEvent.keyDown(move, { code: "Space", key: " " })
    await waitFor(() => expect(move.getAttribute("aria-pressed")).toBe("true"))
    edit.focus()
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" })

    await waitFor(() => expect(document.activeElement).toBe(move))
  })

  it("uses resize-handle keyboard controls as edit fallbacks without resizing", () => {
    const onEditBlock = vi.fn()
    render(
      <DndContext>
        <DayTimeline
          {...passiveTimelineResizeProps}
          blocks={[scheduledBlock()]}
          date="2026-08-23"
          error={null}
          loading={false}
          onCompleteBlock={vi.fn()}
          onEditBlock={onEditBlock}
          preference={preference}
        />
      </DndContext>,
    )

    const block = screen.getByRole("article", { name: "写发布说明，已安排" })
    const start = within(block).getByRole("button", { name: "调整 写发布说明 的开始时间" })
    const end = within(block).getByRole("button", { name: "调整 写发布说明 的结束时间" })
    fireEvent.keyDown(start, { code: "Enter", key: "Enter" })
    fireEvent.keyDown(end, { code: "Space", key: " " })

    expect(onEditBlock).toHaveBeenNthCalledWith(1, expect.objectContaining({ block_id: "block_copy" }))
    expect(onEditBlock).toHaveBeenNthCalledWith(2, expect.objectContaining({ block_id: "block_copy" }))
    expect(onEditBlock).toHaveBeenCalledTimes(2)
  })

  it("keeps resize handles outside the fixed middle content safety zone", () => {
    render(
      <DndContext>
        <DayTimeline
          {...passiveTimelineResizeProps}
          blocks={[scheduledBlock()]}
          date="2026-08-23"
          error={null}
          loading={false}
          onCompleteBlock={vi.fn()}
          onEditBlock={vi.fn()}
          preference={preference}
        />
      </DndContext>,
    )

    const block = screen.getByRole("article", { name: "写发布说明，已安排" })
    const start = within(block).getByRole("button", { name: "调整 写发布说明 的开始时间" })
    const end = within(block).getByRole("button", { name: "调整 写发布说明 的结束时间" })
    const content = block.children.item(2)
    expect(start.className).toContain("h-3")
    expect(start.className).toContain("z-10")
    expect(end.className).toContain("h-3")
    expect(end.className).toContain("z-10")
    expect(content?.className).toContain("absolute")
    expect(content?.className).toContain("inset-x-3")
    expect(content?.className).toContain("top-3")
    expect(content?.className).toContain("bottom-3")
    expect(content?.className).toContain("z-20")
    expect(content?.className).toContain("overflow-hidden")
    expect(within(block).getByRole("button", { name: "移动 写发布说明" })).toBeTruthy()
    expect(within(block).getByRole("button", { name: "编辑 写发布说明" })).toBeTruthy()
    expect(within(block).getByRole("button", { name: "完成 写发布说明" })).toBeTruthy()
  })

  it("routes only resize-handle pointer presses to resize callbacks", () => {
    const block = scheduledBlock()
    const onResizePointerDown = vi.fn()
    render(
      <DndContext>
        <InteractiveScheduleBlock
          block={block}
          disabled={false}
          localRange={{ start: 540, end: 600 }}
          onComplete={vi.fn()}
          onEdit={vi.fn()}
          onResizePointerDown={onResizePointerDown}
          statusClassName="border-violet-200"
          statusLabel="已安排"
          style={{ height: 48, top: 0 }}
        />
      </DndContext>,
    )

    const scheduled = screen.getByRole("article", { name: "写发布说明，已安排" })
    fireEvent.pointerDown(within(scheduled).getByRole("button", { name: "调整 写发布说明 的开始时间" }))
    fireEvent.pointerDown(within(scheduled).getByRole("button", { name: "调整 写发布说明 的结束时间" }))
    expect(onResizePointerDown).toHaveBeenNthCalledWith(1, block, "start", expect.any(Object))
    expect(onResizePointerDown).toHaveBeenNthCalledWith(2, block, "end", expect.any(Object))

    fireEvent.pointerDown(within(scheduled).getByRole("button", { name: "移动 写发布说明" }))
    fireEvent.pointerDown(within(scheduled).getByRole("button", { name: "编辑 写发布说明" }))
    fireEvent.pointerDown(within(scheduled).getByRole("button", { name: "完成 写发布说明" }))
    expect(onResizePointerDown).toHaveBeenCalledTimes(2)
  })

  it.each([
    ["start", "调整 写发布说明 的开始时间", 175, { start: 555, end: 600 }],
    ["end", "调整 写发布说明 的结束时间", 235, { start: 540, end: 615 }],
  ] as const)("resizes the %s edge on the real quarter-hour timeline geometry", (_edge, handleName, clientY, expectedRange) => {
    const { onPlacementError, onResizeBlock } = renderResizableTimeline()
    const { setPointerCapture } = beginResize(handleName, clientY)
    expect(setPointerCapture).toHaveBeenCalledWith(7)
    fireEvent.pointerMove(window, { clientY, pointerId: 7 })
    expect(screen.getByTestId("timeline-placement-preview").textContent).toContain(
      `${expectedRange.start === 555 ? "09:15" : "09:00"}–${expectedRange.end === 615 ? "10:15" : "10:00"}`,
    )
    fireEvent.pointerUp(window, { clientY, pointerId: 7 })

    expect(onResizeBlock).toHaveBeenCalledWith(expect.objectContaining({ block_id: "block_copy" }), expectedRange)
    expect(onPlacementError).not.toHaveBeenCalled()
  })

  it.each([
    ["调整 写发布说明 的开始时间", 220, { start: 585, end: 600 }],
    ["调整 写发布说明 的结束时间", 160, { start: 540, end: 555 }],
  ] as const)("keeps a resized block at least one 15-minute slot via %s", (handleName, clientY, expectedRange) => {
    const { onResizeBlock } = renderResizableTimeline()
    beginResize(handleName, clientY)
    fireEvent.pointerMove(window, { clientY, pointerId: 7 })
    fireEvent.pointerUp(window, { clientY, pointerId: 7 })
    expect(onResizeBlock).toHaveBeenCalledWith(expect.anything(), expectedRange)
  })

  it.each([
    ["mouse click", { pointerType: "mouse" }],
    ["touch tap", { pointerType: "touch" }],
  ] as const)("treats a stationary primary %s as a no-op", (_label, pointerInit) => {
    const { callbacks, cancelAnimationFrame } = stubResizeFrames()
    const { onPlacementError, onResizeBlock } = renderResizableTimeline()
    beginResize("调整 写发布说明 的结束时间", 220, 7, pointerInit)
    expect(screen.getByTestId("timeline-placement-preview")).toBeTruthy()
    fireEvent.pointerUp(window, { clientY: 220, pointerId: 7, ...pointerInit })
    expect(onResizeBlock).not.toHaveBeenCalled()
    expect(onPlacementError).not.toHaveBeenCalled()
    expect(screen.queryByTestId("timeline-placement-preview")).toBeNull()
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(callbacks.size).toBe(0)
  })

  it.each([
    ["right click", { button: 2 }],
    ["non-primary pointer", { isPrimary: false }],
  ] as const)("does not start resize for a %s", (_label, pointerInit) => {
    const { callbacks } = stubResizeFrames()
    const { onPlacementError, onResizeBlock } = renderResizableTimeline()
    const { setPointerCapture } = beginResize("调整 写发布说明 的结束时间", 235, 7, pointerInit)
    expect(setPointerCapture).not.toHaveBeenCalled()
    expect(screen.queryByTestId("timeline-placement-preview")).toBeNull()
    expect(callbacks.size).toBe(0)
    fireEvent.pointerUp(window, { clientY: 235, pointerId: 7, ...pointerInit })
    expect(onResizeBlock).not.toHaveBeenCalled()
    expect(onPlacementError).not.toHaveBeenCalled()
  })

  it("rejects a legacy block that is off the current preference grid before capture", () => {
    const { callbacks } = stubResizeFrames()
    const shiftedPreference = { ...preference, day_start_minutes: 490, day_end_minutes: 1330 }
    const { onPlacementError, onResizeBlock } = renderResizableTimeline({ preference: shiftedPreference })
    const handle = screen.getByRole("button", { name: "调整 写发布说明 的结束时间" })
    const setPointerCapture = vi.fn()
    Object.defineProperty(handle, "setPointerCapture", { configurable: true, value: setPointerCapture })

    expect(() => fireEvent.pointerDown(handle, { button: 0, clientY: 220, isPrimary: true, pointerId: 7 })).not.toThrow()
    expect(setPointerCapture).not.toHaveBeenCalled()
    expect(callbacks.size).toBe(0)
    expect(screen.queryByTestId("timeline-placement-preview")).toBeNull()
    expect(onPlacementError).toHaveBeenCalledWith("该时间块不在当前15分钟刻度上，请先移动到新刻度后再调整长度")
    expect(onResizeBlock).not.toHaveBeenCalled()
  })

  it("ignores move and up events from another pointer while keeping the active resize", () => {
    const { onPlacementError, onResizeBlock } = renderResizableTimeline()
    beginResize("调整 写发布说明 的结束时间", 220, 7)
    fireEvent.pointerMove(window, { clientY: 235, pointerId: 8 })
    expect(screen.getByTestId("timeline-placement-preview").textContent).toContain("09:00–10:00")
    fireEvent.pointerUp(window, { clientY: 235, pointerId: 8 })
    expect(screen.getByTestId("timeline-placement-preview")).toBeTruthy()
    expect(onResizeBlock).not.toHaveBeenCalled()
    expect(onPlacementError).not.toHaveBeenCalled()
    fireEvent.pointerCancel(window, { clientY: 220, pointerId: 7 })
    expect(screen.queryByTestId("timeline-placement-preview")).toBeNull()
  })

  it("cleans an active resize on lostpointercapture without committing", () => {
    const { callbacks, cancelAnimationFrame } = stubResizeFrames()
    const { onPlacementError, onResizeBlock } = renderResizableTimeline()
    const { handle } = beginResize("调整 写发布说明 的结束时间", 235, 7)
    fireEvent.pointerMove(window, { clientY: 235, pointerId: 7 })
    fireEvent.lostPointerCapture(handle, { pointerId: 7 })
    expect(screen.queryByTestId("timeline-placement-preview")).toBeNull()
    expect(onResizeBlock).not.toHaveBeenCalled()
    expect(onPlacementError).not.toHaveBeenCalled()
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(callbacks.size).toBe(0)
  })

  it("does not recursively clean when releasing capture emits lostpointercapture", () => {
    const { onResizeBlock } = renderResizableTimeline()
    const { handle } = beginResize("调整 写发布说明 的结束时间", 235, 7)
    const releasePointerCapture = vi.fn(() => {
      fireEvent.lostPointerCapture(handle, { pointerId: 7 })
    })
    Object.defineProperty(handle, "releasePointerCapture", { configurable: true, value: releasePointerCapture })
    expect(() => fireEvent.pointerCancel(window, { pointerId: 7 })).not.toThrow()
    expect(releasePointerCapture).toHaveBeenCalledTimes(1)
    expect(onResizeBlock).not.toHaveBeenCalled()
  })

  it("renders a red conflicting resize preview and reports the placement error without committing", () => {
    const conflict = scheduledBlock({
      block_id: "conflict",
      plan_id: "other",
      action_id: null,
      title: "已有冲突",
      start_at: "2026-08-23T00:30:00.000Z",
      end_at: "2026-08-23T01:00:00.000Z",
    })
    const { onPlacementError, onResizeBlock } = renderResizableTimeline({ blocks: [scheduledBlock(), conflict] })
    beginResize("调整 写发布说明 的开始时间", 145)
    fireEvent.pointerMove(window, { clientY: 145, pointerId: 7 })
    const preview = screen.getByTestId("timeline-placement-preview")
    expect(preview.dataset.valid).toBe("false")
    expect(preview.textContent).toContain("冲突")
    fireEvent.pointerUp(window, { clientY: 145, pointerId: 7 })
    expect(onResizeBlock).not.toHaveBeenCalled()
    expect(onPlacementError).toHaveBeenCalledWith(expect.stringContaining("冲突"))
  })

  it("enforces the candidate maximum while resizing", () => {
    const { onPlacementError, onResizeBlock } = renderResizableTimeline({ maximumDurationForBlock: () => 60 })
    beginResize("调整 写发布说明 的结束时间", 235)
    fireEvent.pointerMove(window, { clientY: 235, pointerId: 7 })
    expect(screen.getByTestId("timeline-placement-preview").dataset.valid).toBe("false")
    fireEvent.pointerUp(window, { clientY: 235, pointerId: 7 })
    expect(onResizeBlock).not.toHaveBeenCalled()
    expect(onPlacementError).toHaveBeenCalledWith(expect.stringContaining("剩余可安排时间"))
  })

  it.each(["pointercancel", "Escape"] as const)("clears an active resize on %s without committing", cancellation => {
    const { onPlacementError, onResizeBlock } = renderResizableTimeline()
    const { releasePointerCapture } = beginResize("调整 写发布说明 的结束时间", 235)
    fireEvent.pointerMove(window, { clientY: 235, pointerId: 7 })
    expect(screen.getByTestId("timeline-placement-preview")).toBeTruthy()
    if (cancellation === "pointercancel") {
      fireEvent.pointerCancel(window, { clientY: 235, pointerId: 7 })
    } else {
      fireEvent.keyDown(window, { code: "Escape", key: "Escape" })
    }
    expect(screen.queryByTestId("timeline-placement-preview")).toBeNull()
    expect(releasePointerCapture).toHaveBeenCalledWith(7)
    expect(onResizeBlock).not.toHaveBeenCalled()
    expect(onPlacementError).not.toHaveBeenCalled()
  })

  it("clears resize listeners when the date changes or the timeline unmounts", () => {
    const first = renderResizableTimeline()
    beginResize("调整 写发布说明 的结束时间", 235)
    first.rerender(
      <DndContext>
        <DayTimeline {...first.props} date="2026-08-24" />
      </DndContext>,
    )
    fireEvent.pointerUp(window, { clientY: 235, pointerId: 7 })
    expect(first.onResizeBlock).not.toHaveBeenCalled()
    first.unmount()

    const second = renderResizableTimeline()
    beginResize("调整 写发布说明 的结束时间", 235)
    second.unmount()
    fireEvent.pointerUp(window, { clientY: 235, pointerId: 7 })
    expect(second.onResizeBlock).not.toHaveBeenCalled()
  })

  it.each([
    ["top", 105, 30, 18],
    ["bottom", 295, 0, 12],
    ["bottom clamp", 295, 795, 800],
    ["top boundary", 105, 0, 0],
  ] as const)("auto-scrolls at the %s edge by at most 12px and clamps the viewport", (_label, clientY, initialScrollTop, expectedScrollTop) => {
    const { callbacks, cancelAnimationFrame } = stubResizeFrames()
    renderResizableTimeline()
    const viewport = screen.getByTestId("today-timeline-scroll")
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1000 },
    })
    viewport.scrollTop = initialScrollTop
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      bottom: 300,
      height: 200,
      left: 0,
      right: 600,
      top: 100,
      width: 600,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    })
    beginResize("调整 写发布说明 的结束时间", clientY)
    expect(callbacks.size).toBe(1)
    const [frameId, callback] = [...callbacks.entries()][0]
    callbacks.delete(frameId)
    act(() => callback(16))
    expect(viewport.scrollTop).toBe(expectedScrollTop)
    expect(callbacks.size).toBe(1)
    fireEvent.pointerCancel(window, { clientY, pointerId: 7 })
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(callbacks.size).toBe(0)
  })

  it("uses a compact single line for the 15-minute content safety zone and keeps longer blocks double-line", () => {
    const timelineProps = {
      ...passiveTimelineResizeProps,
      date: "2026-08-23",
      error: null,
      loading: false,
      onCompleteBlock: vi.fn(),
      onEditBlock: vi.fn(),
      preference,
    }
    const { rerender } = render(
      <DndContext>
        <DayTimeline
          {...timelineProps}
          blocks={[scheduledBlock({ end_at: "2026-08-23T01:15:00.000Z" })]}
        />
      </DndContext>,
    )

    const compactBlock = screen.getByRole("article", { name: "写发布说明，已安排" })
    const compactContent = compactBlock.children.item(2)
    const compactSummary = screen.getByText("09:00–09:15 · 已安排")
    expect(screen.getByText("写发布说明")).toBeTruthy()
    expect(compactSummary).toBeTruthy()
    expect(compactContent?.className).toContain("items-center")
    expect(compactSummary.className).toContain("whitespace-nowrap")
    expect(compactSummary.parentElement?.className).toContain("flex")
    expect(compactSummary.parentElement?.className).toContain("items-center")
    expect(within(compactBlock).getByRole("button", { name: "移动 写发布说明" }).parentElement?.className).toContain("items-center")

    rerender(
      <DndContext>
        <DayTimeline {...timelineProps} blocks={[scheduledBlock()]} />
      </DndContext>,
    )

    const longBlock = screen.getByRole("article", { name: "写发布说明，已安排" })
    const longContent = longBlock.children.item(2)
    expect(longContent?.className).toContain("items-start")
    expect(screen.getByText("09:00–10:00 · 已安排").className).toContain("mt-0.5")
  })

  it("renders the full-day quarter-hour grid with emphasized boundaries", () => {
    render(
      <DndContext>
        <DayTimeline
          {...passiveTimelineResizeProps}
          blocks={[]}
          date="2026-08-23"
          error={null}
          loading={false}
          onCompleteBlock={vi.fn()}
          onEditBlock={vi.fn()}
          preference={{ ...preference, day_start_minutes: 0, day_end_minutes: 1440 }}
        />
      </DndContext>,
    )

    expect(screen.getAllByTestId("timeline-grid-line")).toHaveLength(97)
    expect(screen.getByTestId("timeline-grid-0").getAttribute("data-emphasis")).toBe("hour")
    expect(screen.getByTestId("timeline-grid-30").getAttribute("data-emphasis")).toBe("half")
    expect(screen.getByTestId("timeline-grid-45").getAttribute("data-emphasis")).toBe("quarter")
  })

  it("auto-positions today's 24-hour timeline once without overriding later user scrolling", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
    vi.setSystemTime(new Date("2026-08-23T02:15:00.000Z"))
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600)
    const timelineProps = {
      ...passiveTimelineResizeProps,
      error: null,
      loading: false,
      onCompleteBlock: vi.fn(),
      onEditBlock: vi.fn(),
      preference: { ...preference, day_start_minutes: 0, day_end_minutes: 1440 },
    }
    const { rerender } = render(
      <DndContext>
        <DayTimeline {...timelineProps} blocks={[]} date="2026-08-23" />
      </DndContext>,
    )
    const viewport = screen.getByTestId("today-timeline-scroll")

    expect(viewport.scrollTop).toBe(1668)
    viewport.scrollTop = 123
    rerender(
      <DndContext>
        <DayTimeline {...timelineProps} blocks={[scheduledBlock()]} date="2026-08-23" />
      </DndContext>,
    )
    expect(viewport.scrollTop).toBe(123)
  })

  it("keeps a non-today 24-hour timeline at the top", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
    vi.setSystemTime(new Date("2026-08-23T02:15:00.000Z"))
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600)

    render(
      <DndContext>
        <DayTimeline
          {...passiveTimelineResizeProps}
          blocks={[]}
          date="2026-08-22"
          error={null}
          loading={false}
          onCompleteBlock={vi.fn()}
          onEditBlock={vi.fn()}
          preference={{ ...preference, day_start_minutes: 0, day_end_minutes: 1440 }}
        />
      </DndContext>,
    )

    expect(screen.getByTestId("today-timeline-scroll").scrollTop).toBe(0)
  })

  it("keeps a scheduled block above overlapping terminal history without terminal pointer interception", () => {
    const onEditBlock = vi.fn()
    const onCompleteBlock = vi.fn()
    render(
      <DndContext>
        <DayTimeline
          {...passiveTimelineResizeProps}
          blocks={[
            scheduledBlock({ block_id: "a", title: "当前安排" }),
            scheduledBlock({ block_id: "z-cancelled", title: "已取消历史", status: "cancelled" }),
            scheduledBlock({ block_id: "z-skipped", title: "已跳过历史", status: "skipped" }),
            scheduledBlock({ block_id: "z-completed", title: "已完成历史", status: "completed" }),
            scheduledBlock({ block_id: "z-partial", title: "部分完成历史", status: "partial" }),
          ]}
          date="2026-08-23"
          error={null}
          loading={false}
          onCompleteBlock={onCompleteBlock}
          onEditBlock={onEditBlock}
          preference={preference}
        />
      </DndContext>,
    )

    const scheduled = screen.getByRole("article", { name: "当前安排，已安排" })
    expect(scheduled.className).toContain("z-20")
    expect(scheduled.className).toContain("pointer-events-auto")

    for (const name of ["已取消历史，已取消", "已跳过历史，已跳过", "已完成历史，已完成", "部分完成历史，部分完成"]) {
      const terminal = screen.getByRole("article", { name })
      expect(terminal.className).toContain("z-10")
      expect(terminal.className).toContain("pointer-events-none")
      expect(terminal.getAttribute("tabindex")).toBeNull()
      expect(within(terminal).queryByRole("button")).toBeNull()
      expect(within(terminal).queryByRole("button", { name: /移动|调整/ })).toBeNull()
    }

    fireEvent.click(within(scheduled).getByRole("button", { name: "编辑 当前安排" }))
    expect(onEditBlock).toHaveBeenCalledWith(expect.objectContaining({ block_id: "a" }))
  })

  it("gives adjacent 15-minute scheduled blocks non-overlapping interactive geometry", () => {
    render(
      <DndContext>
        <DayTimeline
          {...passiveTimelineResizeProps}
          blocks={[
            scheduledBlock({
              block_id: "first",
              title: "第一刻度",
              start_at: "2026-08-23T01:00:00.000Z",
              end_at: "2026-08-23T01:15:00.000Z",
            }),
            scheduledBlock({
              block_id: "second",
              title: "第二刻度",
              start_at: "2026-08-23T01:15:00.000Z",
              end_at: "2026-08-23T01:30:00.000Z",
            }),
          ]}
          date="2026-08-23"
          error={null}
          loading={false}
          onCompleteBlock={vi.fn()}
          onEditBlock={vi.fn()}
          preference={{ ...preference, day_end_minutes: 1321 }}
        />
      </DndContext>,
    )

    const trackHeight = Number.parseFloat(screen.getByTestId("today-timeline-dropzone").style.minHeight)
    const first = screen.getByRole("article", { name: "第一刻度，已安排" })
    const second = screen.getByRole("article", { name: "第二刻度，已安排" })
    const firstTop = Number.parseFloat(first.style.top) / 100 * trackHeight
    const firstCssHeight = Number.parseFloat(first.style.height) / 100 * trackHeight
    const firstActualHeight = Math.max(firstCssHeight, Number.parseFloat(first.style.minHeight))
    const secondTop = Number.parseFloat(second.style.top) / 100 * trackHeight

    expect(firstActualHeight).toBeGreaterThanOrEqual(48)
    expect(firstTop + firstActualHeight).toBeLessThanOrEqual(secondTop)
    expect(within(first).getByRole("button", { name: "编辑 第一刻度" })).toBeTruthy()
    expect(within(second).getByRole("button", { name: "完成 第二刻度" })).toBeTruthy()
  })

  it("validates create time locally and submits normalized UTC only after confirmation", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <ScheduleBlockEditor
        block={null}
        candidate={planCandidate}
        date="2026-03-08"
        error={null}
        initialEndMinutes={180}
        initialStartMinutes={150}
        loading={false}
        onCancelBlock={vi.fn()}
        onClose={vi.fn()}
        onIntentChange={vi.fn()}
        onSubmit={onSubmit}
        preference={{ ...preference, timezone: "America/New_York", day_start_minutes: 0, day_end_minutes: 600 }}
      />,
    )

    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))
    expect((await screen.findByRole("alert")).textContent).toContain("本地时间不存在")
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "03:00" } })
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "04:00" } })
    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      start_at: "2026-03-08T07:00:00.000Z",
      end_at: "2026-03-08T08:00:00.000Z",
    }))
  })

  it("warns when a new ordinary block exceeds available time without blocking submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <ScheduleBlockEditor
        block={null}
        candidate={{
          ...planCandidate,
          estimated_minutes: 300,
          remaining_minutes: 30,
          available_minutes: 30,
          suggested_block_minutes: 30,
        }}
        date="2026-08-23"
        error={null}
        initialEndMinutes={570}
        initialStartMinutes={540}
        loading={false}
        onCancelBlock={vi.fn()}
        onClose={vi.fn()}
        onIntentChange={vi.fn()}
        onSubmit={onSubmit}
        preference={preference}
      />,
    )

    expect(screen.queryByText("本次安排将超出可用预计时间 30 分钟")).toBeNull()
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "10:00" } })
    const warning = screen.getByRole("status")
    expect(warning.textContent).toContain("本次安排将超出可用预计时间 30 分钟")
    expect(warning.getAttribute("aria-live")).toBe("polite")
    const submit = screen.getByRole("button", { name: "确认安排" }) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      start_at: "2026-08-23T01:00:00.000Z",
      end_at: "2026-08-23T02:00:00.000Z",
    }))
  })

  it.each([
    ["未对齐刻度", "09:01", "10:01", "时间必须对齐 15 分钟刻度"],
    ["超出规划范围", "21:30", "22:30", "时间必须位于当天规划范围内"],
  ])("does not show a budget warning for %s input and keeps the validation error", async (_label, start, end, message) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <ScheduleBlockEditor
        block={null}
        candidate={{
          ...planCandidate,
          estimated_minutes: 300,
          remaining_minutes: 30,
          available_minutes: 30,
          suggested_block_minutes: 30,
        }}
        date="2026-08-23"
        error={null}
        initialEndMinutes={570}
        initialStartMinutes={540}
        loading={false}
        onCancelBlock={vi.fn()}
        onClose={vi.fn()}
        onIntentChange={vi.fn()}
        onSubmit={onSubmit}
        preference={preference}
      />,
    )

    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: start } })
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: end } })
    expect(screen.queryByText(/本次安排将超出可用预计时间/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))
    expect((await screen.findByRole("alert")).textContent).toContain(message)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("does not show a plan-budget warning for a recurring candidate", () => {
    render(
      <ScheduleBlockEditor
        block={null}
        candidate={{
          ...planCandidate,
          estimated_minutes: null,
          remaining_minutes: null,
          available_minutes: null,
          suggested_block_minutes: 30,
          is_recurring: true,
        }}
        date="2026-08-23"
        error={null}
        initialEndMinutes={570}
        initialStartMinutes={540}
        loading={false}
        onCancelBlock={vi.fn()}
        onClose={vi.fn()}
        onIntentChange={vi.fn()}
        onSubmit={vi.fn()}
        preference={preference}
      />,
    )

    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "10:00" } })
    expect(screen.queryByText(/本次安排将超出可用预计时间/)).toBeNull()
  })

  it("does not show a plan-budget warning when editing an existing block", () => {
    render(
      <ScheduleBlockEditor
        block={scheduledBlock()}
        candidate={null}
        date="2026-08-23"
        error={null}
        initialEndMinutes={570}
        initialStartMinutes={540}
        loading={false}
        onCancelBlock={vi.fn()}
        onClose={vi.fn()}
        onIntentChange={vi.fn()}
        onSubmit={vi.fn()}
        preference={preference}
      />,
    )

    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "11:00" } })
    expect(screen.queryByText(/本次安排将超出可用预计时间/)).toBeNull()
  })

  it("does not close an in-flight editor on Escape", () => {
    const onClose = vi.fn()
    render(
      <ScheduleBlockEditor
        block={null}
        candidate={planCandidate}
        date="2026-08-23"
        error={null}
        initialEndMinutes={600}
        initialStartMinutes={540}
        loading
        onCancelBlock={vi.fn()}
        onClose={onClose}
        onIntentChange={vi.fn()}
        onSubmit={vi.fn()}
        preference={preference}
      />,
    )
    fireEvent.keyDown(screen.getByRole("dialog", { name: "安排时间块" }), { key: "Escape" })
    expect(onClose).not.toHaveBeenCalled()
  })

  it("shows plan progress only for a direct ordinary Plan and exposes all outcomes", () => {
    const { rerender } = render(
      <ScheduleCompletionSheet
        block={scheduledBlock({ action_id: null, title: "上线产品" })}
        error={null}
        isOrdinaryPlan
        loading={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByRole("radio", { name: "完成" }).getAttribute("value")).toBe("completed")
    expect(screen.getByRole("radio", { name: "部分完成" }).getAttribute("value")).toBe("partial")
    expect(screen.getByRole("radio", { name: "跳过" }).getAttribute("value")).toBe("skipped")
    expect(screen.getByLabelText("计划进度")).toBeTruthy()

    rerender(
      <ScheduleCompletionSheet
        block={scheduledBlock()}
        error={null}
        isOrdinaryPlan={false}
        loading={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText("计划进度")).toBeNull()
  })

  it("omits progress content and thinking when skipped while preserving drafts for another outcome", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <ScheduleCompletionSheet
        block={scheduledBlock()}
        error={null}
        isOrdinaryPlan={false}
        loading={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText("完成内容"), { target: { value: "保留的内容草稿" } })
    fireEvent.change(screen.getByLabelText("过程思考"), { target: { value: "保留的思考草稿" } })
    fireEvent.change(screen.getByLabelText("结果备注"), { target: { value: "跳过原因" } })
    fireEvent.click(screen.getByRole("radio", { name: "跳过" }))
    expect(screen.queryByLabelText("完成内容")).toBeNull()
    expect(screen.queryByLabelText("过程思考")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "保存结果" }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      block_id: "block_copy",
      expected_version: 2,
      outcome: "skipped",
      result_note: "跳过原因",
    }))

    fireEvent.click(screen.getByRole("radio", { name: "部分完成" }))
    expect((screen.getByLabelText("完成内容") as HTMLTextAreaElement).value).toBe("保留的内容草稿")
    expect((screen.getByLabelText("过程思考") as HTMLTextAreaElement).value).toBe("保留的思考草稿")
  })
})

describe("TodayWorkspace manual scheduling orchestration", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-23T02:00:00.000Z"))
  })

  it("creates from an 08:10-origin preference using the same valid relative grid", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-23T02:00:00.000Z"))
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "offset-key") })
    const writes: Record<string, unknown>[] = []
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        return jsonResponse({
          ...todayView(getRequestedDate(url), [], [{
            ...planCandidate,
            estimated_minutes: 300,
            remaining_minutes: 240,
            available_minutes: 240,
            suggested_block_minutes: 30,
          }]),
          preference: { ...preference, day_start_minutes: 490, day_end_minutes: 610 },
        })
      }
      writes.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return jsonResponse({ error: "测试冲突", code: "SCHEDULE_CONFLICT" }, 409)
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    const trigger = await screen.findByRole("button", { name: "安排到今天" })
    fireEvent.click(trigger)
    expect((screen.getByLabelText("开始时间") as HTMLInputElement).value).toBe("08:10")
    expect((screen.getByLabelText("结束时间") as HTMLInputElement).value).toBe("08:40")
    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual(expect.objectContaining({
      start_at: "2026-08-23T00:10:00.000Z",
      end_at: "2026-08-23T00:40:00.000Z",
    }))
  })

  it("traps editor focus, inerts the background, closes on Escape, and restores the scheduling trigger", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "focus-key") })
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => jsonResponse(todayView(
      getRequestedDate(url),
      [],
      [planCandidate],
    ))))
    render(<TodayWorkspace />)

    const trigger = await screen.findByRole("button", { name: "安排到今天" })
    const header = document.querySelector("header")
    header?.setAttribute("inert", "preexisting")
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole("dialog", { name: "安排时间块" })
    const start = within(dialog).getByLabelText("开始时间")
    await waitFor(() => expect(document.activeElement).toBe(start))
    expect(hasInertAncestor(trigger)).toBe(true)
    fireEvent.keyDown(trigger, { key: "Enter" })
    expect(screen.getByRole("dialog", { name: "安排时间块" })).toBe(dialog)
    expect(vi.mocked(crypto.randomUUID)).toHaveBeenCalledTimes(1)

    const firstClose = within(dialog).getAllByRole("button", { name: "关闭" })[0]
    firstClose.focus()
    fireEvent.keyDown(firstClose, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "确认安排" }))

    start.focus()
    fireEvent.keyDown(start, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "安排时间块" })).toBeNull())
    expect(document.activeElement).toBe(trigger)
    expect(hasInertAncestor(trigger)).toBe(false)
    expect(header?.getAttribute("inert")).toBe("preexisting")
  })

  it("moves completion-sheet focus inside, inerts the background, and restores its trigger", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => jsonResponse(todayView(
      getRequestedDate(url),
      [scheduledBlock()],
      [planCandidate],
    ))))
    render(<TodayWorkspace />)

    const trigger = await screen.findByRole("button", { name: "完成 写发布说明" })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole("dialog", { name: "记录时间块结果" })
    const firstOutcome = within(dialog).getByRole("radio", { name: "完成" })
    await waitFor(() => expect(document.activeElement).toBe(firstOutcome))
    expect(hasInertAncestor(trigger)).toBe(true)
    fireEvent.keyDown(firstOutcome, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "记录时间块结果" })).toBeNull())
    expect(document.activeElement).toBe(trigger)
    expect(hasInertAncestor(trigger)).toBe(false)
  })

  it("recaptures editor focus after a deferred 409 and handles Escape at document capture", async () => {
    let resolveMutation: ((response: Response) => void) | undefined
    const mutationResponse = new Promise<Response>((resolve) => {
      resolveMutation = resolve
    })
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "deferred-editor-key") })
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method) return mutationResponse
      return jsonResponse(todayView(getRequestedDate(url), [], [planCandidate]))
    }))
    render(<TodayWorkspace />)

    const trigger = await screen.findByRole("button", { name: "安排到今天" })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole("dialog", { name: "安排时间块" })
    const submit = within(dialog).getByRole("button", { name: "确认安排" }) as HTMLButtonElement
    submit.focus()
    fireEvent.click(submit)
    await waitFor(() => expect(submit.disabled).toBe(true))

    document.body.tabIndex = -1
    document.body.focus()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.getByRole("dialog", { name: "安排时间块" })).toBe(dialog)

    await act(async () => {
      resolveMutation?.(jsonResponse({ error: "版本已过期", code: "STALE_VERSION" }, 409))
      await mutationResponse
    })
    expect((await within(dialog).findByRole("alert")).textContent).toContain("版本已过期")
    await waitFor(() => expect(submit.disabled).toBe(false))
    expect(dialog.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "安排时间块" })).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it("recaptures completion-sheet focus after a deferred 409 and restores its trigger", async () => {
    let resolveMutation: ((response: Response) => void) | undefined
    const mutationResponse = new Promise<Response>((resolve) => {
      resolveMutation = resolve
    })
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method) return mutationResponse
      return jsonResponse(todayView(getRequestedDate(url), [scheduledBlock()], [planCandidate]))
    }))
    render(<TodayWorkspace />)

    const trigger = await screen.findByRole("button", { name: "完成 写发布说明" })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole("dialog", { name: "记录时间块结果" })
    const submit = within(dialog).getByRole("button", { name: "保存结果" }) as HTMLButtonElement
    submit.focus()
    fireEvent.click(submit)
    await waitFor(() => expect(submit.disabled).toBe(true))

    document.body.tabIndex = -1
    document.body.focus()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.getByRole("dialog", { name: "记录时间块结果" })).toBe(dialog)

    await act(async () => {
      resolveMutation?.(jsonResponse({ error: "版本已过期", code: "STALE_VERSION" }, 409))
      await mutationResponse
    })
    expect((await within(dialog).findByRole("alert")).textContent).toContain("版本已过期")
    await waitFor(() => expect(submit.disabled).toBe(false))
    expect(dialog.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "记录时间块结果" })).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it("shows a scoped error instead of opening an editor when the configured day is full", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-23T02:00:00.000Z"))
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => jsonResponse(todayView(
      getRequestedDate(url),
      [scheduledBlock({
        block_id: "full-day",
        action_id: null,
        start_at: "2026-08-23T00:00:00.000Z",
        end_at: "2026-08-23T14:00:00.000Z",
      })],
      [planCandidate],
    )))
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findByRole("button", { name: "安排到今天" })
    fireEvent.click(screen.getByRole("button", { name: "安排到今天" }))
    expect(screen.getByRole("alert").textContent).toContain("没有足够的无冲突时间")
    expect(screen.queryByRole("dialog", { name: "安排时间块" })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not write until confirm, keeps a stable key on 409 retry, rotates it on time change, and preserves AI state", async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce("key-first")
      .mockReturnValueOnce("key-start-change")
      .mockReturnValueOnce("key-time-change")
    vi.stubGlobal("crypto", { randomUUID })
    const writes: Array<{ headers: Headers; body: Record<string, unknown> }> = []
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return jsonResponse(todayView(getRequestedDate(url), [], [planCandidate]))
      const headers = new Headers(init.headers)
      writes.push({ headers, body: JSON.parse(String(init.body)) as Record<string, unknown> })
      return jsonResponse({ error: "时间冲突", code: "SCHEDULE_CONFLICT" }, 409)
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    expect((await screen.findAllByText("上线产品")).length).toBeGreaterThan(0)
    const aiInput = screen.getByLabelText("AI 草稿") as HTMLInputElement
    const aiIdentity = screen.getByTestId("ai-identity").textContent
    fireEvent.change(aiInput, { target: { value: "保留聊天状态" } })
    fireEvent.click(screen.getByRole("button", { name: "安排到今天" }))
    expect(writes).toHaveLength(0)
    expect(screen.getByRole("dialog", { name: "安排时间块" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))
    expect((await screen.findByRole("alert")).textContent).toContain("时间冲突")
    expect(writes).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[0].headers.get("Idempotency-Key")).toBe("key-first")
    expect(writes[1].headers.get("Idempotency-Key")).toBe("key-first")

    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "09:15" } })
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "10:15" } })
    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))
    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes[2].headers.get("Idempotency-Key")).toBe("key-time-change")
    expect(screen.getByTestId("ai-identity").textContent).toBe(aiIdentity)
    expect((screen.getByLabelText("AI 草稿") as HTMLInputElement).value).toBe("保留聊天状态")
  })

  it("refetches, dispatches a data event, and closes the editor after create succeeds", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "create-key") })
    let created = false
    const changed = vi.fn()
    window.addEventListener("goal-mate:data-changed", changed)
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const date = init?.method ? "2026-08-23" : getRequestedDate(url)
      if (init?.method === "POST") {
        created = true
        return jsonResponse(scheduledBlock({ action_id: null, title: "上线产品" }))
      }
      return jsonResponse(todayView(date, created ? [scheduledBlock({ action_id: null, title: "上线产品" })] : [], [planCandidate]))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    expect((await screen.findAllByText("上线产品")).length).toBeGreaterThan(0)
    const trigger = screen.getByRole("button", { name: "安排到今天" })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "安排时间块" })).toBeNull())
    expect(document.activeElement).toBe(trigger)
    expect(fetchMock.mock.calls.filter(call => !call[1]?.method)).toHaveLength(2)
    expect(changed).toHaveBeenCalledTimes(1)
    expect((changed.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ entity: "schedule-block" })
    window.removeEventListener("goal-mate:data-changed", changed)
  })

  it("keeps the editor and create key after a successful write whose refetch fails", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "refetch-key") })
    let getCount = 0
    const keys: string[] = []
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        keys.push(new Headers(init.headers).get("Idempotency-Key") ?? "")
        return jsonResponse(scheduledBlock({ action_id: null, title: "上线产品" }))
      }
      getCount += 1
      if (getCount === 2) return jsonResponse({ error: "刷新失败" }, 500)
      return jsonResponse(todayView(getRequestedDate(url), [], [planCandidate]))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await screen.findByRole("button", { name: "安排到今天" })
    fireEvent.click(screen.getByRole("button", { name: "安排到今天" }))
    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))
    const editor = screen.getByRole("dialog", { name: "安排时间块" })
    expect((await within(editor).findByRole("alert")).textContent).toContain("修改已保存，但今日数据刷新失败")

    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "安排时间块" })).toBeNull())
    expect(keys).toEqual(["refetch-key", "refetch-key"])
  })

  it("sends versioned update, cancel, and completion bodies and keeps scoped 409 dialogs open", async () => {
    const requestBodies: Record<string, unknown>[] = []
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return jsonResponse(todayView(getRequestedDate(url), [scheduledBlock()], [planCandidate]))
      requestBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return jsonResponse({ error: "版本已过期", code: "STALE_VERSION" }, 409)
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)
    await screen.findByText("写发布说明")

    fireEvent.click(screen.getByRole("button", { name: "编辑 写发布说明" }))
    const editor = screen.getByRole("dialog", { name: "编辑时间块" })
    fireEvent.click(within(editor).getByRole("button", { name: "保存时间" }))
    expect((await within(editor).findByRole("alert")).textContent).toContain("版本已过期")
    expect(requestBodies[0]).toEqual(expect.objectContaining({
      operation: "update",
      block_id: "block_copy",
      expected_version: 2,
    }))

    fireEvent.click(within(editor).getByRole("button", { name: "取消此时间块" }))
    fireEvent.click(within(editor).getByRole("button", { name: "确认取消" }))
    await waitFor(() => expect(requestBodies).toHaveLength(2))
    expect(requestBodies[1]).toEqual({ operation: "cancel", block_id: "block_copy", expected_version: 2 })
    fireEvent.click(within(editor).getAllByRole("button", { name: "关闭" }).at(-1) as HTMLElement)

    fireEvent.click(screen.getByRole("button", { name: "完成 写发布说明" }))
    const completion = screen.getByRole("dialog", { name: "记录时间块结果" })
    fireEvent.click(within(completion).getByRole("radio", { name: "部分完成" }))
    fireEvent.change(within(completion).getByLabelText("完成内容"), { target: { value: "完成了一半" } })
    fireEvent.click(within(completion).getByRole("button", { name: "保存结果" }))
    expect((await within(completion).findByRole("alert")).textContent).toContain("版本已过期")
    expect(requestBodies[2]).toEqual(expect.objectContaining({
      block_id: "block_copy",
      expected_version: 2,
      outcome: "partial",
      content: "完成了一半",
    }))
  })
})
