// @vitest-environment jsdom

import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Combobox } from "./combobox"

afterEach(cleanup)

describe("Combobox selection modes", () => {
  it("defaults to existing options and rejects unmatched input by click and Enter", () => {
    const onChange = vi.fn()
    render(<Combobox options={["已有计划"]} value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "财务报表" } })

    expect(screen.queryByText(/新建标签/)).toBeNull()
    fireEvent.mouseDown(screen.getByText("没有匹配项"))
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("filters and selects existing options", () => {
    const onChange = vi.fn()
    render(<Combobox options={["财务报表", "阅读"]} value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "财务" } })
    expect(screen.queryByText("阅读")).toBeNull()
    fireEvent.mouseDown(screen.getByText("财务报表"))
    expect(onChange).toHaveBeenCalledWith("财务报表")
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it.each(["click", "Enter"])("allows explicit tag creation via %s", action => {
    const onChange = vi.fn()
    render(<Combobox options={["工作"]} value="" onChange={onChange} allowCustomOption />)
    fireEvent.click(screen.getByRole("button"))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "财务报表" } })
    const create = screen.getByText('新建标签 "财务报表"')
    if (action === "click") fireEvent.mouseDown(create)
    else fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    expect(onChange).toHaveBeenCalledWith("财务报表")
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("uses a domain-specific empty message when custom options are disabled", () => {
    render(<Combobox options={[]} value="" onChange={vi.fn()} allowCustomOption={false} emptyMessage="没有匹配的目标" />)
    fireEvent.click(screen.getByRole("button"))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "不存在的目标" } })
    expect(screen.getByText("没有匹配的目标")).toBeTruthy()
    expect(screen.queryByText(/新建标签/)).toBeNull()
  })
})
