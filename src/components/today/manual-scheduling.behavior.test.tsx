// @vitest-environment jsdom

import { DndContext } from "@dnd-kit/core"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  PlanningPreferenceView,
  ScheduleBlockView,
  SchedulableCandidate,
  TodayView,
} from "@/lib/today/types"

import { DayTimeline } from "./day-timeline"
import { GoalCandidatePanel } from "./goal-candidate-panel"
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

const planCandidate: SchedulableCandidate = {
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

    expect(screen.getByText("当前时间")).toBeTruthy()
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
})

describe("TodayWorkspace manual scheduling orchestration", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "安排到今天" }))
    fireEvent.click(screen.getByRole("button", { name: "确认安排" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "安排时间块" })).toBeNull())
    expect(fetchMock.mock.calls.filter(call => !call[1]?.method)).toHaveLength(2)
    expect(changed).toHaveBeenCalledTimes(1)
    expect((changed.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ entity: "schedule-block" })
    window.removeEventListener("goal-mate:data-changed", changed)
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
