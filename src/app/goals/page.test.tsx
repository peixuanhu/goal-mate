/* @vitest-environment jsdom */

import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  GoalOrderEditor: ({ onDone }: { onDone: () => void }) => (
    <div>
      <span>目标排序编辑器</span>
      <button type="button" onClick={onDone}>完成排序</button>
    </div>
  ),
}))

import GoalsPage from "./page"

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith("/api/tag")) return jsonResponse([])
    if (url.startsWith("/api/goal")) return jsonResponse({ list: [], total: 0 })
    throw new Error(`unexpected fetch: ${url}`)
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("GoalsPage sorting mode", () => {
  it("isolates goal ordering from ordinary goal management and restores the list when done", async () => {
    render(<GoalsPage />)

    await waitFor(() => expect(screen.getByRole("button", { name: "新增" })).toBeTruthy())
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
  })
})
