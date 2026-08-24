/* @vitest-environment jsdom */

import React, { useState } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PlanTimeBudgetFields } from "./plan-time-budget-fields"

const ordinaryProps = {
  isRecurring: false,
  estimatedMinutes: "300",
  defaultBlockMinutes: null,
  globalDefaultBlockMinutes: 60,
  investedMinutes: 105,
  reservedActionMinutes: 90,
  onEstimatedMinutesChange: vi.fn(),
  onDefaultBlockMinutesChange: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("PlanTimeBudgetFields", () => {
  it("shows an ordinary total, inherited block length, and budget summary", () => {
    render(<PlanTimeBudgetFields {...ordinaryProps} />)

    expect((screen.getByLabelText("总预计投入（分钟）") as HTMLInputElement).value).toBe("300")
    expect((screen.getByLabelText("默认单块时长（分钟）") as HTMLInputElement).value).toBe("60")
    expect(screen.getByLabelText("总预计投入（分钟）").hasAttribute("required")).toBe(true)
    expect(screen.getByText("已投入 105 分钟")).toBeTruthy()
    expect(screen.getByText("剩余 195 分钟")).toBeTruthy()
    expect(screen.getByText("行动项已预留 90 分钟")).toBeTruthy()
    expect(screen.getByText("继承全局默认 60 分钟")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "恢复全局默认" })).toBeNull()
  })

  it("shows only a per-occurrence duration for recurring plans", () => {
    render(
      <PlanTimeBudgetFields
        {...ordinaryProps}
        isRecurring
        estimatedMinutes=""
        defaultBlockMinutes="45"
      />,
    )

    expect(screen.queryByLabelText("总预计投入（分钟）")).toBeNull()
    expect((screen.getByLabelText("每次时长（分钟）") as HTMLInputElement).value).toBe("45")
  })

  it("turns editing an inherited value into an explicit override", () => {
    function ControlledFields() {
      const [defaultBlockMinutes, setDefaultBlockMinutes] = useState<string | null>(null)
      return (
        <PlanTimeBudgetFields
          {...ordinaryProps}
          defaultBlockMinutes={defaultBlockMinutes}
          onDefaultBlockMinutesChange={setDefaultBlockMinutes}
        />
      )
    }

    render(<ControlledFields />)
    fireEvent.change(screen.getByLabelText("默认单块时长（分钟）"), {
      target: { value: "45" },
    })

    expect((screen.getByLabelText("默认单块时长（分钟）") as HTMLInputElement).value).toBe("45")
    expect(screen.getByRole("button", { name: "恢复全局默认" })).toBeTruthy()
  })

  it("can restore an explicit block length to the global default", () => {
    const onDefaultBlockMinutesChange = vi.fn()
    render(
      <PlanTimeBudgetFields
        {...ordinaryProps}
        defaultBlockMinutes="45"
        onDefaultBlockMinutesChange={onDefaultBlockMinutesChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "恢复全局默认" }))

    expect(onDefaultBlockMinutesChange).toHaveBeenCalledWith(null)
  })

  it("warns when invested time exceeds an edited total", () => {
    render(
      <PlanTimeBudgetFields
        {...ordinaryProps}
        estimatedMinutes="90"
        reservedActionMinutes={0}
      />,
    )

    expect(screen.getByText("剩余 0 分钟")).toBeTruthy()
    expect(screen.getByText("已投入时间超过当前预估")).toBeTruthy()
    expect(screen.queryByText("行动项预留时间超过剩余预算")).toBeNull()
  })

  it("can show both budget warnings when actions remain reserved after an overrun", () => {
    render(<PlanTimeBudgetFields {...ordinaryProps} estimatedMinutes="90" />)

    expect(screen.getByText("已投入时间超过当前预估")).toBeTruthy()
    expect(screen.getByText("行动项预留时间超过剩余预算")).toBeTruthy()
  })

  it("warns when action reservations exceed the uninvested budget", () => {
    render(<PlanTimeBudgetFields {...ordinaryProps} estimatedMinutes="180" />)

    expect(screen.getByText("行动项预留时间超过剩余预算")).toBeTruthy()
  })

  it.each(["", "invalid", "50"])(
    "uses 15-minute positive number inputs without inventing a remainder for invalid total %j",
    estimatedMinutes => {
      render(<PlanTimeBudgetFields {...ordinaryProps} estimatedMinutes={estimatedMinutes} />)

      expect(screen.getByLabelText("总预计投入（分钟）").getAttribute("type")).toBe("number")
      expect(screen.getByLabelText("总预计投入（分钟）").getAttribute("min")).toBe("15")
      expect(screen.getByLabelText("总预计投入（分钟）").getAttribute("step")).toBe("15")
      expect(screen.getByLabelText("默认单块时长（分钟）").getAttribute("min")).toBe("15")
      expect(screen.getByLabelText("默认单块时长（分钟）").getAttribute("step")).toBe("15")
      expect(screen.queryByText(/^剩余 \d+ 分钟$/)).toBeNull()
      expect(screen.queryByText("已投入时间超过当前预估")).toBeNull()
      expect(screen.queryByText("行动项预留时间超过剩余预算")).toBeNull()
    },
  )

  it("connects inputs to inherited guidance and a polite budget status region", () => {
    render(<PlanTimeBudgetFields {...ordinaryProps} estimatedMinutes="90" />)

    const totalInput = screen.getByLabelText("总预计投入（分钟）")
    const totalDescriptionId = totalInput.getAttribute("aria-describedby")
    expect(totalDescriptionId).toBeTruthy()
    expect(document.getElementById(String(totalDescriptionId))?.textContent).toContain("已投入 105 分钟")

    const status = screen.getByRole("status")
    expect(status.getAttribute("aria-live")).toBe("polite")
    expect(status.textContent).toContain("已投入时间超过当前预估")

    const blockInput = screen.getByLabelText("默认单块时长（分钟）")
    const blockDescriptionId = blockInput.getAttribute("aria-describedby")
    expect(blockDescriptionId).toBeTruthy()
    expect(document.getElementById(String(blockDescriptionId))?.textContent).toContain("继承全局默认 60 分钟")
  })
})
