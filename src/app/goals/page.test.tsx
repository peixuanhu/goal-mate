/* @vitest-environment jsdom */

import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const orderEditorState = vi.hoisted(() => ({ unavailable: false }))

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

vi.mock("@/components/ui/combobox", () => ({
  Combobox: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="标签选择" value={value} onChange={event => onChange(event.target.value)} />
  ),
}))

vi.mock("@/components/goals/goal-plan-list", () => ({
  GoalPlanList: () => <div>关联计划列表</div>,
}))

vi.mock("@/components/goals/goal-order-editor", () => ({
  GoalOrderEditor: ({ onDone }: { onDone: () => void }) => {
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

function setupFetch(total = 0) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith("/api/tag")) return jsonResponse([])
    if (url.startsWith("/api/goal")) return jsonResponse({ list: [], total })
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
})

afterEach(() => {
  cleanup()
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
