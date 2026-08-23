// @vitest-environment jsdom

import { readFileSync } from "node:fs"
import path from "node:path"
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

vi.mock("./workspace/workspace-sidebar-controller", () => ({
  WorkspaceSidebarController: () => <aside>目标工作台</aside>,
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

  it("uses the shared page frame on every management route", () => {
    const pageSources = ["goals", "plans", "progress", "reports"].map(route => (
      readFileSync(path.join(process.cwd(), "src", "app", route, "page.tsx"), "utf8")
    ))

    for (const source of pageSources) {
      expect(source).toContain("<AppPage")
      expect(source).toContain("<PageHeader")
      expect(source).not.toContain("返回首页")
    }
  })

  it("targets the custom Copilot composer DOM instead of unused default classes", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "components", "chat-wrapper.module.css"), "utf8")

    expect(source).toContain(":global(.copilotKitInput > textarea)")
    expect(source).toContain(":global(.copilotKitInputControlButton)")
    expect(source).not.toContain(":global(.copilotKitInputTextarea)")
    expect(source).not.toContain(":global(.copilotKitInputButton)")
  })

  it("keeps authentication and account controls in the shared violet-stone palette", () => {
    const loginSource = readFileSync(path.join(process.cwd(), "src", "components", "LoginForm.tsx"), "utf8")
    const menuSource = readFileSync(path.join(process.cwd(), "src", "components", "UserMenu.tsx"), "utf8")

    expect(loginSource).toContain("bg-stone-50")
    expect(loginSource).toContain("bg-violet-600")
    expect(loginSource).not.toContain("from-blue-50")
    expect(menuSource).toContain("bg-violet-600")
    expect(menuSource).not.toContain("bg-blue-500")
  })
})
