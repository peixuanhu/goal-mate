// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { addDays, normalizeLocalDateInput } from "@/lib/focus-period-utils"
import type { ScheduleBlockView, SchedulableCandidate, TodayView } from "@/lib/today/types"

import { TodayWorkspace } from "./today-workspace"

vi.mock("@/components/UserMenu", () => ({
  default: () => null,
}))

vi.mock("./day-timeline", () => ({
  DayTimeline: ({ date }: { date: string }) => <section aria-label="时间线状态" data-date={date} />,
}))

vi.mock("./goal-candidate-panel", () => ({
  GoalCandidatePanel: ({
    candidates,
    error,
    loading,
  }: {
    candidates: SchedulableCandidate[]
    error: string | null
    loading: boolean
  }) => (
    <aside aria-label="候选面板" data-loading={String(loading)}>
      {error ? <p role="alert">{error}</p> : null}
      {candidates.map(candidate => <p key={candidate.id}>{candidate.name}</p>)}
    </aside>
  ),
}))

vi.mock("./ai-workspace", () => ({
  AiWorkspace: () => <aside aria-label="AI 面板" />,
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function requestedDate(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string {
  const requestUrl = String(fetchMock.mock.calls[callIndex]?.[0])
  const date = new URL(requestUrl, "http://localhost").searchParams.get("date")
  if (date === null) throw new Error(`fetch call ${callIndex} has no date`)
  return date
}

function todayView(date: string, candidateName: string, blocks: ScheduleBlockView[] = []): TodayView {
  return {
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
    candidates: [{
      kind: "plan",
      id: `plan-${date}`,
      plan_id: `plan-${date}`,
      action_id: null,
      goal_id: null,
      goal_name: null,
      name: candidateName,
      due_date: null,
      estimated_minutes: 30,
      energy_level: null,
      effective_quadrant: null,
      is_recurring: false,
      version: `${date}T00:00:00.000Z`,
    }],
    blocks,
    checks: [],
  }
}

function scheduleBlock(): ScheduleBlockView {
  return {
    block_id: "block_copy",
    plan_id: "plan_launch",
    action_id: "action_copy",
    title: "写发布说明",
    goal_id: "goal_product",
    goal_name: "发布 Goal Mate v1",
    energy_level: "medium",
    start_at: "2026-08-23T01:00:00.000Z",
    end_at: "2026-08-23T02:00:00.000Z",
    status: "scheduled",
    source: "manual",
    result_note: null,
    version: 2,
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

describe("TodayWorkspace behavior", () => {
  it("hydrates its date-neutral server snapshot before resolving the browser-local date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-23T23:30:00.000Z"))
    const serverHtml = renderToString(<TodayWorkspace />)

    expect(serverHtml).toContain("正在准备本地日期")
    expect(serverHtml).not.toContain("data-date=")

    const expectedLocalDate = normalizeLocalDateInput(new Date())
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)))
    const container = document.createElement("div")
    container.innerHTML = serverHtml
    document.body.append(container)
    const recoverableErrors: unknown[] = []
    let root: ReturnType<typeof hydrateRoot> | null = null

    await act(async () => {
      root = hydrateRoot(container, <TodayWorkspace />, {
        onRecoverableError: error => recoverableErrors.push(error),
      })
    })

    const timeline = screen.getByRole("region", { name: "时间线状态" })
    expect(timeline.getAttribute("data-date")).toBe(expectedLocalDate)
    expect(recoverableErrors).toEqual([])

    await act(async () => root?.unmount())
    container.remove()
  })

  it("keeps a newer success when an older request resolves last", async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "后一天" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const firstDate = requestedDate(fetchMock, 0)
    const secondDate = requestedDate(fetchMock, 1)
    await act(async () => {
      second.resolve(jsonResponse(todayView(secondDate, "较新的候选事项")))
      await second.promise
    })
    expect(await screen.findByText("较新的候选事项")).toBeTruthy()

    await act(async () => {
      first.resolve(jsonResponse(todayView(firstDate, "过期候选事项")))
      await first.promise
    })
    expect(screen.queryByText("过期候选事项")).toBeNull()
    expect(screen.getByText("较新的候选事项")).toBeTruthy()
  })

  it("keeps a newer success when an older request rejects last", async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "后一天" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const secondDate = requestedDate(fetchMock, 1)
    await act(async () => {
      second.resolve(jsonResponse(todayView(secondDate, "保留的新结果")))
      await second.promise
    })
    expect(await screen.findByText("保留的新结果")).toBeTruthy()

    await act(async () => {
      first.reject(new Error("过期请求失败"))
      await first.promise.catch(() => undefined)
    })
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByText("保留的新结果")).toBeTruthy()
  })

  it("rejects a successful response for a different requested date", async () => {
    const fetchMock = vi.fn((request: RequestInfo | URL) => {
      const date = new URL(String(request), "http://localhost").searchParams.get("date")
      if (date === null) throw new Error("missing request date")
      return Promise.resolve(jsonResponse(todayView(addDays(date, 1), "错误日期候选")))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("日期")
    expect(screen.queryByText("错误日期候选")).toBeNull()
  })

  it("accepts a response containing a fully normalized schedule block", async () => {
    const fetchMock = vi.fn((request: RequestInfo | URL) => {
      const date = new URL(String(request), "http://localhost").searchParams.get("date")
      if (date === null) throw new Error("missing request date")
      return Promise.resolve(jsonResponse(todayView(date, "带排期的候选", [scheduleBlock()])))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    expect(await screen.findByText("带排期的候选")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it.each([
    ["status", { status: "queued" }],
    ["source", { source: "robot" }],
    ["version", { version: 1.5 }],
    ["ISO instant", { start_at: "2026-08-23 09:00" }],
    ["impossible ISO instant", { start_at: "2026-02-30T01:00:00.000Z" }],
    ["required field", { title: null }],
  ])("rejects a response containing a schedule block with malformed %s", async (_label, malformed) => {
    const fetchMock = vi.fn((request: RequestInfo | URL) => {
      const date = new URL(String(request), "http://localhost").searchParams.get("date")
      if (date === null) throw new Error("missing request date")
      return Promise.resolve(jsonResponse({
        ...todayView(date, "不应显示的候选"),
        blocks: [{ ...scheduleBlock(), ...malformed }],
      }))
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TodayWorkspace />)

    expect((await screen.findByRole("alert")).textContent).toContain("今日数据格式无效")
    expect(screen.queryByText("不应显示的候选")).toBeNull()
  })

  it("aborts the active request when the workspace unmounts", async () => {
    const pending = deferred<Response>()
    const fetchMock = vi.fn((request: RequestInfo | URL, options?: RequestInit) => {
      void request
      void options
      return pending.promise
    })
    vi.stubGlobal("fetch", fetchMock)
    const { unmount } = render(<TodayWorkspace />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(requestOptions?.signal?.aborted).toBe(false)

    unmount()
    expect(requestOptions?.signal?.aborted).toBe(true)
  })
})
