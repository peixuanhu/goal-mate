// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { GlobalHeader } from "./global-header"

vi.mock("next/navigation", () => ({
  usePathname: () => "/plans",
}))

vi.mock("@/components/UserMenu", () => ({
  default: () => <button type="button">用户菜单</button>,
}))

afterEach(cleanup)

describe("GlobalHeader", () => {
  it("renders all primary routes and marks the active page", () => {
    render(<GlobalHeader />)

    expect(screen.getByRole("link", { name: "今天" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "目标" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "计划" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "进展" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "回顾" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "用户菜单" })).toBeTruthy()
  })
})
