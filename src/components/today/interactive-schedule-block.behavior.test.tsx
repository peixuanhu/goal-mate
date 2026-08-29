// @vitest-environment jsdom

import { DndContext } from "@dnd-kit/core"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, expect, it, vi } from "vitest"

import type { ScheduleBlockView } from "@/lib/today/types"

import { InteractiveScheduleBlock } from "./interactive-schedule-block"

afterEach(cleanup)

const block: ScheduleBlockView = {
  block_id: "block_drag",
  plan_id: "plan_drag",
  action_id: null,
  title: "拖动时间块",
  goal_id: null,
  goal_name: null,
  energy_level: "medium",
  start_at: "2026-08-29T05:45:00.000Z",
  end_at: "2026-08-29T06:15:00.000Z",
  status: "scheduled",
  source: "manual",
  version: 1,
}

it("keeps the source scheduled block anchored while the timeline preview represents a drag", async () => {
  render(
    <DndContext>
      <InteractiveScheduleBlock
        block={block}
        disabled={false}
        localRange={{ start: 825, end: 855 }}
        onComplete={vi.fn()}
        onEdit={vi.fn()}
        onResizePointerDown={vi.fn()}
        statusClassName="border-violet-200 bg-violet-100/95 text-violet-950"
        statusLabel="已安排"
        style={{ top: "25%", height: "10%", minHeight: 48 }}
      />
    </DndContext>,
  )

  const moveButton = screen.getByRole("button", { name: "移动 拖动时间块" })
  const sourceBlock = screen.getByRole("article", { name: "拖动时间块，已安排" })

  fireEvent.keyDown(moveButton, { code: "Space", key: " " })
  fireEvent.keyDown(moveButton, { code: "ArrowDown", key: "ArrowDown" })

  await waitFor(() => expect(sourceBlock.className).toContain("opacity-60"))
  expect(sourceBlock.style.top).toBe("25%")
  expect(sourceBlock.style.transform).toBe("")

  fireEvent.keyDown(document, { code: "Escape", key: "Escape" })
})
