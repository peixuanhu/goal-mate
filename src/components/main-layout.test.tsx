// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MainLayout } from "./main-layout"

vi.mock("./workspace/global-header", () => ({
  GlobalHeader: () => <header>全局导航</header>,
}))

vi.mock("./workspace/workspace-sidebar-controller", () => ({
  WorkspaceSidebarController: ({ date }: { date?: string | null }) => <aside>共享工作台 {date}</aside>,
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
  })
})
