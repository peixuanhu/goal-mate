// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MainLayout } from "./main-layout"

vi.mock("./app-header", () => ({
  AppHeader: () => <header>全局导航</header>,
}))

vi.mock("./workspace/workspace-sidebar-controller", () => ({
  WorkspaceSidebarController: ({ date }: { date?: string | null }) => <aside>共享工作台 {date}</aside>,
}))

vi.mock("./today/goal-candidate-panel", () => ({
  GoalCandidatePanel: ({ candidates }: { candidates: Array<{ name: string }> }) => (
    <aside>今日共享快照 {candidates.map(candidate => candidate.name).join("、")}</aside>
  ),
}))

vi.mock("./today/ai-workspace", () => ({
  AiWorkspace: () => <aside>共享 AI</aside>,
}))

afterEach(cleanup)

describe("MainLayout", () => {
  it("renders one shared header, workspace sidebar, central page, and AI sidebar", () => {
    render(
      <MainLayout workspaceDate="2026-08-24">
        <section>页面内容</section>
      </MainLayout>,
    )

    expect(screen.getAllByText("全局导航")).toHaveLength(1)
    expect(screen.getByText("共享工作台 2026-08-24")).toBeTruthy()
    expect(screen.getByText("页面内容")).toBeTruthy()
    expect(screen.getByText("共享 AI")).toBeTruthy()
    expect(screen.getByRole("button", { name: "打开目标工作台" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "打开 AI 助手" })).toBeTruthy()

    const desktopWorkspace = screen.getByRole("complementary", { name: "目标工作台" })
    expect(desktopWorkspace.className).toContain("w-[380px]")
    expect(desktopWorkspace.className).toContain("xl:w-[400px]")

    fireEvent.click(screen.getByRole("button", { name: "打开目标工作台" }))
    const mobileWorkspace = screen.getByRole("dialog", { name: "目标工作台" })
    expect(mobileWorkspace.className).toContain("w-[min(92vw,400px)]")
  })

  it("uses a page-provided workspace snapshot without starting the shared controller", () => {
    render(
      <MainLayout
        workspaceSnapshot={{
          candidates: [{ name: "今日候选" }] as never,
          error: null,
          focus: null,
          loading: false,
        }}
      >
        <section>今日时间轴</section>
      </MainLayout>,
    )

    expect(screen.getByText("今日共享快照 今日候选")).toBeTruthy()
    expect(screen.queryByText(/共享工作台/)).toBeNull()
  })
})
