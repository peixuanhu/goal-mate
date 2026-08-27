/* @vitest-environment jsdom */

import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const orderEditorState = vi.hoisted(() => ({ unavailable: false }))
let currentSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
}))

vi.mock("@/components/AuthGuard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/main-layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/app-page", () => ({
  AppPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock("@/components/ui/wysiwyg-editor", () => ({
  WysiwygEditor: () => null,
}))

vi.mock("@/components/ui/text-preview", () => ({
  TextPreview: ({ text }: { text: string }) => <span>{text}</span>,
}))

vi.mock("@/components/ui/combobox", () => ({
  Combobox: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="标签选择" value={value} onChange={event => onChange(event.target.value)} />
  ),
}))

vi.mock("@/components/goals/goal-plan-list", () => ({
  GoalPlanList: () => <div>关联计划列表</div>,
}))

vi.mock("@/components/goals/goal-order-editor", () => ({
  GoalOrderEditor: ({
    onDone,
    onSavingChange,
  }: {
    onDone: () => void
    onSavingChange?: (saving: boolean) => void
  }) => {
    if (orderEditorState.unavailable) {
      return (
        <div>
          <span role="alert">目标排序编辑器加载失败</span>
          <button type="button" disabled>完成排序</button>
        </div>
      )
    }

    return (
      <div>
        <span>目标排序编辑器</span>
        <button type="button" onClick={onDone}>完成排序</button>
        <button type="button" onClick={() => onSavingChange?.(true)}>模拟开始保存</button>
        <button type="button" onClick={() => onSavingChange?.(false)}>模拟结束保存</button>
      </div>
    )
  },
}))

import GoalsPage from "./page"

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

type GoalFixture = {
  id: number
  goal_id: string
  tag: string
  name: string
  description: string
}

function setupFetch(total = 0, orderedGoals: GoalFixture[] = []) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith("/api/tag")) return jsonResponse([])
    if (url.startsWith("/api/goal")) {
      const params = new URLSearchParams(url.split("?")[1] ?? "")
      if (params.get("all") === "true") {
        return jsonResponse({ list: orderedGoals, total: orderedGoals.length })
      }
      if (orderedGoals.length > 0) {
        const pageNum = Number(params.get("pageNum") ?? "1")
        const pageSize = Number(params.get("pageSize") ?? "10")
        const start = (pageNum - 1) * pageSize
        return jsonResponse({ list: orderedGoals.slice(start, start + pageSize), total: orderedGoals.length })
      }
      return jsonResponse({ list: [], total })
    }
    throw new Error(`unexpected fetch: ${init?.method ?? "GET"} ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function ordinaryGoalReadUrls(fetchMock: ReturnType<typeof setupFetch>) {
  return fetchMock.mock.calls
    .filter(([input, init]) => {
      const url = String(input)
      return url.startsWith("/api/goal?")
        && !url.includes("all=true")
        && (init?.method ?? "GET") === "GET"
    })
    .map(([input]) => String(input))
}

beforeEach(() => {
  orderEditorState.unavailable = false
  currentSearchParams = new URLSearchParams()
})

afterEach(() => {
  cleanup()
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("GoalsPage sorting mode", () => {
  it("isolates goal ordering and reloads the first ordinary page when ordering completes", async () => {
    const fetchMock = setupFetch()
    render(<GoalsPage />)

    await waitFor(() => expect(screen.getByRole("button", { name: "新增" })).toBeTruthy())
    expect(ordinaryGoalReadUrls(fetchMock)).toHaveLength(1)
    expect(screen.getByText("目标清单与编辑")).toBeTruthy()
    expect(screen.getByText("搜索名称")).toBeTruthy()
    expect(screen.getByRole("button", { name: "上一页" })).toBeTruthy()

    const sortingButton = screen.getByRole("button", { name: "调整排序" })
    await waitFor(() => expect((sortingButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(sortingButton)

    expect(screen.getByText("调整目标顺序")).toBeTruthy()
    expect(screen.getByText("目标排序编辑器")).toBeTruthy()
    expect(screen.queryByText("搜索名称")).toBeNull()
    expect(screen.queryByRole("button", { name: "上一页" })).toBeNull()
    expect(screen.queryByRole("button", { name: "新增" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "完成排序" }))

    await waitFor(() => {
      expect(screen.getByText("目标清单与编辑")).toBeTruthy()
      expect(screen.getByText("搜索名称")).toBeTruthy()
      expect(screen.getByRole("button", { name: "上一页" })).toBeTruthy()
      expect(screen.getByRole("button", { name: "新增" })).toBeTruthy()
    })
    await waitFor(() => expect(ordinaryGoalReadUrls(fetchMock)).toHaveLength(2))
    expect(ordinaryGoalReadUrls(fetchMock).every(url => url.includes("pageNum=1"))).toBe(true)
  })

  it("keeps a page-level exit available when the order editor cannot complete", async () => {
    orderEditorState.unavailable = true
    const fetchMock = setupFetch()
    render(<GoalsPage />)

    const sortingButton = await screen.findByRole("button", { name: "调整排序" })
    await waitFor(() => expect((sortingButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(sortingButton)

    expect(screen.getByRole("alert").textContent).toContain("加载失败")
    expect((screen.getByRole("button", { name: "完成排序" }) as HTMLButtonElement).disabled).toBe(true)
    const exitButton = screen.getByRole("button", { name: "退出排序" }) as HTMLButtonElement
    expect(exitButton.disabled).toBe(false)
    fireEvent.click(exitButton)

    await waitFor(() => {
      expect(screen.getByText("目标清单与编辑")).toBeTruthy()
      expect(ordinaryGoalReadUrls(fetchMock)).toHaveLength(2)
    })
    expect(ordinaryGoalReadUrls(fetchMock).every(url => url.includes("pageNum=1"))).toBe(true)
  })

  it("disables the page-level exit only while an order save is pending", async () => {
    setupFetch()
    render(<GoalsPage />)

    const sortingButton = await screen.findByRole("button", { name: "调整排序" })
    await waitFor(() => expect((sortingButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(sortingButton)

    const exitButton = screen.getByRole("button", { name: "退出排序" }) as HTMLButtonElement
    expect(exitButton.disabled).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "模拟开始保存" }))

    const savingExitButton = screen.getByRole("button", { name: "正在保存排序…" }) as HTMLButtonElement
    expect(savingExitButton.disabled).toBe(true)
    fireEvent.click(savingExitButton)
    expect(screen.getByText("目标排序编辑器")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "模拟结束保存" }))
    const restoredExitButton = screen.getByRole("button", { name: "退出排序" }) as HTMLButtonElement
    expect(restoredExitButton.disabled).toBe(false)
    fireEvent.click(restoredExitButton)

    await waitFor(() => expect(screen.getByText("目标清单与编辑")).toBeTruthy())
  })

  it("returns from the second page to page one with exactly one new ordinary list request", async () => {
    const fetchMock = setupFetch(20)
    render(<GoalsPage />)

    const nextButton = await screen.findByRole("button", { name: "下一页" })
    await waitFor(() => expect((nextButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(nextButton)

    await waitFor(() => expect(ordinaryGoalReadUrls(fetchMock)).toHaveLength(2))
    expect(ordinaryGoalReadUrls(fetchMock)[1]).toContain("pageNum=2")

    const sortingButton = screen.getByRole("button", { name: "调整排序" })
    await waitFor(() => expect((sortingButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(sortingButton)
    fireEvent.click(screen.getByRole("button", { name: "退出排序" }))

    await waitFor(() => expect(ordinaryGoalReadUrls(fetchMock)).toHaveLength(3))
    expect(ordinaryGoalReadUrls(fetchMock).map(url => new URLSearchParams(url.split("?")[1]).get("pageNum")))
      .toEqual(["1", "2", "1"])
  })
})

describe("GoalsPage highlighted row", () => {
  it("keeps a newer highlighted page when the initial page response arrives last", async () => {
    currentSearchParams = new URLSearchParams("highlight=goal-11")
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    const goals = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      goal_id: `goal-${index + 1}`,
      tag: "长期",
      name: `目标 ${index + 1}`,
      description: "",
    }))
    let resolveFirstPage!: (response: Response) => void
    let markFirstPageRead!: () => void
    const firstPageResponse = new Promise<Response>(resolve => { resolveFirstPage = resolve })
    const firstPageRead = new Promise<void>(resolve => { markFirstPageRead = resolve })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/tag")) return jsonResponse([])
      if (url.includes("all=true")) return jsonResponse({ list: goals, total: goals.length })
      if (url.includes("pageNum=2")) return jsonResponse({ list: goals.slice(10), total: goals.length })
      if (url.startsWith("/api/goal?")) return firstPageResponse
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<GoalsPage />)
    await screen.findByText("目标 11")

    await act(async () => {
      resolveFirstPage({
        json: async () => {
          markFirstPageRead()
          return { list: goals.slice(0, 10), total: goals.length }
        },
      } as Response)
      await firstPageRead
    })

    expect(screen.getByText("目标 11")).toBeTruthy()
    expect(screen.queryByText("目标 1")).toBeNull()
  })

  it("loads the highlighted goal's page, scrolls its row, and does not enter edit mode", async () => {
    currentSearchParams = new URLSearchParams("highlight=goal-11")
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })
    const goals = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      goal_id: `goal-${index + 1}`,
      tag: "长期",
      name: `目标 ${index + 1}`,
      description: "",
    }))
    const fetchMock = setupFetch(goals.length, goals)

    render(<GoalsPage />)

    const row = (await screen.findByText("目标 11")).closest("tr")
    expect(row?.className).toContain("bg-yellow-100")
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" }))
    expect(ordinaryGoalReadUrls(fetchMock).some(url => url.includes("pageNum=2"))).toBe(true)
    expect((screen.getByLabelText("名称") as HTMLInputElement).value).toBe("")
    expect(screen.getByRole("button", { name: "新增" })).toBeTruthy()
  })

  it("falls back to the first page when the highlighted goal no longer exists", async () => {
    currentSearchParams = new URLSearchParams("highlight=missing-goal")
    const goals = [{ id: 1, goal_id: "goal-1", tag: "长期", name: "目标 1", description: "" }]
    const fetchMock = setupFetch(goals.length, goals)

    render(<GoalsPage />)

    await screen.findByText("目标 1")
    await waitFor(() => expect(ordinaryGoalReadUrls(fetchMock).some(url => url.includes("pageNum=1"))).toBe(true))
    expect(screen.queryByText("missing-goal")).toBeNull()
  })
})
