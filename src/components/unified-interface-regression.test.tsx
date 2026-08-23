// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppHeader } from "./app-header"
import { PageHeader } from "./app-page"
import { ChatWrapper } from "./chat-wrapper"
import { MainLayout } from "./main-layout"

vi.mock("next/navigation", () => ({
  usePathname: () => "/plans",
}))

vi.mock("./UserMenu", () => ({
  default: () => <button type="button">用户菜单</button>,
}))

vi.mock("@copilotkit/react-ui", () => ({
  CopilotChat: () => <div data-testid="copilot-chat-double" />,
}))

vi.mock("./copilot-clearing-input", () => ({
  CopilotClearingInput: () => null,
}))

vi.mock("./quadrant-left-sidebar", () => ({
  QuadrantLeftSidebar: () => <aside>四象限侧栏</aside>,
}))

afterEach(cleanup)

describe("unified interface foundations", () => {
  it("uses one route-aware primary navigation", () => {
    render(<AppHeader />)

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "今天" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "目标" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "计划" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "进展" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "回顾" })).toBeTruthy()
  })

  it("gives management pages one title hierarchy and action slot", () => {
    render(
      <PageHeader
        actions={<button type="button">新建计划</button>}
        description="把目标拆成可执行的下一步。"
        eyebrow="Plan workspace"
        title="全部计划"
      />,
    )

    expect(screen.getByText("Plan workspace")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "全部计划" })).toBeTruthy()
    expect(screen.getByText("把目标拆成可执行的下一步。")).toBeTruthy()
    expect(screen.getByRole("button", { name: "新建计划" })).toBeTruthy()
  })

  it("uses the same AI mode switch in the management layout", () => {
    render(<MainLayout><div>页面内容</div></MainLayout>)

    expect(screen.getByRole("tab", { name: "AI 检查" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "AI 聊天" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "打开 AI 助手" })).toBeTruthy()
  })

  it("scopes CopilotKit styling to the Goal Mate chat surface", async () => {
    render(<ChatWrapper />)

    expect(await screen.findByTestId("goal-mate-chat")).toBeTruthy()
    expect(screen.getByTestId("copilot-chat-double")).toBeTruthy()
  })
})
