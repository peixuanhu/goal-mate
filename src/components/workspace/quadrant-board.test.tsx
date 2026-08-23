// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { QuadrantBoard } from "./quadrant-board"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  push.mockReset()
})

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

describe("QuadrantBoard", () => {
  it("renders four blocks and keeps completed plans struck through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      q1: [{
        plan_id: "plan_done",
        name: "完成发布",
        progress: 1,
        is_recurring: false,
        recurrence_type: null,
        recurrence_value: null,
        tags: ["发布"],
        progressRecords: [],
      }],
      q2: [],
      q3: [],
      q4: [],
    })))

    render(<QuadrantBoard />)

    expect(await screen.findByRole("region", { name: "重要且紧急" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "重要不紧急" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "紧急不重要" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "不重要不紧急" })).toBeTruthy()
    expect(screen.getByText("完成发布").className).toContain("line-through")
  })

  it("removes a plan through the priority endpoint and refreshes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        q1: [{
          plan_id: "plan_done",
          name: "完成发布",
          progress: 1,
          is_recurring: false,
          recurrence_type: null,
          recurrence_value: null,
          tags: [],
          progressRecords: [],
        }],
        q2: [],
        q3: [],
        q4: [],
      }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ q1: [], q2: [], q3: [], q4: [] }))
    vi.stubGlobal("fetch", fetchMock)

    render(<QuadrantBoard />)
    fireEvent.click(await screen.findByRole("button", { name: "移出四象限 完成发布" }))

    await waitFor(() => expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/plan/priority", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({
        plan_id: "plan_done",
        priority_quadrant: null,
        is_scheduled: false,
      }),
    })))
  })
})
