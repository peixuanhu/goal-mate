// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AiWorkspace } from "./ai-workspace"

vi.mock("@/components/chat-wrapper", async () => {
  const ReactModule = await import("react")
  let nextInstance = 0

  return {
    ChatWrapper: function StatefulChatDouble() {
      const [draft, setDraft] = ReactModule.useState("")
      const [instance] = ReactModule.useState(() => String(++nextInstance))

      return ReactModule.createElement(
        "label",
        null,
        "聊天草稿",
        ReactModule.createElement("input", {
          "aria-label": "聊天草稿",
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.currentTarget.value),
          value: draft,
        }),
        ReactModule.createElement("output", { "data-testid": "chat-instance" }, instance),
      )
    },
  }
})

afterEach(cleanup)

describe("AiWorkspace behavior", () => {
  it("keeps the same stateful chat DOM mounted across repeated tab switches", () => {
    render(<AiWorkspace />)

    const clickTab = (name: string) => {
      const tab = screen.getByRole("tab", { name })
      fireEvent.mouseDown(tab, { button: 0, ctrlKey: false })
      fireEvent.mouseUp(tab, { button: 0, ctrlKey: false })
      fireEvent.click(tab)
    }
    const getChatPane = () => screen.getByLabelText("聊天草稿").closest('[role="tabpanel"]')
    const getCheckPane = () => screen.getByText("今日检查将在排程阶段启用").closest('[role="tabpanel"]')
    const chatInput = screen.getByLabelText("聊天草稿") as HTMLInputElement
    const chatInstance = screen.getByTestId("chat-instance").textContent
    let chatPane = getChatPane()
    let checkPane = getCheckPane()

    expect(chatPane?.getAttribute("data-state")).toBe("inactive")
    expect(chatPane?.getAttribute("aria-hidden")).toBe("true")
    expect(chatPane?.hasAttribute("hidden")).toBe(true)
    expect(chatPane?.hasAttribute("inert")).toBe(true)
    expect(chatPane?.className).toContain("invisible")
    expect(chatPane?.className).toContain("pointer-events-none")
    expect(checkPane?.hasAttribute("hidden")).toBe(false)
    expect(checkPane?.hasAttribute("inert")).toBe(false)

    clickTab("AI 聊天")
    chatPane = getChatPane()
    checkPane = getCheckPane()
    expect(document.body.contains(chatInput)).toBe(true)
    expect(chatPane?.getAttribute("data-state")).toBe("active")
    expect(chatPane?.getAttribute("aria-hidden")).toBe("false")
    expect(chatPane?.hasAttribute("hidden")).toBe(false)
    expect(chatPane?.hasAttribute("inert")).toBe(false)
    expect(checkPane?.getAttribute("aria-hidden")).toBe("true")
    expect(checkPane?.hasAttribute("hidden")).toBe(true)
    expect(checkPane?.hasAttribute("inert")).toBe(true)
    fireEvent.change(chatInput, { target: { value: "保留这段草稿" } })
    expect(chatInput.value).toBe("保留这段草稿")

    clickTab("AI 检查")
    chatPane = getChatPane()
    checkPane = getCheckPane()
    expect(document.body.contains(chatInput)).toBe(true)
    expect(chatPane?.getAttribute("data-state")).toBe("inactive")
    expect(chatPane?.getAttribute("aria-hidden")).toBe("true")
    expect(chatPane?.hasAttribute("hidden")).toBe(true)
    expect(chatPane?.hasAttribute("inert")).toBe(true)
    expect(checkPane?.hasAttribute("hidden")).toBe(false)
    expect(checkPane?.hasAttribute("inert")).toBe(false)

    clickTab("AI 聊天")
    const chatInputAgain = screen.getByLabelText("聊天草稿") as HTMLInputElement
    chatPane = getChatPane()
    expect(chatInputAgain).toBe(chatInput)
    expect(chatInputAgain.value).toBe("保留这段草稿")
    expect(screen.getByTestId("chat-instance").textContent).toBe(chatInstance)
    expect(chatPane?.hasAttribute("hidden")).toBe(false)
    expect(chatPane?.hasAttribute("inert")).toBe(false)
  })
})
