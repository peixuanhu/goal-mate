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

    const chatInput = screen.getByLabelText("聊天草稿") as HTMLInputElement
    const chatInstance = screen.getByTestId("chat-instance").textContent
    const chatPane = chatInput.closest('[role="tabpanel"]')

    expect(chatPane?.getAttribute("data-state")).toBe("inactive")
    expect(chatPane?.getAttribute("aria-hidden")).toBe("true")
    expect(chatPane?.className).toContain("invisible")
    expect(chatPane?.className).toContain("pointer-events-none")

    fireEvent.click(screen.getByRole("tab", { name: "AI 聊天" }))
    fireEvent.change(chatInput, { target: { value: "保留这段草稿" } })
    expect(chatInput.value).toBe("保留这段草稿")

    fireEvent.click(screen.getByRole("tab", { name: "AI 检查" }))
    expect(chatPane?.getAttribute("data-state")).toBe("inactive")
    expect(chatPane?.getAttribute("aria-hidden")).toBe("true")

    fireEvent.click(screen.getByRole("tab", { name: "AI 聊天" }))
    const chatInputAgain = screen.getByLabelText("聊天草稿") as HTMLInputElement
    expect(chatInputAgain).toBe(chatInput)
    expect(chatInputAgain.value).toBe("保留这段草稿")
    expect(screen.getByTestId("chat-instance").textContent).toBe(chatInstance)
  })
})
